import { execSync } from "node:child_process";
import os from "node:os";

const ACP_TIMEOUT = Number(process.env.ACP_TIMEOUT || 120000);
let cachedBase = null;
let cacheTime = 0;
let overrideBase = null; // Set when using session serve process
const CACHE_TTL = 30000; // re-discover every 30s

async function discoverAcpBase() {
  if (overrideBase) return overrideBase;
  if (cachedBase && Date.now() - cacheTime < CACHE_TTL) return cachedBase;
  // 1. Env var override
  if (process.env.CODEBUDDY_BASE) {
    cachedBase = process.env.CODEBUDDY_BASE;
    cacheTime = Date.now();
    return cachedBase;
  }
  // 2. Scan WorkBuddy processes for the main --serve process port
  try {
    const isWin = os.platform() === "win32";
    let out = "";
    if (isWin) {
      // Use PowerShell to get command lines of WorkBuddy processes
      out = execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='WorkBuddy.exe'\\" | ForEach-Object { $_.CommandLine }"`,
        { encoding: "utf8", timeout: 8000, windowsHide: true }
      );
    } else {
      out = execSync("ps aux | grep -i workbuddy", { encoding: "utf8", timeout: 5000 });
    }
    const lines = out.split(/\r?\n/);
    // Main serve process: has --serve and --port, but NO --session-id
    for (const line of lines) {
      if (line.includes("--serve") && line.includes("--port") && !line.includes("--session-id")) {
        const m = line.match(/--port\s+(\d+)/);
        if (m) {
          const port = parseInt(m[1]);
          cachedBase = `http://127.0.0.1:${port}`;
          cacheTime = Date.now();
          return cachedBase;
        }
      }
    }
    // Fallback: any --serve with --port (session-level serve)
    for (const line of lines) {
      if (line.includes("--serve") && line.includes("--port")) {
        const m = line.match(/--port\s+(\d+)/);
        if (m) {
          const port = parseInt(m[1]);
          cachedBase = `http://127.0.0.1:${port}`;
          cacheTime = Date.now();
          return cachedBase;
        }
      }
    }
  } catch {}
  // 3. Last resort: default port
  cachedBase = "http://127.0.0.1:18788";
  cacheTime = Date.now();
  return cachedBase;
}

function withTimeout(timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return { controller, timer };
}

async function postJson(path, body, headers = {}, timeout = 15000) {
  const base = await discoverAcpBase();
  const url = base + path;
  const { controller, timer } = withTimeout(timeout);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CodeBuddy-Request": "1",
        "Accept": "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: text };
  } finally {
    clearTimeout(timer);
  }
}

function parseSseEvents(text) {
  const events = [];
  for (const block of text.split(/\n\n+/)) {
    const lines = block.split(/\r?\n/);
    let event = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length) {
      const dataStr = dataLines.join("\n");
      let parsed;
      try { parsed = JSON.parse(dataStr); } catch { parsed = dataStr; }
      events.push({ event, data: parsed });
    }
  }
  return events;
}

export async function connectAcp() {
  const res = await postJson("/api/v1/acp/connect", {});
  if (res.status !== 200) throw new Error(`ACP connect failed: ${res.status} ${res.body}`);
  const parsed = JSON.parse(res.body);
  if (!parsed.connectionId) throw new Error("ACP connect: no connectionId");
  return { connectionId: parsed.connectionId, sessionToken: parsed.sessionToken || "" };
}

export async function initializeAcp(connId, sessionToken) {
  const headers = { "acp-connection-id": connId };
  if (sessionToken) headers["acp-session-token"] = sessionToken;
  const res = await postJson("/api/v1/acp", {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: 1, clientInfo: { name: "workbuddy-mobile-gateway", version: "0.1.0" }, capabilities: {} },
  }, headers, 15000);
  const events = parseSseEvents(res.body);
  const initResult = events.find(e => e.data?.id === 1 || e.data?.result);
  if (initResult?.data?.error) throw new Error(`ACP initialize error: ${JSON.stringify(initResult.data.error)}`);
  return initResult?.data?.result || { ok: true };
}

