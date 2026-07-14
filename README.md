# WorkBuddy 手机版

> 用手机远程操控电脑上的 WorkBuddy AI 助手，随时随地查看任务进展、发送指令、预览产物。

## ✨ 功能亮点

- 📱 **手机远程操控** — 手机浏览器打开即用，无需安装 APP
- 🔄 **实时同步** — 电脑端的任务、对话、产物实时同步到手机
- 🚀 **三层连接方案** — 局域网直连 / UPnP / Cloudflare Tunnel，自动降级，零配置
- 💬 **双向对话** — 手机发消息，AI 回复，跟电脑端体验一致
- 📎 **文件上传** — 手机拍照、选文件直接发给 AI
- 📋 **产物预览** — 代码、文档、图表在线预览
- 🔒 **安全认证** — Token 认证，保护隐私
- 📊 **积分统计** — 今日消耗 + 累计使用一目了然
- 📝 **反馈通道** — 内置需求建议和问题反馈，自动收集系统信息

## 🔗 连接方式

| 方式 | 场景 | 需要安装 | 速度 |
|------|------|---------|------|
| 局域网直连 | 同一 WiFi | 无 | ⚡ 最快 |
| UPnP 端口转发 | 家庭网络 | 无 | 🚀 快 |
| Cloudflare Tunnel | 公司网络 / 任何网络 | 自动下载 cloudflared | ✅ 稳定 |

Gateway 启动时自动检测可用方式，按优先级 A→B→C 降级。**用户无需手动配置，打开即用。**

### 固定地址访问

电脑重启后 Cloudflare Tunnel 地址会变化。Gateway 自动把最新地址推送到固定页面：

```
https://wb.loveclaw.fun/<你的设备ID>
```

手机收藏这个页面，每次打开就能看到最新的连接地址，点击"连接"即可。

## 📦 安装

### 电脑端

1. 安装 [WorkBuddy 桌面版](https://www.codebuddy.cn/)
2. 下载 [WorkBuddy 手机版安装包](https://github.com/superkc2026/workbuddy-mobile/releases)
3. 双击运行安装包，自动完成所有配置
4. 安装完成后，Gateway 自动启动

### 手机端

无需安装任何东西，用浏览器打开 Gateway 地址即可。

**获取地址的方式（任选其一）：**
- 打开电脑端 WorkBuddy，问它"手机版地址是什么"
- 打开固定页面 `https://wb.loveclaw.fun/<你的设备ID>`，点击"连接"
- 在同 WiFi 下，直接访问局域网 IP

## 🏗️ 架构

```
手机浏览器
    ↓ (HTTPS / HTTP)
Gateway (Node.js, :18787)
    ↓ (ACP 协议)
WorkBuddy 桌面端
    ↓ (API)
AI 模型 (GPT-4o, Claude, GLM 等)
```

### 三层连接方案

```
Gateway 启动
  ├── A 检测局域网 IP → 192.168.x.x:18787（同 WiFi 用户）
  ├── B 尝试 UPnP → 公网IP:18787（家庭网络用户）
  └── C 启动 Cloudflare Tunnel → xxx.trycloudflare.com（公司/其他网络用户）
```

每层独立运行，自动降级。用户电脑自己当服务器，不依赖任何中心节点。

## 🛠️ 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| Gateway | Node.js 22 | 原生 HTTP 服务器，端口 18787 |
| 前端 | PWA | 单页应用，原生 JS + CSS，支持离线缓存 |
| 数据库 | node:sqlite | Node.js 内置 SQLite，无需外部依赖 |
| 连接方案 | 局域网 / UPnP / Cloudflare Tunnel | 三层自动降级 |
| 反馈收集 | 内置反馈系统 | 自动收集系统信息，存储在云端 |

## 📋 系统要求

| 项目 | 要求 |
|------|------|
| 操作系统 | Windows 10/11 |
| Node.js | 22+（安装包已内置） |
| WorkBuddy | 最新版 |
| 手机 | 任何有浏览器的设备 |
| 网络 | WiFi / 移动网络均可 |

## ❓ 常见问题

<details>
<summary><b>手机打不开 Gateway 地址？</b></summary>

- 确认电脑已开机且 WorkBuddy 正在运行
- 确认 Gateway 在运行（电脑端问 WorkBuddy "手机版地址"）
- 如果在公司网络，Cloudflare Tunnel 会自动启动，可能需要等 10-30 秒
- 打开固定页面 `https://wb.loveclaw.fun/<设备ID>` 查看最新地址
</details>

<details>
<summary><b>手机看不到任务列表？</b></summary>

- 下拉刷新页面
- 确认电脑端 WorkBuddy 有任务在运行
- 清除浏览器缓存后重试
</details>

<details>
<summary><b>发消息后没收到回复？</b></summary>

- 确认电脑端 WorkBuddy 桌面版正在运行
- AI 处理可能需要几秒到几十秒
- 如果长时间没回复，可能是 serve 进程未启动，在电脑端重新打开 WorkBuddy
</details>

<details>
<summary><b>电脑重启后手机连不上了？</b></summary>

Cloudflare Tunnel 的地址每次重启都会变。打开固定页面 `https://wb.loveclaw.fun/<设备ID>` 获取最新地址。如果 Gateway 配置了开机自启，重启后等 30 秒即可。
</details>

## 🔄 更新日志

### v2.0.4 (2026-07-14)

**新功能：**
- 三层连接方案（局域网 / UPnP / Cloudflare Tunnel）
- 内置反馈系统（需求建议 + 问题反馈）
- 今日积分统计
- 飞书群入口
- 固定地址页面（wb.loveclaw.fun）

**优化：**
- node:sqlite 替代 Python（消除外部依赖）
- 消息历史上限提升到 128MB
- 设置页 Tab 样式重构
- Logo 更新

**修复：**
- 手机看不到任务列表（Python 进程失败）
- ACP 超时后 serve 进程杀不掉
- 消息历史被 32MB 截断
- 今日积分计算错误

### v2.0.3 (2026-07-13)

- Relay 中继模式
- PWA 通过 Relay 访问
- 自建 DERP 中继
- Android APK 打包

## 📄 License

MIT

---

<div align="center">

**Power by 超老师 & WorkBuddy**

[下载安装包](https://github.com/superkc2026/workbuddy-mobile/releases) · [反馈建议](https://github.com/superkc2026/workbuddy-mobile/issues) · [飞书群](https://wb.loveclaw.fun/wb)

</div>
