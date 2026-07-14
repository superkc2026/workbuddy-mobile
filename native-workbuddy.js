import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const WORKBUDDY_HOME = process.env.WB_HOME || path.join(os.homedir(), ".workbuddy");
const DB_FILE = process.env.WB_DB || path.join(WORKBUDDY_HOME, "workbuddy.db");
const PROJECTS_DIR = path.join(WORKBUDDY_HOME, "projects");
const TASKS_DIR = path.join(WORKBUDDY_HOME, "tasks");
const SKILLS_DIR = path.join(WORKBUDDY_HOME, "skills");
const ARTIFACT_INDEX_DIR = path.join(WORKBUDDY_HOME, "artifact-index");
const PYTHON = process.env.WB_NATIVE_PYTHON || process.env.WB_PYTHON || findPython();

function findPython() {
  const candidates = [
    path.join(os.homedir(), ".workbuddy", "binaries", "python", "versions", "3.13.12", "python.exe"),
    "C:\\Program Files\\Python312\\python.exe",
    "C:\\Program Files\\Python313\\python.exe",
    "python", "python3"
  ];
  for (const c of candidates) {
    try { execFileSync(c, ["-c", "print(1)"], { timeout: 3000, windowsHide: true }); return c; } catch {}
  }
  return "python";
}

function readTextSafe(file, maxBytes = 1024 * 1024) {
  try {
    if (!fs.existsSync(file)) return "";
    const stat = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    const size = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, Math.max(0, stat.size - size));
    fs.closeSync(fd);
    return buffer.toString("utf8");
  } catch {
    return "";
  }
}

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// 使用 Node.js 22 内置 SQLite（无需 Python）
let _sqliteDb = null;
function getSqliteDb() {
  if (!_sqliteDb && fs.existsSync(DB_FILE)) {
    _sqliteDb = new DatabaseSync(DB_FILE, { readOnly: true });
  }
  return _sqliteDb;
}

function runSql(sql, params = []) {
  try {
    const db = getSqliteDb();
    if (!db) return [];
    const stmt = db.prepare(sql);
    const rows = params.length ? stmt.all(...params) : stmt.all();
    return rows;
  } catch (err) {
    return [{ error: "SQL_READ_FAILED", message: String(err.message || err) }];
  }
}

function toIso(value) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const ms = n > 1000000000000 ? n : n * 1000;
  try { return new Date(ms).toISOString(); } catch { return null; }
}

function projectDirNameFromCwd(cwd) {
  if (!cwd) return null;
  return cwd.replace(/^[A-Za-z]:/, match => match[0].toLowerCase()).replace(/[\\/:]+/g, "-").replace(/^-+|-+$/g, "");
}