export async function loadSession(connId, sessionToken, sessionId, cwd) {
  const headers = { "acp-connection-id": connId };
  if (sessionToken) headers["acp-session-token"] = sessionToken;
  const res = await postJson("/api/v1/acp", {
    jsonrpc: "2.0", id: 2, method: "session/load",
    params: { sessionId, cwd: cwd || process.cwd(), mcpServers: [] },
  }, headers, 30000);
  if (res.status !== 200) {
    let errMsg = `HTTP ${res.status}`;
    try { const j = JSON.parse(res.body); if (j.message) errMsg += ": " + j.message; } catch { if (res.body) errMsg += ": " + res.body.slice(0, 200); }
    throw new Error(`ACP session/load failed: ${errMsg}`);
  }
  const events = parseSseEvents(res.body);
  const loadResult = events.find(e => e.data?.id === 2 && (e.data.result || e.data.error));
  if (loadResult?.data?.error) throw new Error(`ACP session/load error: ${JSON.stringify(loadResult.data.error)}`);
  return { sessionId, eventCount: events.length };
}

export async function promptSession(connId, sessionToken, sessionId, text, timeout = ACP_TIMEOUT) {
  const headers = { "acp-connection-id": connId };
  if (sessionToken) headers["acp-session-token"] = sessionToken;
  const res = await postJson("/api/v1/acp", {
    jsonrpc: "2.0", id: 3, method: "session/prompt",
    params: { sessionId, prompt: [{ type: "text", text }] },
  }, headers, timeout);
  // Check HTTP status - 429/500 etc means error
  if (res.status !== 200) {
    let errMsg = `HTTP ${res.status}`;
    try { const j = JSON.parse(res.body); if (j.message) errMsg += ": " + j.message; } catch { if (res.body) errMsg += ": " + res.body.slice(0, 200); }
    return { ok: false, sessionId, error: errMsg, eventCount: 0 };
  }
  const events = parseSseEvents(res.body);
  const promptResult = events.find(e => e.data?.id === 3 && (e.data.result || e.data.error));
  if (promptResult?.data?.error) {
    return { ok: false, sessionId, error: promptResult.data.error, eventCount: events.length };
  }
  // Check for refusal/error in result (ACP returns stopReason:"refusal" with errorMessage)
  if (promptResult?.data?.result) {
    const r = promptResult.data.result;
    const errMsg = r._meta?.["codebuddy.ai/errorMessage"] || r.error;
    if (r.stopReason === "refusal" || errMsg) {
      return { ok: false, sessionId, error: typeof errMsg === 'string' ? errMsg.slice(0, 300) : JSON.stringify(errMsg).slice(0, 300), eventCount: events.length };
    }
  }
  const sessionUpdates = events.filter(e => e.data?.method === "session/update");
  const assistantChunks = sessionUpdates
    .filter(e => e.data?.params?.update?.sessionUpdate === "agent_message_chunk")
    .map(e => e.data.params.update.content?.text || "")
    .filter(Boolean);
  const toolCalls = sessionUpdates
    .filter(e => e.data?.params?.update?.sessionUpdate === "tool_call")
    .map(e => ({
      toolName: e.data.params.update._meta?.["codebuddy.ai/toolName"],
      status: e.data.params.update.status,
    }));
  return {
    ok: true,
    sessionId,
    assistantReply: assistantChunks.join(""),
    toolCalls,
    eventCount: events.length,
    rawEventTypes: sessionUpdates.map(e => e.data?.params?.update?.sessionUpdate),
  };
}

// Cache: sessionId → port (for serve processes with --model)
const sessionServePorts = {};
// Cache: extracted MCP config from desktop serve process (user-level, reusable)
let cachedMcpConfig = null;
let cachedSettings = null;
let cachedSystemPromptFile = null;

