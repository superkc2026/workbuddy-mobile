---
name: workbuddy-mobile-setup
version: 2.0.0
description: |
  WorkBuddy 手机版一键部署 Skill。
  自动从 GitHub 下载最新安装包并静默安装，支持首次安装和版本更新。
  触发词：安装手机助手、手机远控、mobile remote、手机版、检测更新、手机助手更新、更新手机版
---

# WorkBuddy 手机版一键部署

## 触发条件

当用户说以下任何一种时触发：
- "安装手机助手"、"手机远控"、"部署手机助手"
- "手机版"、"安装手机版"
- "检测更新"、"手机助手更新"、"更新手机版"、"检查新版本"

## 常量

```
GitHub API: https://api.github.com/repos/superkc2026/workbuddy-mobile/releases/latest
安装目录: C:\Program Files\WorkBuddyMobileRemote
手机入口: https://wb.loveclaw.fun
微云备用下载: https://share.weiyun.com/Bmp7Skyh（GitHub 下载失败时使用）
```

---

## 流程 A：首次安装

### A1. 环境检查

用 PowerShell 检查：
```powershell
# 检查是否已安装
$installed = Test-Path "C:\Program Files\WorkBuddyMobileRemote\server.js"
# 检查 WorkBuddy 是否在运行
$wbRunning = Get-Process WorkBuddy -ErrorAction SilentlyContinue
```

如已安装，跳到流程 B（检查更新）。

### A2. 从 GitHub 下载最新安装包

```powershell
# 1. 查 GitHub 最新版本
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/superkc2026/workbuddy-mobile/releases/latest" -Headers @{ "User-Agent" = "WorkBuddy" }
$tagName = $release.tag_name  # 如 "v2.0.5"

# 2. 找安装包下载地址
$asset = $release.assets | Where-Object { $_.name -like "WorkBuddy-Mobile-*.exe" } | Select-Object -First 1
$downloadUrl = $asset.browser_download_url

# 3. 下载到临时目录
$exePath = "$env:TEMP\$($asset.name)"
Invoke-WebRequest -Uri $downloadUrl -OutFile $exePath -UseBasicParsing
```

> **网络失败处理**：如果 GitHub 下载失败，提示用户：
> "GitHub 下载失败，请手动从微云下载安装包：https://share.weiyun.com/Bmp7Skyh
> 下载后告诉我文件路径，我来帮你安装。"
> 
> 用户提供路径后，用该路径继续 A3。

### A3. 静默安装

```powershell
# 静默安装，默认开启自启和看门狗
Start-Process -FilePath $exePath -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /TASKS=autostart,watchdog" -Wait
```

安装目录默认为 `C:\Program Files\WorkBuddyMobileRemote\`。

### A4. 启动服务

```powershell
# 检查 Gateway 是否已在运行
$healthy = $false
try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:18787/health" -UseBasicParsing -TimeoutSec 3; $healthy = ($r.StatusCode -eq 200) } catch {}

# 如未运行，启动
if (-not $healthy) {
    Start-Process -FilePath "C:\Program Files\WorkBuddyMobileRemote\start.bat" -WindowStyle Hidden
    Start-Sleep 8
}
```

> 如果端口被占用：
> `Get-NetTCPConnection -LocalPort 18787 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
> 然后重新启动。

### A5. 获取访问码并显示结果

```powershell
# 读取访问码
$accessCode = Get-Content "C:\Program Files\WorkBuddyMobileRemote\data\token.txt" -Raw
# 读取版本
$ver = (Get-Content "C:\Program Files\WorkBuddyMobileRemote\version.json" -Raw | ConvertFrom-Json).version
```

**输出**：
```
✅ 安装完成！版本：v<版本号>

你的手机版访问码：<6位码>

手机连接方式：
1. 手机浏览器打开 wb.loveclaw.fun
2. 输入访问码：<6位码>
3. 勾选"记住访问码"，下次自动连接
```