function findSessionJsonl(session) {
  const candidates = [];
  const projectName = projectDirNameFromCwd(session.cwd);
  if (projectName) candidates.push(path.join(PROJECTS_DIR, projectName, `${session.id}.jsonl`));
  try {
    if (fs.existsSync(PROJECTS_DIR)) {
      for (const name of fs.readdirSync(PROJECTS_DIR)) {
        candidates.push(path.join(PROJECTS_DIR, name, `${session.id}.jsonl`));
      }
    }
  } catch {}
  const seen = new Set();
  for (const file of candidates) {
    if (seen.has(file)) continue;
    seen.add(file);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function summarizeSessionLight(row) {
  const title = row.custom_title || row.title || "未命名任务";
  return {
    id: row.id,
    title,
    status: row.status,
    cwd: row.cwd,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lastActivityAt: row.last_activity_at || null,
    createdAtIso: toIso(row.created_at),
    updatedAtIso: toIso(row.updated_at),
    lastActivityAtIso: toIso(row.last_activity_at || row.updated_at),
  };
}

function summarizeSession(row) {
  const title = row.custom_title || row.title || "未命名任务";
  const jsonlPath = findSessionJsonl(row);
  const taskDir = path.join(TASKS_DIR, row.id);
  const artifactPath = path.join(ARTIFACT_INDEX_DIR, `${row.id}.json`);
  let taskFileCount = 0;
  try {
    taskFileCount = fs.existsSync(taskDir) ? fs.readdirSync(taskDir).filter(x => x.endsWith(".json")).length : 0;
  } catch {}
  return {
    id: row.id,
    title,
    status: row.status,
    cwd: row.cwd,
    model: row.model || null,
    permissionMode: row.permission_mode || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    lastActivityAt: row.last_activity_at || null,
    createdAtIso: toIso(row.created_at),
    updatedAtIso: toIso(row.updated_at),
    lastActivityAtIso: toIso(row.last_activity_at || row.updated_at),
    jsonlPath,
    jsonlExists: Boolean(jsonlPath),
    jsonlSize: jsonlPath && fs.existsSync(jsonlPath) ? fs.statSync(jsonlPath).size : 0,
    taskDirExists: fs.existsSync(taskDir),
    taskFileCount,
    artifactIndexExists: fs.existsSync(artifactPath),
  };
}

export function listNativeSessions(limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const rows = runSql(
    "SELECT * FROM sessions WHERE deleted_at IS NULL ORDER BY COALESCE(last_activity_at, updated_at, created_at) DESC LIMIT ?",
    [safeLimit]
  );
  return rows.map(summarizeSessionLight);
}

export function getNativeSession(sessionId) {
  const rows = runSql("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
  if (!rows.length || rows[0].error) return rows[0] || null;
  return summarizeSession(rows[0]);
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(item => {
    if (!item) return "";
    if (typeof item === "string") return item;
    return item.text || item.markdown || item.content || item.type || "";
  }).filter(Boolean).join("\n");
}

function normalizeJsonlEvent(event, index) {
  const base = {
    index,
    id: event.id || null,
    type: event.type || "unknown",
    role: event.role || null,
    timestamp: event.timestamp || null,
    timestampIso: toIso(event.timestamp),
    sessionId: event.sessionId || null
  };
  if (event.type === "message") {
    return { ...base, text: contentToText(event.content), rawContentType: Array.isArray(event.content) ? "array" : typeof event.content };
  }
  if (event.type === "ai-title") return { ...base, role: "system", text: event.aiTitle || "" };
  if (event.type === "function_call") return { ...base, role: "tool", toolName: event.name || null, text: event.arguments ? String(event.arguments).slice(0, 4000) : "" };
  if (event.type === "function_call_result") {
    const out = event.output?.text || event.output?.content || event.output || "";
    return { ...base, role: "tool_result", toolName: event.name || null, status: event.status || null, text: typeof out === "string" ? out.slice(0, 8000) : JSON.stringify(out).slice(0, 8000) };
  }
  return { ...base, text: "" };
}

export function readSessionMessages(sessionId, options = {}) {
  const session = getNativeSession(sessionId);
  if (!session || session.error) return { sessionId, error: "SESSION_NOT_FOUND" };
  if (!session.jsonlPath) return { sessionId, session, messages: [], totalEvents: 0, error: "JSONL_NOT_FOUND" };
  const maxBytes = Math.max(1024, Math.min(Number(options.maxBytes) || 128 * 1024 * 1024, 256 * 1024 * 1024));
  const maxItems = Math.max(1, Math.min(Number(options.limit) || 50, 500));
  const text = readTextSafe(session.jsonlPath, maxBytes);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const parsed = [];
  lines.forEach((line, i) => {
    try {
      const event = JSON.parse(line);
      const normalized = normalizeJsonlEvent(event, i);
      if (["message", "ai-title", "function_call", "function_call_result"].includes(normalized.type)) parsed.push(normalized);
    } catch {
      // skip parse errors silently for performance
    }
  });
  const sinceTs = Number(options.since) || 0;
  const filtered = sinceTs > 0 ? parsed.filter(m => Number(m.timestamp) > sinceTs) : parsed;
  const result = filtered.slice(-maxItems);
  return {
    sessionId,
    session: { id: session.id, title: session.title, status: session.status, cwd: session.cwd, jsonlSize: session.jsonlSize, lastActivityAtIso: session.lastActivityAtIso },
    messages: result,
    totalEvents: lines.length,
    returned: result.length,
    jsonlSize: session.jsonlSize,
    latestTimestamp: result.length ? result[result.length - 1].timestamp : null,
  };
}

export function readSessionTasks(sessionId) {
  const taskDir = path.join(TASKS_DIR, sessionId);
  if (!fs.existsSync(taskDir)) return { sessionId, tasks: [], taskDirExists: false };
  const files = fs.readdirSync(taskDir)
    .filter(name => name.endsWith(".json"))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  const tasks = files.map(name => {
    const data = readJsonSafe(path.join(taskDir, name), {});
    return { file: name, id: data.id || path.basename(name, ".json"), subject: data.subject || "", description: data.description || "", activeForm: data.activeForm || "", status: data.status || "unknown", createdAt: data.createdAt || null, updatedAt: data.updatedAt || null, createdAtIso: toIso(data.createdAt), updatedAtIso: toIso(data.updatedAt) };
  });
  return { sessionId, taskDir, taskDirExists: true, tasks };
}

export function readSessionArtifacts(sessionId) {
  const file = path.join(ARTIFACT_INDEX_DIR, `${sessionId}.json`);
  const data = readJsonSafe(file, { version: 1, artifacts: [] });
  const artifacts = (Array.isArray(data.artifacts) ? data.artifacts : []).map(item => ({
    type: item.type || null,
    name: item.name || null,
    title: item.title || item.name || null,
    uri: item.uri || null,
    mimeType: item.mimeType || null,
    contentType: item.contentType || null,
    size: item.size || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    taskCount: Array.isArray(item.tasks) ? item.tasks.length : undefined
  })).filter(item => {
    // Filter out artifacts whose files don't exist
    const uri = item.uri || "";
    if (uri.startsWith("file:")) {
      let fp = uri;
      if (uri.startsWith("file:///")) fp = decodeURIComponent(uri.slice(8));
      else if (uri.startsWith("file://")) fp = decodeURIComponent(uri.slice(7));
      else if (uri.startsWith("file:")) fp = decodeURIComponent(uri.slice(5));
      return fs.existsSync(fp);
    }
    // Keep agent:// and file-changes:// types
    return true;
  });
  return { sessionId, artifactIndexPath: file, artifactIndexExists: fs.existsSync(file), lastUpdated: data.lastUpdated || null, lastUpdatedIso: toIso(data.lastUpdated), artifacts };
}

export function readSessionMilestones(sessionId, options = {}) {
  const session = getNativeSession(sessionId);
  if (!session || session.error) return { sessionId, error: "SESSION_NOT_FOUND" };
  if (!session.jsonlPath) return { sessionId, messages: [], error: "JSONL_NOT_FOUND" };
  const maxBytes = Math.max(1024, Math.min(Number(options.maxBytes) || 128 * 1024 * 1024, 256 * 1024 * 1024));
  const text = readTextSafe(session.jsonlPath, maxBytes);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const milestones = [];
  lines.forEach((line, i) => {
    try {
      const event = JSON.parse(line);
      if (event.type === "message" && (event.role === "user" || event.role === "assistant")) {
        const text = contentToText(event.content);
        if (text && text.trim().length > 0) {
          milestones.push({
            index: i,
            type: "message",
            role: event.role,
            text: text,
            timestamp: event.timestamp || null,
            timestampIso: toIso(event.timestamp),
            sessionId: event.sessionId || sessionId,
          });
        }
      }
    } catch {}
  });
  const maxItems = Math.max(1, Math.min(Number(options.limit) || 100, 10000));
  return {
    sessionId,
    session: { id: session.id, title: session.title, status: session.status, cwd: session.cwd },
    messages: milestones.slice(-maxItems),
    totalMilestones: milestones.length,
    totalEvents: lines.length,
  };
}

export function readArtifactFile(sessionId, artifactIndex) {
  const file = path.join(ARTIFACT_INDEX_DIR, `${sessionId}.json`);
  const data = readJsonSafe(file, { version: 1, artifacts: [] });
  const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
  const idx = Number(artifactIndex);
  if (idx < 0 || idx >= artifacts.length) return { error: "INDEX_OUT_OF_RANGE" };
  const item = artifacts[idx];
  const uri = item.uri || item.path || "";
  if (!uri) return { error: "NO_URI", artifact: item };
  let filePath = uri;
  if (uri.startsWith("file:///")) filePath = decodeURIComponent(uri.slice(8));
  else if (uri.startsWith("file://")) filePath = decodeURIComponent(uri.slice(7));
  else if (uri.startsWith("file:")) filePath = decodeURIComponent(uri.slice(5));
  if (!fs.existsSync(filePath)) {
    if (item.content || item.data) return { artifact: item, inlineContent: item.content || item.data, exists: false };
    return { error: "FILE_NOT_FOUND", artifact: item, uri };
  }
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    ".html": "text/html", ".htm": "text/html", ".js": "text/javascript",
    ".css": "text/css", ".json": "application/json", ".txt": "text/plain",
    ".md": "text/markdown", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".zip": "application/zip", ".tgz": "application/gzip", ".tar.gz": "application/gzip",
    ".tar": "application/x-tar", ".gz": "application/gzip",
    ".pdf": "application/pdf", ".csv": "text/csv", ".xml": "text/xml",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt": "application/vnd.ms-powerpoint",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".zip": "application/zip", ".mp4": "video/mp4", ".py": "text/x-python", ".sh": "text/x-shellscript",
  };
  const mimeType = mimeMap[ext] || "application/octet-stream";
  const maxReadSize = 5 * 1024 * 1024;
  const size = Math.min(stat.size, maxReadSize);
  const fd = fs.openSync(filePath, "r");
  const buffer = Buffer.alloc(size);
  fs.readSync(fd, buffer, 0, size, 0);
  fs.closeSync(fd);
  return {
    artifact: item,
    filePath,
    mimeType,
    size: stat.size,
    truncated: stat.size > maxReadSize,
    content: buffer,
  };
}

export function touchSession(sessionId) {
  const script = [
    "import json, sqlite3, sys, time",
    "db = sys.argv[1]",
    "sid = sys.argv[2]",
    "now = int(time.time() * 1000)",
    "conn = sqlite3.connect(db)",
    "conn.execute('UPDATE sessions SET last_activity_at = ?, updated_at = ? WHERE id = ?', (now, now, sid))",
    "conn.commit()",
    "conn.close()",
    "print(json.dumps({'ok': True, 'sessionId': sid, 'timestamp': now}))",
  ].join("\n");
  try {
    const out = execFileSync(PYTHON, ["-c", script, DB_FILE, sessionId], {
      encoding: "utf8", timeout: 5000, windowsHide: true,
    });
    return JSON.parse(out);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

export function deleteSession(sessionId) {
  const script = [
    "import json, sqlite3, sys, time",
    "db = sys.argv[1]",
    "sid = sys.argv[2]",
    "now = int(time.time() * 1000)",
    "conn = sqlite3.connect(db)",
    "conn.execute('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?', (now, now, sid))",
    "conn.commit()",
    "conn.close()",
    "print(json.dumps({'ok': True, 'sessionId': sid}))",
  ].join("\n");
  try {
    const out = execFileSync(PYTHON, ["-c", script, DB_FILE, sessionId], {
      encoding: "utf8", timeout: 5000, windowsHide: true,
    });
    return JSON.parse(out);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

export function insertSession(sessionId, title, cwd) {
  const script = [
    "import json, sqlite3, sys, time",
    "db = sys.argv[1]",
    "sid = sys.argv[2]",
    "title = sys.argv[3]",
    "cwd = sys.argv[4]",
    "now = int(time.time() * 1000)",
    "conn = sqlite3.connect(db)",
    "# Get user_id from most recent session",
    "row = conn.execute('SELECT user_id FROM sessions ORDER BY COALESCE(last_activity_at, updated_at, created_at) DESC LIMIT 1').fetchone()",
    "user_id = row[0] if row else None",
    "# Check if already exists",
    "exists = conn.execute('SELECT 1 FROM sessions WHERE id = ?', (sid,)).fetchone()",
    "if not exists:",
    "  conn.execute('''INSERT INTO sessions",
    "    (id, cwd, user_id, title, custom_title, status, created_at, updated_at,",
    "     last_activity_at, is_playground, source_mode, model, permission_mode,",
    "     use_sandbox_cli, mode)",
    "    VALUES (?, ?, ?, ?, ?, 'working', ?, ?, ?, 1, 'working', 'glm-5.2', 'fullAccess', 0, 'craft')''',",
    "    (sid, cwd, user_id, title or '新任务', title or '新任务', now, now, now))",
    "  conn.commit()",
    "conn.close()",
    "print(json.dumps({'ok': True, 'sessionId': sid}))",
  ].join("\n");
  try {
    const out = execFileSync(PYTHON, ["-c", script, DB_FILE, sessionId, title || "", cwd || ""], {
      encoding: "utf8", timeout: 5000, windowsHide: true,
    });
    return JSON.parse(out);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

export function renameSession(sessionId, title) {
  const script = [
    "import json, sqlite3, sys, time",
    "db = sys.argv[1]",
    "sid = sys.argv[2]",
    "title = sys.argv[3]",
    "now = int(time.time() * 1000)",
    "conn = sqlite3.connect(db)",
    "conn.execute('UPDATE sessions SET custom_title = ?, updated_at = ? WHERE id = ?', (title, now, sid))",
    "conn.commit()",
    "conn.close()",
    "print(json.dumps({'ok': True, 'sessionId': sid, 'title': title}))",
  ].join("\n");
  try {
    const out = execFileSync(PYTHON, ["-c", script, DB_FILE, sessionId, title], {
      encoding: "utf8", timeout: 5000, windowsHide: true,
    });
    return JSON.parse(out);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// Append a user message directly to the session's jsonl file
// This makes the message visible in WorkBuddy UI after a page reload
export function appendUserMessage(sessionId, text) {
  const rows = runSql("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
  if (!rows || !rows.length) return { ok: false, error: "SESSION_NOT_FOUND" };
  const session = rows[0];
  const jsonlPath = findSessionJsonl(session);
  if (!jsonlPath) return { ok: false, error: "JSONL_NOT_FOUND" };

  // Read last line to get parentId
  let parentId = "";
  try {
    const content = fs.readFileSync(jsonlPath, "utf8");
    const lines = content.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const d = JSON.parse(lines[i]);
        if (d.id) { parentId = d.id; break; }
      } catch {}
    }
  } catch {}

  // Create user message in the same format as ACP
  const msg = {
    id: crypto.randomUUID(),
    parentId,
    timestamp: Date.now(),
    type: "message",
    role: "user",
    content: [{ type: "input_text", text }],
  };

  // Append to jsonl
  try {
    fs.appendFileSync(jsonlPath, JSON.stringify(msg) + "\n", "utf8");
    return { ok: true, messageId: msg.id };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

export function appendAssistantMessage(sessionId, text) {
  const rows = runSql("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
  if (!rows || !rows.length) return { ok: false, error: "SESSION_NOT_FOUND" };
  const session = rows[0];
  const jsonlPath = findSessionJsonl(session);
  if (!jsonlPath) return { ok: false, error: "JSONL_NOT_FOUND" };

  let parentId = "";
  try {
    const content = fs.readFileSync(jsonlPath, "utf8");
    const lines = content.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const d = JSON.parse(lines[i]);
        if (d.id) { parentId = d.id; break; }
      } catch {}
    }
  } catch {}

  const msg = {
    id: crypto.randomUUID(),
    parentId,
    timestamp: Date.now(),
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text }],
  };

  try {
    fs.appendFileSync(jsonlPath, JSON.stringify(msg) + "\n", "utf8");
    return { ok: true, messageId: msg.id };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// Get pinned session IDs from WorkBuddy LocalStorage (leveldb)
export function getPinnedSessions() {
  const script = [
    "import json, os, re, sys",
    "ldb_dir = os.path.join(os.path.expanduser('~'), '.workbuddy', 'app', 'session', 'Local Storage', 'leveldb')",
    "results = []",
    "if os.path.isdir(ldb_dir):",
    "  for fname in os.listdir(ldb_dir):",
    "    if not fname.endswith(('.ldb', '.log')): continue",
    "    fpath = os.path.join(ldb_dir, fname)",
    "    try:",
    "      data = open(fpath, 'rb').read()",
    "      # Search for workbuddy-pinned-conversations key",
    "      for m in re.finditer(b'workbuddy-pinned-conversations:([0-9a-f-]+)', data):",
    "        # Find JSON array after the key",
    "        after = data[m.end():m.end()+2000]",
    "        # Find the start of JSON array",
    "        json_start = after.find(b'[')",
    "        if json_start < 0: continue",
    "        # Find matching close bracket",
    "        depth = 0",
    "        json_end = json_start",
    "        for i in range(json_start, min(len(after), json_start+1000)):",
    "          if after[i:i+1] == b'[': depth += 1",
    "          elif after[i:i+1] == b']': depth -= 1",
    "          if depth == 0: json_end = i+1; break",
    "        json_str = after[json_start:json_end].decode('utf-8', errors='replace')",
    "        try:",
    "          arr = json.loads(json_str)",
    "          for item in arr:",
    "            if isinstance(item, dict) and 'id' in item:",
    "              results.append(item['id'])",
    "        except: pass",
    "    except: pass",
    "# Deduplicate",
    "seen = set()",
    "unique = []",
    "for sid in results:",
    "  if sid not in seen: seen.add(sid); unique.append(sid)",
    "print(json.dumps(unique))",
  ].join("\n");
  try {
    const out = execFileSync(PYTHON, ["-c", script], {
      encoding: "utf8", timeout: 5000, windowsHide: true,
    });
    return JSON.parse(out || "[]");
  } catch (err) {
    return [];
  }
}

// Get credit usage aggregated from session_usage table
export function getCreditUsage() {
  const rows = runSql("SELECT session_id, credit_json, updated_at FROM session_usage WHERE credit_json IS NOT NULL", []);
  let totalUsage = 0;
  const bySession = {};
  for (const r of rows) {
    try {
      const credits = JSON.parse(r.credit_json);
      let sessionTotal = 0;
      for (const v of Object.values(credits)) {
        sessionTotal += Number(v) || 0;
      }
      totalUsage += sessionTotal;
      bySession[r.session_id] = { usage: Math.round(sessionTotal * 100) / 100, updatedAt: r.updated_at };
    } catch {}
  }
  // 今日使用 = 当前总量 - 今日快照（每天第一次查询时存）
  const today = new Date().toISOString().slice(0, 10);
  const snapshotFile = path.join(WORKBUDDY_HOME, 'credits-snapshot.json');
  let todayUsage = 0;
  try {
    const snap = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    if (snap.date === today) {
      todayUsage = Math.max(0, totalUsage - snap.total);
    } else {
      // 新的一天，存新快照
      fs.writeFileSync(snapshotFile, JSON.stringify({ date: today, total: totalUsage }));
      todayUsage = 0;
    }
  } catch {
    // 文件不存在，存快照
    try { fs.writeFileSync(snapshotFile, JSON.stringify({ date: today, total: totalUsage })); } catch {}
    todayUsage = 0;
  }
  return {
    totalUsage: Math.round(totalUsage * 100) / 100,
    todayUsage: Math.round(todayUsage * 100) / 100,
    sessionCount: Object.keys(bySession).length,
    bySession,
  };
}

export function listWorkspaces() {
  const rows = runSql("SELECT path, last_opened_at FROM workspaces ORDER BY last_opened_at DESC", []);
  return rows.map(r => ({
    path: r.path,
    name: r.path ? r.path.split(/[\\/]/).pop() : r.path,
    lastOpenedAt: r.last_opened_at,
  }));
}

// Get current user's ID
export function getCurrentUserId() {
  const rows = runSql("SELECT user_id FROM sessions WHERE deleted_at IS NULL AND user_id IS NOT NULL ORDER BY COALESCE(last_activity_at, updated_at, created_at) DESC LIMIT 1", []);
  return rows.length ? rows[0].user_id : "";
}

// List available skills from ~/.workbuddy/skills/ and builtin skills
export function listSkills() {
  const skills = [];
  const dirs = [
    { path: SKILLS_DIR, type: "user" },
    { path: "C:\\Program Files\\WorkBuddy\\resources\\app.asar.unpacked\\resources\\builtin-skills", type: "builtin" },
  ];
  for (const { path: dir, type } of dirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const skillPath = path.join(dir, name);
        if (!fs.statSync(skillPath).isDirectory()) continue;
        const skillFile = path.join(skillPath, "SKILL.md");
        if (!fs.existsSync(skillFile)) continue;
        const content = fs.readFileSync(skillFile, "utf8").slice(0, 2000);
        let summary = "";
        // Try description: "..." or description: >- ... or description: ...
        const descMatch = content.match(/description:\s*(?:>-?\s*)?(?:["']?)([^\n]+)/);
        if (descMatch) summary = descMatch[1].trim().replace(/["']$/, "");
        skills.push({ name, summary, type });
      }
    } catch {}
  }
  return skills;
}
