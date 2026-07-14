// connection-manager.js — 三层连接方案管理器
// A: 局域网直连  B: UPnP端口转发  C: Cloudflare Tunnel

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";

// URL 注册中心
const REGISTRY_URL = 'https://wb.loveclaw.fun/api/registry';
const REGISTRY_PAGE = 'https://wb.loveclaw.fun';
let registryTimer = null;
let deviceUuid = null;

function getDeviceUuid(dataDir) {
  if (deviceUuid) return deviceUuid;
  const uuidFile = path.join(dataDir, 'device-uuid.txt');
  if (fs.existsSync(uuidFile)) {
    deviceUuid = fs.readFileSync(uuidFile, 'utf8').trim();
  } else {
    deviceUuid = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    fs.writeFileSync(uuidFile, deviceUuid);
  }
  return deviceUuid;
}

async function updateRegistry(dataDir, url, token) {
  const uuid = getDeviceUuid(dataDir);
  const fullUrl = `${url}?token=${token}`;
  try {
    const body = JSON.stringify({ url: fullUrl, token });
    await postJSON(`${REGISTRY_URL}/${uuid}`, body);
  } catch {}
}

function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 5000,
    }, (res) => { res.resume(); res.on('end', resolve); });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

export function getRegistryPageUrl(dataDir) {
  const uuid = getDeviceUuid(dataDir);
  return `${REGISTRY_PAGE}/${uuid}`;
}

const state = {
  lan: [],           // [{ip, url}]
  upnp: null,        // {ip, port, url} or null
  cloudflare: null,  // {url} or null
  cloudflaredProc: null,
  cloudflaredClosed: false,
};

// ===== 方案 A：局域网直连 =====

export function getLocalIps() {
  const ifs = os.networkInterfaces();
  const ips = [];
  const skipNames = ['tailscale', 'vmware', 'virtualbox', 'docker', 'vethernet', 'loopback pseudo'];
  for (const [name, addrs] of Object.entries(ifs)) {
    if (!addrs) continue;
    const lower = name.toLowerCase();
    if (skipNames.some(s => lower.includes(s))) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        // 优先 192.168.x.x，也接受 10.x.x.x 和 172.16-31.x.x
        if (addr.address.startsWith('192.168.') ||
            addr.address.startsWith('10.') ||
            addr.address.startsWith('172.')) {
          ips.push(addr.address);
        }
      }
    }
  }
  return [...new Set(ips)];
}

function buildLanUrls(port, token) {
  const ips = getLocalIps();
  return ips.map(ip => ({
    ip,
    url: `http://${ip}:${port}/?token=${token}`
  }));
}

// ===== 方案 B：UPnP 端口转发 =====

export async function tryUPnP(port) {
  try {
    // SSDP 发现路由器
    const device = await ssdpDiscover().catch(() => null);
    if (!device) return null;

    // 获取外网 IP
    const externalIP = await getExternalIP(device).catch(() => null);
    if (!externalIP) return null;

    // 添加端口映射
    const ok = await addPortMapping(device, port).catch(() => false);
    if (!ok) return null;

    return { ip: externalIP, port, device };
  } catch {
    return null;
  }
}

function ssdpDiscover() {
  return new Promise((resolve, reject) => {
    const timeout = 3000;
    const timer = setTimeout(() => { socket.close(); reject(new Error('timeout')); }, timeout);
    
    const socket = dgram.createSocket('udp4');
    const msg = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 239.255.255.250:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 2\r\n' +
      'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n'
    );

    socket.on('message', (data) => {
      const text = data.toString();
      const locMatch = text.match(/LOCATION:\s*(http:\/\/[^\s]+)/i);
      if (locMatch) {
        clearTimeout(timer);
        socket.close();
        resolve({ location: locMatch[1] });
      }
    });

    socket.on('error', () => { clearTimeout(timer); socket.close(); reject(new Error('socket error')); });
    socket.send(msg, 0, msg.length, 1900, '239.255.255.250');
  });
}