async function ensureSessionServe(sessionId, cwd, model) {
  // Step 1: ALWAYS scan for desktop's serve process first (it has the correct, up-to-date model)
  // Skip cache — desktop may have changed model since last check
  try {
    const { execSync } = await import("node:child_process");
    const out = execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='WorkBuddy.exe'\\" | ForEach-Object { $_.CommandLine }"`, { encoding: "utf8", timeout: 8000, windowsHide: true });
    const lines = out.split(/\r?\n/);
    // Pass 1: Look for DESKTOP serve process (has --mcp-config) for this session
    for (const line of lines) {
      if (line.includes(sessionId) && line.includes("--port") && line.includes("--serve") && line.includes("--mcp-config")) {
        const portMatch = line.match(/--port\s+(\d+)/);
        if (portMatch) {
          const desktopPort = parseInt(portMatch[1]);
          try {
            const res = await fetch(`http://127.0.0.1:${desktopPort}/api/v1/acp/connect`, {
              method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
              signal: AbortSignal.timeout(3000),
            });
            if (res.ok) {
              sessionServePorts[sessionId] = desktopPort;
              return desktopPort;
            }
          } catch {}
        }
      }
    }
    // Pass 2: Extract MCP config + settings from any desktop serve process
    for (const line of lines) {
      if (!cachedMcpConfig && line.includes("--mcp-config") && line.includes("--serve")) {
        const mcpMatch = line.match(/--mcp-config\s+(".*?")\s*(?:--|$)/);
        if (mcpMatch) {
          try {
            let raw = mcpMatch[1];
            raw = raw.replace(/\\"/g, '"').replace(/^"|"$/g, '');
            const parsed = JSON.parse(raw);
            if (parsed.mcpServers && parsed.mcpServers["connector-proxy"]) {
              cachedMcpConfig = parsed;
            }
          } catch {}
        }
      }
      if (!cachedSettings && line.includes("--settings") && line.includes("--serve")) {
        const settingsMatch = line.match(/--settings\s+(".*?")\s*(?:--|$)/);
        if (settingsMatch) {
          try {
            let raw = settingsMatch[1].replace(/\\"/g, '"').replace(/^"|"$/g, '');
            cachedSettings = JSON.parse(raw);
          } catch {}
        }
      }
      if (!cachedSystemPromptFile && line.includes("--system-prompt-file") && line.includes("--serve")) {
        const spfMatch = line.match(/--system-prompt-file\s+("[^"]*")/);
        if (spfMatch) {
          cachedSystemPromptFile = spfMatch[1].replace(/^"|"$/g, '');
        }
      }
    }
  } catch {}
  // Step 2: Start new serve process with full tools + extracted MCP config
  const port = 53000 + Math.floor(Math.random() * 999);
  const { spawn } = await import("node:child_process");
  const fullTools = "Read,Write,Edit,MultiEdit,Glob,Grep,Bash,PowerShell,TaskCreate,TaskGet,TaskUpdate,TaskList,TaskStop,TaskOutput,WebFetch,WebSearch,Skill,SkillManage,AskUserQuestion,LSP,ImageGen,VideoGen,Agent,TeamCreate,TeamDelete,SendMessage,ToolSearch,DeferExecuteTool,EnterPlanMode,ExitPlanMode,ListMcpResources,ReadMcpResource";
  const args = [
    "C:\\Program Files\\WorkBuddy\\resources\\app.asar.unpacked\\cli\\bin\\codebuddy",
    "--serve", "--session-id", sessionId, "--model", model || "glm-5.2",
    "--port", String(port),
    "--permission-mode", "fullAccess",
    "--permission-mode-before-plan", "bypassPermissions",
    "--allowedTools", fullTools,
  ];
  // Inject MCP config from desktop (replace session ID in headers)
  if (cachedMcpConfig) {
    const mcpCopy = JSON.parse(JSON.stringify(cachedMcpConfig));
    const cp = mcpCopy.mcpServers["connector-proxy"];
    if (cp && cp.headers) {
      cp.headers["X-WorkBuddy-Session-Id"] = sessionId;
    }
    args.push("--mcp-config", JSON.stringify(mcpCopy), "--strict-mcp-config");
  }
  // Inject settings from desktop
  if (cachedSettings) {
    args.push("--settings", JSON.stringify(cachedSettings));
  } else {
    args.push("--settings", '{"language":"zh-CN"}');
  }
  // Inject system prompt file from desktop
  if (cachedSystemPromptFile) {
    args.push("--system-prompt-file", cachedSystemPromptFile);
  }
  const child = spawn("C:\\Program Files\\WorkBuddy\\WorkBuddy.exe", args,
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();
  // Wait for port to be ready
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/acp/connect`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        sessionServePorts[sessionId] = port;
        return port;
      }
    } catch {}
  }
  throw new Error(`Failed to start serve process for session ${sessionId}`);
}

export async function sendPrompt(sessionId, text, cwd, model) {
  const m = model || "glm-5.2";
  // Try once
  try {
    return await _doSendPrompt(sessionId, text, cwd, m);
  } catch (err) {
    // Connection error — serve process likely dead. Kill it, clear cache, retry once.
    const errMsg = String(err.message || err);
    if (errMsg.includes("fetch failed") || errMsg.includes("aborted") || errMsg.includes("ECONNREFUSED") || errMsg.includes("socket hang up")) {
      console.log(`[sendPrompt] ACP failed (${errMsg.slice(0, 80)}), killing serve and retrying...`);
      killSessionServe(sessionId);
      delete sessionServePorts[sessionId];
      // Wait a moment for port to free up
      await new Promise(r => setTimeout(r, 2000));
      return await _doSendPrompt(sessionId, text, cwd, m);
    }
    throw err;
  }
}

async function _doSendPrompt(sessionId, text, cwd, model) {
  const port = await ensureSessionServe(sessionId, cwd, model || "glm-5.2");
  overrideBase = `http://127.0.0.1:${port}`;
  const conn = await connectAcp();
  await initializeAcp(conn.connectionId, conn.sessionToken);
  await loadSession(conn.connectionId, conn.sessionToken, sessionId, cwd);
  const result = await promptSession(conn.connectionId, conn.sessionToken, sessionId, text);
  await deleteConnection(conn.connectionId, conn.sessionToken);
  overrideBase = null;
  return result;
}

// Kill Gateway-started serve processes for a session (don't touch desktop ones with --mcp-config)
function killSessionServe(sessionId) {
  try {
    const out = execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='WorkBuddy.exe'\\" | Where-Object { $_.CommandLine -like '*${sessionId}*' -and $_.CommandLine -notlike '*--mcp-config*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Output $_.ProcessId }"`, { encoding: "utf8", timeout: 8000, windowsHide: true });
    console.log(`[killSessionServe] Killed PIDs: ${out.trim()}`);
  } catch (err) {
    console.log(`[killSessionServe] Error: ${err.message}`);
  }
}

export async function createNewSession(cwd, model) {
  const conn = await connectAcp();
  await initializeAcp(conn.connectionId, conn.sessionToken);
  const headers = { "acp-connection-id": conn.connectionId };
  if (conn.sessionToken) headers["acp-session-token"] = conn.sessionToken;
  const res = await postJson("/api/v1/acp", {
    jsonrpc: "2.0", id: 5, method: "session/new",
    params: { cwd: cwd || process.cwd(), mcpServers: [], model: model || "glm-5.2" },
  }, headers, 30000);
  await deleteConnection(conn.connectionId, conn.sessionToken);
  const events = parseSseEvents(res.body);
  const newResult = events.find(e => e.data?.id === 5 && (e.data.result || e.data.error));
  if (newResult?.data?.error) throw new Error(`ACP session/new error: ${JSON.stringify(newResult.data.error)}`);
  const sessionId = newResult?.data?.result?.sessionId;
  if (!sessionId) throw new Error("ACP session/new: no sessionId returned");
  return { ok: true, sessionId };
}

export async function deleteConnection(connId, sessionToken) {
  const base = await discoverAcpBase();
  const headers = { "acp-connection-id": connId };
  if (sessionToken) headers["acp-session-token"] = sessionToken;
  try {
    await fetch(base + "/api/v1/acp", {
      method: "DELETE",
      headers: { ...headers, "X-CodeBuddy-Request": "1" },
    });
  } catch {}
}

export async function checkServe() {
  const base = await discoverAcpBase();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(base + "/api/v1/health", {
      headers: { "X-CodeBuddy-Request": "1" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const body = await res.text();
    // 200 = fully healthy, 401 = running but needs auth (still "ready")
    return { ok: res.status === 200 || res.status === 401, status: res.status, data: JSON.parse(body), base };
  } catch (err) {
    return { ok: false, error: String(err.message || err), base };
  }
}