---

## 流程 B：检查更新

### B1. 读取当前版本

```powershell
$localVer = $null
try { $localVer = (Get-Content "C:\Program Files\WorkBuddyMobileRemote\version.json" -Raw | ConvertFrom-Json).version } catch {}
```

### B2. 查 GitHub 最新版本

```powershell
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/superkc2026/workbuddy-mobile/releases/latest" -Headers @{ "User-Agent" = "WorkBuddy" }
$latestVer = $release.tag_name -replace "^v", ""  # 去掉 v 前缀
```

### B3. 比较版本

```powershell
if ($localVer -eq $latestVer) {
    Write-Output "当前版本 v$localVer 已是最新版本"
    return
}
```

如版本相同，告知用户已是最新版，结束。

### B4. 下载并静默安装

```powershell
# 下载最新安装包
$asset = $release.assets | Where-Object { $_.name -like "WorkBuddy-Mobile-*.exe" } | Select-Object -First 1
$exePath = "$env:TEMP\$($asset.name)"
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $exePath -UseBasicParsing

# 停止旧 Gateway
Get-NetTCPConnection -LocalPort 18787 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-Sleep 2

# 静默安装（覆盖）
Start-Process -FilePath $exePath -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /TASKS=autostart,watchdog" -Wait
Start-Sleep 3

# 启动新版本
Start-Process -FilePath "C:\Program Files\WorkBuddyMobileRemote\start.bat" -WindowStyle Hidden
Start-Sleep 8
```

> **网络失败处理**：同 A2。

### B5. 验证并显示结果

```powershell
# 验证
$healthy = $false
try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:18787/health" -UseBasicParsing -TimeoutSec 5; $healthy = ($r.StatusCode -eq 200) } catch {}

# 读取访问码
$accessCode = Get-Content "C:\Program Files\WorkBuddyMobileRemote\data\token.txt" -Raw
$newVer = (Get-Content "C:\Program Files\WorkBuddyMobileRemote\version.json" -Raw | ConvertFrom-Json).version
```

**输出**：
```
✅ 已更新到 v<新版本号>！（从 v<旧版本号> 升级）

手机版访问码：<6位码>
手机入口：wb.loveclaw.fun
```

---

## Mac 平台适配

> 以下流程仅在 macOS 上执行。检测平台：`[[ "$(uname)" == "Darwin" ]]`

### Mac 常量

```
安装目录: ~/WorkBuddy/mobile-remote
GitHub API: https://api.github.com/repos/superkc2026/workbuddy-mobile/releases/latest
手机入口: https://wb.loveclaw.fun
微云备用下载: https://share.weiyun.com/Bmp7Skyh
```

### Mac 流程 A：首次安装

#### Mac-A1. 环境检查

```bash
# 检查是否已安装
INSTALLED="no"
[ -f "$HOME/WorkBuddy/mobile-remote/server.js" ] && INSTALLED="yes"
# 检查 WorkBuddy 是否在运行
pgrep -f "WorkBuddy.app" > /dev/null 2>&1 && echo "WorkBuddy 运行中" || echo "[警告] WorkBuddy 未运行"
# 检查 Node.js
NODE=$(command -v node 2>/dev/null || echo "$HOME/.workbuddy/binaries/node/versions/"*/bin/node 2>/dev/null)
[ -z "$NODE" ] && echo "[错误] 找不到 Node.js"
```

如已安装，跳到 Mac 流程 B（检查更新）。

#### Mac-A2. 从 GitHub 下载安装包

