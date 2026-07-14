# WorkBuddy 手机版

> 用手机远程操控电脑上的 WorkBuddy AI 助手，随时随地查看任务进展、发送指令、预览产物。

## ✨ 功能亮点

- 📱 **手机远程操控** — 手机浏览器打开即用，无需安装 APP
- 🔄 **实时同步** — 电脑端的任务、对话、产物实时同步到手机
- 🚀 **三层连接方案** — 局域网直连 / UPnP / Cloudflare Tunnel，自动降级
- 💬 **双向对话** — 手机发消息，AI 回复，跟电脑端体验一致
- 📎 **文件上传** — 手机拍照、选文件直接发给 AI
- 📋 **产物预览** — 代码、文档、图表在线预览
- 🔒 **安全认证** — Token 认证

## 🔗 连接方式

| 方式 | 场景 | 需要安装 |
|------|------|---------|
| 局域网直连 | 同一 WiFi | 无 |
| UPnP 端口转发 | 家庭网络 | 无 |
| Cloudflare Tunnel | 公司网络 / 其他 | 自动下载 cloudflared |

Gateway 启动时自动检测可用方式，按优先级 A→B→C 降级。

## 📦 安装

### 电脑端

1. 安装 WorkBuddy 桌面版
2. 下载 [WorkBuddy 手机版安装包](https://github.com/superkc2026/workbuddy-mobile/releases)
3. 运行安装包，自动启动 Gateway
4. 打开手机浏览器，访问显示的地址

### 手机端

直接用浏览器打开 Gateway 地址，无需安装。

## 🏗️ 架构

```
手机浏览器
    ↓ (HTTPS)
Gateway (Node.js, :18787)
    ↓ (ACP)
WorkBuddy 桌面端
    ↓ (API)
AI 模型 (GPT-4o, Claude, GLM 等)
```

## 🛠️ 技术栈

- **Gateway**: Node.js 22, 原生 HTTP 服务器
- **前端**: 单页应用 (PWA), 原生 JS + CSS
- **数据库**: Node.js 内置 node:sqlite
- **连接方案**: 局域网 / UPnP / Cloudflare Tunnel

## 📄 License

MIT

---

Power by 超老师 & WorkBuddy
