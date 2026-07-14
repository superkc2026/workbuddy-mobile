// watchdog-child.js — Node.js 看门狗（无窗口）
// 每 5 分钟检查 Gateway 是否在运行，挂了就重启
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 18787;
const SERVER_JS = path.join(__dirname, "server.js");
const LOG_FILE = path.join(__dirname, "data", "watchdog.log");

// Find node executable
let nodeExe = process.execPath;
// If running via WorkBuddy's bundled node, use system node for restarts
try {
  const out = execSync('where node', { encoding: 'utf8', timeout: 3000, windowsHide: true });
  const lines = out.trim().split(/\r?\n/);
  if (lines[0]) nodeExe = lines[0].trim();
} catch {}

function log(msg) {
  const ts = new Date().toISOString();
  try { fs.appendFileSync(LOG_FILE, `${ts} - ${msg}\n`, "utf8"); } catch {}
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/health`, { timeout: 5000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function restartGateway() {
  try {
    spawn(nodeExe, [SERVER_JS], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: __dirname,
    }).unref();
    log("Gateway was down, restarted.");
  } catch (e) {
    log("Failed to restart: " + e.message);
  }
}

async function main() {
  // Check every 5 minutes
  setInterval(async () => {
    const healthy = await checkHealth();
    if (!healthy) {
      restartGateway();
    }
  }, 5 * 60 * 1000);

  // Also check once at startup (after 10s delay)
  setTimeout(async () => {
    const healthy = await checkHealth();
    if (!healthy) {
      restartGateway();
    }
  }, 10000);

  log("Watchdog started, checking every 5 minutes.");
}

main();
