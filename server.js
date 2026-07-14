import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import zlib from "node:zlib";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
let LevelModule = null;
try { LevelModule = require(path.join(os.homedir(), ".workbuddy/binaries/node/workspace/node_modules/level")); } catch {}
try { if (!LevelModule) LevelModule = require("level"); } catch {}
import { listNativeSessions, getNativeSession, readSessionMessages, readSessionTasks, readSessionArtifacts, readSessionMilestones, readArtifactFile, touchSession, deleteSession, renameSession, insertSession, appendUserMessage, appendAssistantMessage, getCreditUsage, getCurrentUserId, listWorkspaces, listSkills } from "./native-workbuddy.js";
import { sendPrompt, checkServe, createNewSession } from "./acp-bridge.js";
import { startRelay, sendRelayEvent, loadRelayConfig, isRelayConnected } from "./relay-client.js";
import { initConnections, getConnections, getRegistryPageUrl, stopCloudflareTunnel } from "./connection-manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, "..");
const MEMORY_DIR = path.join(WORKSPACE, ".workbuddy", "memory");
const DATA_DIR = path.join(__dirname, "data");
const TOKEN_FILE = path.join(DATA_DIR, "token.txt");
const INBOX_FILE = path.join(DATA_DIR, "phone-inbox.jsonl");
const OUTBOX_FILE = path.join(DATA_DIR, "phone-outbox.jsonl");
const EVENTS_FILE = path.join(DATA_DIR, "bridge-events.jsonl");
const PENDING_FILE = path.join(DATA_DIR, "pending-workbuddy-command.json");
const ACCESS_LOG = path.join(__dirname, "access.log");
const SESSION_MODELS_FILE = path.join(DATA_DIR, "session-models.json");
const sessionModels = loadSessionModels(); // sessionId → model name (persisted)
const PORT = Number(process.env.WB_REMOTE_PORT || 18787);
const HOST = process.env.WB_REMOTE_HOST || "0.0.0.0";
fs.mkdirSync(DATA_DIR, { recursive: true });
function loadSessionModels() {
  try {
    const f = path.join(DATA_DIR, "session-models.json");
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {}
  return {};
}
function saveSessionModels() {
  try { fs.writeFileSync(SESSION_MODELS_FILE, JSON.stringify(sessionModels, null, 2), "utf8"); } catch {}
}
const TOKEN = fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, "utf8").trim() : crypto.randomBytes(18).toString("hex");
if (!fs.existsSync(TOKEN_FILE)) fs.writeFileSync(TOKEN_FILE, TOKEN);
const startedAt = new Date();
const clients = new Set();
const messages = [
  { role: "assistant", content: "真实观察版 Gateway 已启动。现在能读取工作区记忆、访问日志和手机指令收件箱；真实 WorkBuddy 内部任务流还需要后续接口接入。" }
];

// Send Ctrl+R to WorkBuddy window to refresh its UI
function refreshWorkBuddyUI() {
  const scriptPath = path.join(__dirname, "refresh-ui.ps1");
  try {
    spawn("powershell", ["-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      detached: false, stdio: "ignore", windowsHide: true,
    }).unref();
  } catch {}
}

// Read pinned sessions from WorkBuddy LocalStorage (leveldb) via standalone CJS script
let pinnedCache = null;
let pinnedCacheTime = 0;
function getPinnedSessionsFromLevelDB(userId) {
  if (pinnedCache && Date.now() - pinnedCacheTime < 30000) return pinnedCache;
  const scriptPath = path.join(__dirname, "pinned-reader.cjs");
  try {
    const { execFileSync } = require("node:child_process");
    const args = userId ? [scriptPath, userId] : [scriptPath];
    const out = execFileSync(process.execPath, args, {
      encoding: "utf8", timeout: 10000, windowsHide: true,
    });
    pinnedCache = JSON.parse(out || "[]");
    pinnedCacheTime = Date.now();
    return pinnedCache;
  } catch (err) {
    pinnedCache = [];
    return pinnedCache;
  }
}

function getTailscaleIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const items of Object.values(nets)) {
    for (const item of items || []) {
      if (item.address.startsWith("100.") || item.address.startsWith("fd7a:115c:a1e0:")) ips.push(item.address);
    }
  }
  return ips;
}