async function getExternalIP(device) {
  const resp = await fetchXML(device.location);
  if (!resp) return null;
  // 找 WANIPConnection 或 WANPPPConnection 的 controlURL
  const ctrlMatch = resp.match(/<service>[\s\S]*?<serviceType>(urn:schemas-upnp-org:service:WAN(?:IP|PPP)Connection:1)<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>[\s\S]*?<\/service>/i);
  if (!ctrlMatch) return null;
  const serviceType = ctrlMatch[1];
  const controlURL = ctrlMatch[2];
  const baseUrl = new URL(device.location);
  const fullUrl = `${baseUrl.protocol}//${baseUrl.host}${controlURL}`;

  const body = '<?xml version="1.0"?>\n<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n<s:Body>\n<u:GetExternalIPAddress xmlns:u="' + serviceType + '"></u:GetExternalIPAddress>\n</s:Body>\n</s:Envelope>';

  const result = await soapRequest(fullUrl, serviceType, 'GetExternalIPAddress', body);
  const ipMatch = result.match(/<NewExternalIPAddress>([^<]+)<\/NewExternalIPAddress>/i);
  return ipMatch ? ipMatch[1] : null;
}

async function addPortMapping(device, port) {
  const resp = await fetchXML(device.location);
  if (!resp) return false;
  const ctrlMatch = resp.match(/<service>[\s\S]*?<serviceType>(urn:schemas-upnp-org:service:WAN(?:IP|PPP)Connection:1)<\/serviceType>[\s\S]*?<controlURL>([^<]+)<\/controlURL>[\s\S]*?<\/service>/i);
  if (!ctrlMatch) return false;
  const serviceType = ctrlMatch[1];
  const controlURL = ctrlMatch[2];
  const baseUrl = new URL(device.location);
  const fullUrl = `${baseUrl.protocol}//${baseUrl.host}${controlURL}`;

  const internalIP = getLocalIps()[0] || '127.0.0.1';
  const body = '<?xml version="1.0"?>\n<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">\n<s:Body>\n<u:AddPortMapping xmlns:u="' + serviceType + '">\n<NewRemoteHost></NewRemoteHost>\n<NewExternalPort>' + port + '</NewExternalPort>\n<NewProtocol>TCP</NewProtocol>\n<NewInternalPort>' + port + '</NewInternalPort>\n<NewInternalClient>' + internalIP + '</NewInternalClient>\n<NewEnabled>1</NewEnabled>\n<NewPortMappingDescription>WorkBuddy Mobile Remote</NewPortMappingDescription>\n<NewLeaseDuration>0</NewLeaseDuration>\n</u:AddPortMapping>\n</s:Body>\n</s:Envelope>';

  const result = await soapRequest(fullUrl, serviceType, 'AddPortMapping', body);
  return !result.includes('Fault');
}

async function fetchXML(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function soapRequest(url, serviceType, action, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': `"${serviceType}#${action}"`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 5000,
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ===== 方案 C：Cloudflare Tunnel =====

const CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const CLOUDFLARED_FILE = 'cloudflared.exe';

export function getCloudflaredPath(dataDir) {
  return path.join(dataDir, CLOUDFLARED_FILE);
}

function isCloudflaredInstalled(dataDir) {
  return fs.existsSync(getCloudflaredPath(dataDir));
}

export async function downloadCloudflared(dataDir, log) {
  const exePath = getCloudflaredPath(dataDir);
  if (fs.existsSync(exePath)) return exePath;
  
  log('[cloudflare] 下载 cloudflared.exe ...');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(exePath);
    const handler = (res) => {
      if (res.statusCode === 302 && res.headers.location) {
        https.get(res.headers.location, handler).on('error', reject);
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        log('[cloudflare] 下载完成');
        resolve(exePath);
      });
    };
    https.get(CLOUDFLARED_URL, handler).on('error', (e) => {
      try { fs.unlinkSync(exePath); } catch {}
      log(`[cloudflare] 下载失败: ${e.message}`);
      reject(e);
    });
  });
}