```bash
# 查 GitHub 最新版本
RELEASE=$(curl -sL "https://api.github.com/repos/superkc2026/workbuddy-mobile/releases/latest" -H "User-Agent: WorkBuddy")
# 找 .dmg 或 .zip 安装包下载地址
DOWNLOAD_URL=$(echo "$RELEASE" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*\.dmg"' | head -1 | sed 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"//;s/"$//')
PKG_TYPE="dmg"
# 如果没有 .dmg，找 .zip
if [ -z "$DOWNLOAD_URL" ]; then
  DOWNLOAD_URL=$(echo "$RELEASE" | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*\.zip"' | head -1 | sed 's/.*"browser_download_url"[[:space:]]*:[[:space:]]*"//;s/"$//')
  PKG_TYPE="zip"
fi
# 下载到临时目录
curl -L -o "/tmp/wb-mobile.$PKG_TYPE" "$DOWNLOAD_URL"
```

> **网络失败处理**：如果 GitHub 下载失败，提示用户：
> "GitHub 下载失败，请手动从微云下载安装包：https://share.weiyun.com/Bmp7Skyh
> 下载后告诉我文件路径，我来帮你安装。"

#### Mac-A3. 安装（解压到目标路径）

```bash
# 创建安装目录
mkdir -p "$HOME/WorkBuddy/mobile-remote"

# 如果是 .dmg
if [ "$PKG_TYPE" = "dmg" ]; then
  hdiutil attach /tmp/wb-mobile.dmg -nobrowse -mountpoint /tmp/wb-mobile-mount
  cp -r /tmp/wb-mobile-mount/* "$HOME/WorkBuddy/mobile-remote/"
  hdiutil detach /tmp/wb-mobile-mount
else
  # .zip 解压
  unzip -o /tmp/wb-mobile.zip -d "$HOME/WorkBuddy/mobile-remote/"
fi

# 设置脚本可执行
chmod +x "$HOME/WorkBuddy/mobile-remote/"*.sh
```

#### Mac-A4. 启动服务

```bash
# 检查 Gateway 是否已在运行
HEALTHY="no"
curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:18787/health" --max-time 3 | grep -q 200 && HEALTHY="yes"

# 如未运行，启动
if [ "$HEALTHY" != "yes" ]; then
    cd "$HOME/WorkBuddy/mobile-remote"
    bash start.sh
fi
```

#### Mac-A5. 获取访问码并显示结果

```bash
# 读取 token
TOKEN=$(cat "$HOME/WorkBuddy/mobile-remote/data/token.txt" 2>/dev/null)
# 读取版本
VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$HOME/WorkBuddy/mobile-remote/version.json" | sed 's/.*"version"[[:space:]]*:[[:space:]]*"//;s/"$//')
```

**输出**：
```
✅ 安装完成！版本：v<版本号>

手机连接方式：
1. 手机浏览器打开 wb.loveclaw.fun
2. 输入访问码：<token>
3. 勾选"记住访问码"，下次自动连接

如需开机自启：在安装目录运行 bash install-launchd.sh
```

### Mac 流程 B：检查更新

#### Mac-B1. 读取当前版本

```bash
LOCAL_VER=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$HOME/WorkBuddy/mobile-remote/version.json" 2>/dev/null | sed 's/.*"version"[[:space:]]*:[[:space:]]*"//;s/"$//')
```

#### Mac-B2-B5. 下载、安装、启动、验证

同 Mac-A2 到 Mac-A5，区别是先停旧进程：

```bash
# 停止旧 Gateway
pkill -f "node.*server.js" 2>/dev/null || true
lsof -ti:18787 2>/dev/null | xargs kill -9 2>/dev/null || true
```

然后下载安装包，解压覆盖，重新启动。

---

## 注意事项

1. **不绑定版本号**：本 Skill 永远从 GitHub API 拉最新版本，不需要随安装包更新而修改 Skill
2. **静默安装参数**：`/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /TASKS=autostart,watchdog`
3. **访问码不变**：更新覆盖安装不会清除 `data/token.txt`，用户访问码保持不变
4. **Cloudflare Tunnel 自动启动**：安装后 Gateway 会自动检测网络并启动 Cloudflare Tunnel
5. **微云备用**：GitHub 下载失败时，引导用户从微云手动下载