function readTextSafe(file, max = 12000) {
  try {
    if (!fs.existsSync(file)) return "";
    const text = fs.readFileSync(file, "utf8");
    return text.length > max ? text.slice(-max) : text;
  } catch {
    return "";
  }
}

function todayMemoryFile() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return path.join(MEMORY_DIR, `${yyyy}-${mm}-${dd}.md`);
}

function readRecentMemory() {
  const files = fs.existsSync(MEMORY_DIR)
    ? fs.readdirSync(MEMORY_DIR).filter(f => f.endsWith(".md")).sort().slice(-5)
    : [];
  return files.map(name => ({ name, content: readTextSafe(path.join(MEMORY_DIR, name), 8000) }));
}

function readInbox() {
  const text = readTextSafe(INBOX_FILE, 20000);
  return text.split(/\r?\n/).filter(Boolean).slice(-50).map(line => {
    try { return JSON.parse(line); } catch { return { raw: line }; }
  });
}

function readJsonlFile(file, max = 50) {
  const text = readTextSafe(file, 30000);
  return text.split(/\r?\n/).filter(Boolean).slice(-max).map(line => {
    try { return JSON.parse(line); } catch { return { raw: line }; }
  });
}

function readPendingCommand() {
  try {
    if (!fs.existsSync(PENDING_FILE)) return null;
    return JSON.parse(fs.readFileSync(PENDING_FILE, "utf8"));
  } catch {
    return null;
  }
}

function buildTasks() {
  const memory = readRecentMemory();
  const latest = memory[memory.length - 1]?.content?.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || "暂无工作区记忆";
  const inbox = readInbox();
  const outbox = readJsonlFile(OUTBOX_FILE);
  const pending = readPendingCommand();
  const access = readTextSafe(ACCESS_LOG, 4000).trim().split(/\r?\n/).filter(Boolean);
  return [
    {
      id: "gateway-status",
      title: "Windows 远控 Gateway",
      status: "running",
      mode: "Observe",
      updatedAt: new Date().toISOString(),
      lastMessage: `服务运行中，Tailscale IP：${getTailscaleIps().join(", ") || "未检测到"}`
    },
    {
      id: "workspace-memory",
      title: "WorkBuddy 工作区记忆观察",
      status: "running",
      mode: "ReadOnly",
      updatedAt: new Date().toISOString(),
      lastMessage: latest
    },
    {
      id: "phone-inbox",
      title: "手机指令收件箱",
      status: inbox.length ? "running" : "paused",
      mode: "Bridge",
      updatedAt: new Date().toISOString(),
      lastMessage: inbox.length ? `已收到 ${inbox.length} 条手机指令，最新：${inbox[inbox.length - 1].content || "空"}` : "还没有手机指令"
    },
    {
      id: "bridge-outbox",
      title: "后台桥接处理结果",
      status: outbox.length ? "running" : "paused",
      mode: "Watcher",
      updatedAt: new Date().toISOString(),
      lastMessage: outbox.length ? `已处理 ${outbox.length} 条，最新：${outbox[outbox.length - 1].reply || "无结果"}` : "等待 watcher 处理手机指令"
    },
    {
      id: "pending-workbuddy",
      title: "WorkBuddy 待处理队列",
      status: pending ? "waiting_approval" : "paused",
      mode: "Pending",
      updatedAt: new Date().toISOString(),
      lastMessage: pending ? `待接入真实 WorkBuddy 执行：${pending.content}` : "暂无待处理 WorkBuddy 指令"
    },
    {
      id: "access-log",
      title: "手机访问日志",
      status: access.length ? "running" : "paused",
      mode: "Audit",
      updatedAt: new Date().toISOString(),
      lastMessage: access.length ? access[access.length - 1] : "暂无访问日志"
    }
  ];
}

function isAllowedRemote(req) {
  const raw = req.socket.remoteAddress || "";
  const normalized = raw.replace(/^::ffff:/, "").toLowerCase();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const auth = req.headers.authorization || "";
  const queryToken = url.searchParams.get("token");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const hasValidToken = queryToken === TOKEN || bearer === TOKEN;
  const line = `[${new Date().toISOString()}] ${req.method} ${req.url} from ${raw} token=${hasValidToken ? "ok" : "none"}`;
  console.log(line);
  try { fs.appendFileSync(ACCESS_LOG, line + "\n"); } catch {}
  if (hasValidToken) return true;
  if (normalized === "::1" || normalized === "127.0.0.1") return true;
  if (normalized.startsWith("100.")) return true;
  if (normalized.startsWith("fd7a:115c:a1e0:")) return true;
  if (normalized.startsWith("::ffff:100.")) return true;
  return false;
}