export function startCloudflareTunnel(port, dataDir, token, log) {
  state.cloudflaredClosed = false;
  
  const exePath = getCloudflaredPath(dataDir);
  if (!fs.existsSync(exePath)) {
    log('[cloudflare] cloudflared.exe 不存在，跳过');
    return;
  }

  function launch() {
    if (state.cloudflaredClosed) return;
    log('[cloudflare] 启动 Quick Tunnel ...');
    
    const proc = spawn(exePath, ['tunnel', '--url', `http://localhost:${port}`], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    state.cloudflaredProc = proc;

    let urlFound = false;
    const onUrlFound = (url, dataDir, token, log) => {
      urlFound = true;
      state.cloudflare = { url };
      log(`[cloudflare] Tunnel URL: ${url}`);
      // 立即更新注册中心
      updateRegistry(dataDir, url, token);
      // 启动定时更新（每 5 分钟）
      if (registryTimer) clearInterval(registryTimer);
      registryTimer = setInterval(() => {
        if (state.cloudflare) updateRegistry(dataDir, state.cloudflare.url, token);
      }, 300000);
    };
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
      if (match && !urlFound) onUrlFound(match[0], dataDir, token, log);
    });
    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
      if (match && !urlFound) onUrlFound(match[0], dataDir, token, log);
    });

    proc.on('exit', () => {
      state.cloudflare = null;
      if (!state.cloudflaredClosed) {
        log('[cloudflare] 进程退出，5s 后重启');
        setTimeout(launch, 5000);
      }
    });

    proc.on('error', (e) => {
      log(`[cloudflare] 启动失败: ${e.message}`);
    });
  }

  launch();
}

export function stopCloudflareTunnel() {
  state.cloudflaredClosed = true;
  if (state.cloudflaredProc) {
    try { state.cloudflaredProc.kill(); } catch {}
    state.cloudflaredProc = null;
  }
  state.cloudflare = null;
}

// ===== 统一接口 =====

export async function initConnections(port, token, dataDir, log) {
  const results = {};

  // 方案 A：局域网直连（总是可用）
  state.lan = buildLanUrls(port, token);
  if (state.lan.length) {
    results.lan = state.lan.map(l => l.url);
    log(`[A] 局域网: ${state.lan.map(l => l.url).join(' | ')}`);
  }

  // 方案 B：UPnP（尝试，不阻塞太久）
  state.upnp = await tryUPnP(port);
  if (state.upnp) {
    results.upnp = `http://${state.upnp.ip}:${port}/?token=${token}`;
    log(`[B] 公网(UPnP): ${results.upnp}`);
  } else {
    log('[B] 公网(UPnP): 不可用');
  }

  // 方案 C：Cloudflare Tunnel（仅当 UPnP 不可用时）
  if (!state.upnp) {
    if (!isCloudflaredInstalled(dataDir)) {
      try {
        await downloadCloudflared(dataDir, log);
      } catch {
        log('[C] 隧道: cloudflared 下载失败，跳过');
      }
    }
    if (isCloudflaredInstalled(dataDir)) {
      startCloudflareTunnel(port, dataDir, token, log);
      results.cloudflare = 'pending';
      log('[C] 隧道: 启动中...');
    }
  }

  // 显示固定地址页面（手机收藏这个页面，随时获取最新地址）
  const regPage = getRegistryPageUrl(dataDir);
  log(`[★] 手机收藏: ${regPage}`);
  results.registryPage = regPage;

  return results;
}

export function getConnections(port, token, dataDir) {
  return {
    lan: state.lan.map(l => ({ ip: l.ip, url: l.url, available: true })),
    upnp: state.upnp ? { ip: state.upnp.ip, url: `http://${state.upnp.ip}:${port}/?token=${token}`, available: true } : { available: false },
    cloudflare: state.cloudflare ? { url: `${state.cloudflare.url}/?token=${token}`, available: true } : { available: false },
    registry: dataDir ? { url: getRegistryPageUrl(dataDir), available: true } : { available: false },
  };
}