function sendJson(res, code, data) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (err) { reject(err); }
    });
  });
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
  // 同时转发到 relay（如果有连接）
  sendRelayEvent(event, data);
}

function requireToken(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const auth = req.headers.authorization || "";
  const queryToken = url.searchParams.get("token");
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (queryToken === TOKEN || bearer === TOKEN) return true;
  sendJson(res, 401, { error: "UNAUTHORIZED", hint: "Missing or invalid token." });
  return false;
}

function serveFile(res, file) {
  const full = path.join(__dirname, "public", file);
  if (!fs.existsSync(full)) return sendJson(res, 404, { error: "NOT_FOUND" });
  const ext = path.extname(full).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
  };
  const type = types[ext] || "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
  if (!isAllowedRemote(req)) return sendJson(res, 403, { error: "FORBIDDEN", hint: "Only localhost, Tailscale, or valid token clients are allowed." });
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/health") return sendJson(res, 200, { ok: true, port: PORT, token: TOKEN, ips: getTailscaleIps(), startedAt, time: new Date().toISOString() });
  if (url.pathname === "/" || url.pathname === "/index.html") return serveFile(res, "index.html");
  if (url.pathname === "/sw.js") return serveFile(res, "sw.js");
  if (url.pathname === "/html2canvas.min.js") return serveFile(res, "html2canvas.min.js");
  if (url.pathname === "/manifest.json" || url.pathname === "/manifest.webmanifest") return serveFile(res, "manifest.json");
  if (url.pathname === "/logo.png" || url.pathname === "/claw-cat.png") return serveFile(res, url.pathname.slice(1));
  if (url.pathname.match(/^\/icon-\d+\.(png|jpg|svg)$/)) return serveFile(res, url.pathname.slice(1));

  if (url.pathname.startsWith("/api/") && !requireToken(req, res)) return;

  if (req.method === "GET" && url.pathname === "/api/version") {
    try {
      const ver = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8"));
      return sendJson(res, 200, ver);
    } catch { return sendJson(res, 200, { version: "unknown" }); }
  }
  if (req.method === "GET" && url.pathname === "/api/connections") {
    return sendJson(res, 200, getConnections(PORT, TOKEN, DATA_DIR));
  }
  if (req.method === "GET" && url.pathname === "/api/qrcode") {
    const qrPath = path.join(DATA_DIR, "qrcode.png");
    if (fs.existsSync(qrPath)) {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(qrPath));
    }
    return sendJson(res, 404, { error: "QR_NOT_FOUND" });
  }
  if (req.method === "POST" && url.pathname === "/api/feedback") {
    const body = await readJson(req);
    // 收集系统信息
    const ver = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8")).version; } catch { return "unknown"; } })();
    const feedback = {
      ...body,
      gatewayVersion: ver,
      gatewayWorkspace: WORKSPACE,
      gatewayPort: PORT,
      receivedAt: new Date().toISOString(),
    };
    // 转发到 relay 服务器存储
    try {
      const regBody = JSON.stringify(feedback);
      const regUrl = new URL("https://wb.loveclaw.fun/api/feedback");
      await new Promise((resolve, reject) => {
        const req2 = https.request(regUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(regBody) },
          timeout: 5000,
        }, (res2) => { res2.resume(); res2.on("end", resolve); });
        req2.on("error", reject);
        req2.on("timeout", () => { req2.destroy(); reject(new Error("timeout")); });
        req2.write(regBody);
        req2.end();
      });
    } catch {}
    // 同时写本地文件
    try {
      const fbFile = path.join(DATA_DIR, "feedback.jsonl");
      fs.appendFileSync(fbFile, JSON.stringify(feedback) + "\n");
    } catch {}
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/api/check-update") {
    try {
      const localVer = JSON.parse(fs.readFileSync(path.join(__dirname, "version.json"), "utf8"));
      const release = JSON.parse(fs.readFileSync(path.join(__dirname, "release.json"), "utf8"));
      const hasUpdate = release.version && release.version !== localVer.version;
      return sendJson(res, 200, {
        current: localVer.version,
        latest: release.version || localVer.version,
        hasUpdate, url: release.url || "", notes: release.notes || "", releaseDate: release.releaseDate || ""
      });
    } catch (e) {
      return sendJson(res, 200, { current: "unknown", latest: "unknown", hasUpdate: false, error: e.message });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/status") {
    return sendJson(res, 200, { startedAt, uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000), ips: getTailscaleIps(), workspace: WORKSPACE });
  }
  // File upload endpoint - receive file from phone, save locally
  if (req.method === "POST" && url.pathname === "/api/upload") {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return sendJson(res, 400, { error: "Content-Type must be multipart/form-data" });
    }
    const boundary = contentType.split("boundary=")[1];
    if (!boundary) return sendJson(res, 400, { error: "No boundary found" });
    const UPLOAD_DIR = path.join(WORKSPACE, "phone-uploads");
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    // Parse multipart: find boundary parts
    const boundaryBuf = Buffer.from("--" + boundary);
    const parts = [];
    let start = 0;
    while (true) {
      const bIdx = buf.indexOf(boundaryBuf, start);
      if (bIdx === -1) break;
      const nextIdx = buf.indexOf(boundaryBuf, bIdx + boundaryBuf.length);
      if (nextIdx === -1) break;
      parts.push(buf.slice(bIdx + boundaryBuf.length, nextIdx));
      start = nextIdx;
    }
    let savedFile = null;
    for (const part of parts) {
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd === -1) continue;
      const header = part.slice(0, headerEnd).toString("utf8");
      const body = part.slice(headerEnd + 4, part.length - 2); // strip trailing \r\n
      const nameMatch = header.match(/name="([^"]+)"/);
      const fileMatch = header.match(/filename="([^"]+)"/);
      if (fileMatch && nameMatch) {
        const filename = fileMatch[1].replace(/[\\/:*?"<>|]/g, "_");
        const safeName = Date.now() + "_" + filename;
        const filePath = path.join(UPLOAD_DIR, safeName);
        fs.writeFileSync(filePath, body);
        savedFile = { field: nameMatch[1], filename, savedAs: safeName, path: filePath, size: body.length };
      }
    }
    if (savedFile) {
      return sendJson(res, 200, { ok: true, ...savedFile });
    }
    return sendJson(res, 400, { error: "No file found in upload" });
  }
  // Model list endpoint - extract models from WorkBuddy process command lines
  if (req.method === "GET" && url.pathname === "/api/models") {
    let models = null;
    let currentModel = "glm-5.2";
    // 1. Try data/models.json (user-specific list, auto-generated on first run)
    try {
      const mf = path.join(DATA_DIR, "models.json");
      if (fs.existsSync(mf)) {
        const mc = JSON.parse(fs.readFileSync(mf, "utf8"));
        if (Array.isArray(mc.models) && mc.models.length > 0) models = mc.models;
      }
    } catch {}
    // 2. Auto-detect: scan processes + read LevelDB preferences
    if (!models) {
      const detected = new Set(["glm-5.2"]);
      try {
        const { execSync } = await import("node:child_process");
        const out = execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='WorkBuddy.exe'\\" | ForEach-Object { $_.CommandLine }"`, { encoding: "utf8", timeout: 8000, windowsHide: true });
        for (const line of out.split(/\r?\n/)) {
          if (line.includes("--model")) {
            const m = line.match(/--model\s+(\S+)/);
            if (m) { detected.add(m[1]); if (line.includes("--session-id")) currentModel = m[1]; }
          }
        }
      } catch {}
      try {
        const LevelMod = require(path.join(os.homedir(), ".workbuddy/binaries/node/workspace/node_modules/level"));
        const ldbSrc = path.join(os.homedir(), ".workbuddy", "app", "session", "Local Storage", "leveldb");
        const ldbTmp = path.join(DATA_DIR, "ldb-models-tmp");
        fs.mkdirSync(ldbTmp, { recursive: true });
        for (const f of fs.readdirSync(ldbTmp)) { try { fs.unlinkSync(path.join(ldbTmp, f)); } catch {} }
        for (const f of fs.readdirSync(ldbSrc)) { if (f !== "LOCK") { try { fs.copyFileSync(path.join(ldbSrc, f), path.join(ldbTmp, f)); } catch {} } }
        const db = new LevelMod.Level(ldbTmp, { readOnly: true, valueEncoding: "utf8" });
        for await (const [key, value] of db.iterator()) {
          if (key.toString().includes("cb-thinking-pref:by-model")) {
            const prefs = JSON.parse(value.toString());
            for (const k of Object.keys(prefs)) detected.add(k.replace("custom:", ""));
          }
        }
        await db.close();
      } catch {}
      for (const m of Object.values(sessionModels)) { if (m) detected.add(m); }
      models = [...detected];
      try { fs.writeFileSync(path.join(DATA_DIR, "models.json"), JSON.stringify({ models }, null, 2), "utf8"); } catch {}
    }
    // Scan current model from running process
    try {
      const { execSync } = await import("node:child_process");
      const out = execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='WorkBuddy.exe'\\" | ForEach-Object { $_.CommandLine }"`, { encoding: "utf8", timeout: 8000, windowsHide: true });
      for (const line of out.split(/\r?\n/)) {
        if (line.includes("--model") && line.includes("--session-id")) {
          const m = line.match(/--model\s+(\S+)/);
          if (m) currentModel = m[1];
        }
      }
    } catch {}
    return sendJson(res, 200, { current: currentModel, models });
  }
  // Session model: GET returns current model, POST sets it
  const sessionModelMatch = url.pathname.match(/^\/api\/session-model\/([^/]+)$/);
  if (sessionModelMatch) {
    const sid = decodeURIComponent(sessionModelMatch[1]);
    if (req.method === "GET") {
      return sendJson(res, 200, { model: sessionModels[sid] || "glm-5.2" });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      sessionModels[sid] = String(body.model || "glm-5.2").trim();
      saveSessionModels();
      return sendJson(res, 200, { ok: true, model: sessionModels[sid] });
    }
  }
  if (req.method === "GET" && url.pathname === "/api/native/sessions") {
    const sessions = listNativeSessions(url.searchParams.get("limit") || 50);
    if (Array.isArray(sessions)) sessions.forEach(s => { s.model = sessionModels[s.id] || "glm-5.2"; });
    return sendJson(res, 200, sessions);
  }
  const nativeSessionMatch = url.pathname.match(/^\/api\/native\/sessions\/([^/]+)(?:\/(messages|milestones|tasks|artifacts))?$/);
  if (req.method === "GET" && nativeSessionMatch) {
    const sessionId = decodeURIComponent(nativeSessionMatch[1]);
    const section = nativeSessionMatch[2] || "summary";
    if (section === "messages") return sendJson(res, 200, readSessionMessages(sessionId, { limit: url.searchParams.get("limit") || 200 }));
    if (section === "milestones") return sendJson(res, 200, readSessionMilestones(sessionId, { limit: url.searchParams.get("limit") || 100 }));
    if (section === "tasks") return sendJson(res, 200, readSessionTasks(sessionId));
    if (section === "artifacts") return sendJson(res, 200, readSessionArtifacts(sessionId));
    const session = getNativeSession(sessionId);
    return session ? sendJson(res, 200, session) : sendJson(res, 404, { error: "SESSION_NOT_FOUND" });
  }
  const artifactPreviewMatch = url.pathname.match(/^\/api\/native\/sessions\/([^/]+)\/artifacts\/(\d+)\/preview$/);
  if (req.method === "GET" && artifactPreviewMatch) {
    const sessionId = decodeURIComponent(artifactPreviewMatch[1]);
    const idx = artifactPreviewMatch[2];
    const result = readArtifactFile(sessionId, idx);
    if (result.error) return sendJson(res, 404, result);
    if (result.content) {
      res.writeHead(200, { "content-type": result.mimeType || "application/octet-stream", "cache-control": "no-store" });
      return res.end(result.content);
    }
    return sendJson(res, 200, result);
  }
  if (req.method === "GET" && url.pathname === "/api/tasks") return sendJson(res, 200, buildTasks());
  if (req.method === "GET" && url.pathname === "/api/tasks/demo-task") {
    return sendJson(res, 200, { id: "demo-task", title: "手机远控桥接任务", status: "running", messages, artifacts: [], inbox: readInbox(), memory: readRecentMemory() });
  }
  if (req.method === "GET" && url.pathname === "/api/memory") return sendJson(res, 200, readRecentMemory());
  if (req.method === "GET" && url.pathname === "/api/inbox") return sendJson(res, 200, readInbox());
  if (req.method === "GET" && url.pathname === "/api/outbox") return sendJson(res, 200, readJsonlFile(OUTBOX_FILE));
  if (req.method === "GET" && url.pathname === "/api/events") return sendJson(res, 200, readJsonlFile(EVENTS_FILE, 100));
  if (req.method === "GET" && url.pathname === "/api/pending") return sendJson(res, 200, readPendingCommand());
  if (req.method === "POST" && url.pathname === "/api/tasks/demo-task/messages") {
    const body = await readBody(req);
    const text = String(body.content || "").trim();
    if (!text) return sendJson(res, 400, { error: "EMPTY_CONTENT" });
    const item = { time: new Date().toISOString(), source: "android", content: text };
    fs.appendFileSync(INBOX_FILE, JSON.stringify(item) + "\n");
    messages.push({ role: "user", content: text });
    broadcast("message", { role: "user", content: text });
    const reply = `已写入手机指令收件箱：${text}`;
    messages.push({ role: "assistant", content: reply });
    broadcast("message", { role: "assistant", content: reply });
    broadcast("tasks", buildTasks());
    return sendJson(res, 200, { ok: true, item });
  }
  if (req.method === "GET" && url.pathname === "/api/tasks/demo-task/stream") {
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "connection": "keep-alive" });
    clients.add(res);
    res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    req.on("close", () => clients.delete(res));
    return;
  }
  // Generic SSE for native sessions (real-time updates)
  if (req.method === "GET" && url.pathname === "/api/stream") {
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "connection": "keep-alive" });
    clients.add(res);
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, time: Date.now() })}\n\n`);
    req.on("close", () => clients.delete(res));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/approvals") {
    return sendJson(res, 200, [{ id: "approval-none", taskId: "gateway-status", risk: "none", action: "none", summary: "暂无真实 WorkBuddy 审批。下一阶段接入真实审批事件。" }]);
  }

  if (req.method === "GET" && url.pathname === "/api/serve/health") {
    const serve = await checkServe();
    return sendJson(res, 200, serve);
  }

  const promptMatch = url.pathname.match(/^\/api\/native\/sessions\/([^/]+)\/prompt$/);
  if (req.method === "POST" && promptMatch) {
    const sessionId = decodeURIComponent(promptMatch[1]);
    const body = await readBody(req);
    const text = String(body.content || body.text || body.message || "").trim();
    if (!text) return sendJson(res, 400, { error: "EMPTY_CONTENT" });
    const session = getNativeSession(sessionId);
    if (!session || session.error) return sendJson(res, 404, { error: "SESSION_NOT_FOUND" });

    // Write user message to jsonl — serve process writes to a DIFFERENT jsonl file (based on its cwd),
    // so no duplicates. Without this, phone messages are invisible in the main jsonl.
    appendUserMessage(sessionId, text);
    touchSession(sessionId);
    refreshWorkBuddyUI();
    broadcast("user-message", { sessionId, text: text.slice(0, 100) });

    // Return immediately to phone
    sendJson(res, 200, { ok: true, message: "消息已发送至电脑端 serve 进程处理" });

    // Send prompt via ACP — serve process processes it and returns AI reply
    (async () => {
      try {
        const model = sessionModels[sessionId] || session.model || "glm-5.2";
        const result = await sendPrompt(sessionId, text, session.cwd, model);
        touchSession(sessionId);
        // Write AI reply to jsonl (serve process may write to a different file)
        if (result.ok && result.assistantReply) {
          appendAssistantMessage(sessionId, result.assistantReply);
        }
        // Refresh desktop UI so messages appear promptly
        refreshWorkBuddyUI();
        broadcast("ai-reply", { sessionId, ok: result.ok, replyLength: result.assistantReply?.length || 0, error: result.error || null });
        fs.appendFileSync(
          path.join(DATA_DIR, "prompt-results.log"),
          JSON.stringify({ time: new Date().toISOString(), sessionId, ok: result.ok, replyLength: result.assistantReply?.length || 0, error: result.error || null }) + "\n",
          "utf8"
        );
      } catch (err) {
        // ACP failed — write user message as fallback so it's not lost
        appendUserMessage(sessionId, text);
        const errMsg=String(err.message||err).slice(0,2000);
        broadcast("ai-reply", { sessionId, ok: false, error: errMsg });
        fs.appendFileSync(
          path.join(DATA_DIR, "prompt-results.log"),
          JSON.stringify({ time: new Date().toISOString(), sessionId, error: errMsg }) + "\n",
          "utf8"
        );
      }
    })();
    return;
  }

  // Create new session
  if (req.method === "POST" && url.pathname === "/api/native/sessions/new") {
    const body = await readBody(req);
    const cwd = body.cwd || WORKSPACE;
    const title = String(body.title || "").trim();
    const model = String(body.model || "glm-5.2").trim();
    try {
      const result = await createNewSession(cwd, model);
      insertSession(result.sessionId, title, cwd);
      if (title) renameSession(result.sessionId, title);
      sessionModels[result.sessionId] = model;
      saveSessionModels();
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { error: "CREATE_FAILED", message: String(err.message || err) });
    }
  }

  // List workspaces
  if (req.method === "GET" && url.pathname === "/api/native/workspaces") {
    return sendJson(res, 200, listWorkspaces());
  }

  // Delete session (soft delete)
  const deleteMatch = url.pathname.match(/^\/api\/native\/sessions\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const sessionId = decodeURIComponent(deleteMatch[1]);
    const result = deleteSession(sessionId);
    // Serve process handles desktop UI update automatically
    broadcast("session-deleted", { sessionId });
    return sendJson(res, 200, result);
  }

  // Rename session
  const renameMatch = url.pathname.match(/^\/api\/native\/sessions\/([^/]+)\/rename$/);
  if (req.method === "POST" && renameMatch) {
    const sessionId = decodeURIComponent(renameMatch[1]);
    const body = await readBody(req);
    const title = String(body.title || "").trim();
    if (!title) return sendJson(res, 400, { error: "EMPTY_TITLE" });
    const result = renameSession(sessionId, title);
    return sendJson(res, 200, result);
  }

  // Credits / usage
  if (req.method === "GET" && url.pathname === "/api/credits") {
    return sendJson(res, 200, getCreditUsage());
  }
  // Pinned sessions
  if (req.method === "GET" && url.pathname === "/api/pinned-sessions") {
    // Get current user's ID from sessions table
    const sessions = listNativeSessions(200);
    const sessionIds = new Set(sessions.map(s => s.id));
    // Get the most active user_id
    const userId = getCurrentUserId();
    const pinned = getPinnedSessionsFromLevelDB(userId);
    // Double filter: only return pins that exist in sessions list
    return sendJson(res, 200, pinned.filter(id => sessionIds.has(id)));
  }
  // Skills list
  if (req.method === "GET" && url.pathname === "/api/skills") {
    return sendJson(res, 200, listSkills());
  }

  sendJson(res, 404, { error: "NOT_FOUND" });
  } catch(err) {
    if(!res.headersSent) sendJson(res, 500, { error: "INTERNAL_ERROR", message: String(err.message||err).slice(0,200) });
    console.error("[server] Error:", err.message);
  }
});

server.listen(PORT, HOST, async () => {
  console.log("WorkBuddy mobile remote observer gateway");
  console.log(`Token: ${TOKEN}`);
  console.log("");

  // 三层连接方案：A 局域网 → B UPnP → C Cloudflare
  await initConnections(PORT, TOKEN, DATA_DIR, console.log);

  // Tailscale（如果已安装）
  const tsIp = getTailscaleIps().find(x => x.startsWith("100."));
  if (tsIp) {
    console.log(`[T] Tailscale: http://${tsIp}:${PORT}/?token=${TOKEN}`);
  }

  // Relay（可选，如果配置了 relay-config.json）
  const relayConfig = loadRelayConfig(DATA_DIR);
  if (relayConfig) {
    relayConfig.gateway_port = PORT;
    relayConfig.gateway_token = TOKEN;
    startRelay(relayConfig, broadcast, console.log);
    setTimeout(() => {
      if (isRelayConnected()) {
        console.log(`[R] Relay: ${relayConfig.relay_url} (connected)`);
      }
    }, 3000);
  }

  // Start watchdog child process
  try {
    const child = spawn(process.execPath, [path.join(__dirname, "watchdog-child.js")], {
      detached: true, stdio: "ignore", windowsHide: true, cwd: __dirname,
    });
    child.unref();
    console.log("Watchdog started (background).");
  } catch (e) {
    console.error("Failed to start watchdog:", e.message);
  }
});

// Global error handlers
process.on("unhandledRejection", (err) => { console.error("[unhandledRejection]", err.message); });
process.on("uncaughtException", (err) => { console.error("[uncaughtException]", err.message); });
