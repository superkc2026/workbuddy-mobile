# WorkBuddy 手机远程助手一键部署脚本
# 用法: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Continue"
$installdir = "C:\Program Files\WorkBuddyMobileRemote"
$tempDir = $env:TEMP

function Write-Step($msg) { Write-Host "`n[部署] $msg" -ForegroundColor Cyan }
function Write-OK($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "  ✗ $msg" -ForegroundColor Red }

# ===== Step 1: Environment Check =====
Write-Step "检查环境..."

# Check Node.js
$nodeOk = $false
try { $nodeVer = & node --version 2>$null; if ($nodeVer) { $nodeOk = $true; Write-OK "Node.js $nodeVer" } } catch {}
if (-not $nodeOk) {
    # Try WorkBuddy bundled node
    $wbNode = Get-ChildItem "$env:USERPROFILE\.workbuddy\binaries\node\versions" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($wbNode -and (Test-Path "$($wbNode.FullName)\node.exe")) {
        $env:PATH = "$($wbNode.FullName);$env:PATH"
        Write-OK "Node.js (WorkBuddy bundled)"
    } else {
        Write-Err "Node.js 不可用，请先安装 Node.js 22+: https://nodejs.org/"
        exit 1
    }
}

# Check WorkBuddy running
$wbProc = Get-Process -Name "WorkBuddy" -ErrorAction SilentlyContinue
if ($wbProc) { Write-OK "WorkBuddy 正在运行" }
else { Write-Warn "WorkBuddy 未运行，请先打开 WorkBuddy 桌面端并登录" }

# Check Tailscale installed
$tsInstalled = Test-Path "C:\Program Files\Tailscale\tailscale.exe"
if ($tsInstalled) { Write-OK "Tailscale 已安装" }
else { Write-Warn "Tailscale 未安装，将自动安装" }

# Check WorkBuddy Mobile Remote installed
$wbmrInstalled = Test-Path "$installdir\server.js"
if ($wbmrInstalled) { Write-OK "WorkBuddy 手机助手已安装" }
else { Write-Warn "WorkBuddy 手机助手未安装，将自动安装" }

# ===== Step 2: Install Tailscale =====
if (-not $tsInstalled) {
    Write-Step "下载 Tailscale 安装包..."
    $tsInstaller = "$tempDir\tailscale-setup.exe"
    try {
        Invoke-WebRequest -Uri "https://share.weiyun.com/Jf2YaBE3" -OutFile $tsInstaller -UseBasicParsing -MaximumRedirection 10
        Write-OK "下载完成"
    } catch {
        Write-Warn "微云下载失败，尝试官方地址..."
        try {
            Invoke-WebRequest -Uri "https://tailscale.com/download/windows" -OutFile $tsInstaller -UseBasicParsing -MaximumRedirection 10
            Write-OK "下载完成"
        } catch {
            Write-Warn "自动下载失败，请手动下载: https://tailscale.com/download/windows"
        Write-Host "  下载后放到 $tsInstaller 再重新运行此脚本"
        exit 1
    }

    Write-Step "安装 Tailscale（需要管理员权限）..."
    try {
        Start-Process -FilePath $tsInstaller -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART" -Wait -Verb RunAs
        Write-OK "Tailscale 安装完成"
    } catch {
        Write-Warn "静默安装失败，请手动双击 $tsInstaller 安装"
        Start-Process $tsInstaller
        Read-Host "安装完成后按回车继续"
    }
}

# Start Tailscale and prompt login
$tsRunning = Get-Process -Name "tailscale-ipn" -ErrorAction SilentlyContinue
if (-not $tsRunning) {
    Start-Process "C:\Program Files\Tailscale\tailscale-ipn.exe" -ErrorAction SilentlyContinue
}

# Check Tailscale connected
$tsIp = $null
try { $tsIp = (& "C:\Program Files\Tailscale\tailscale.exe" ip -4 2>$null | Select-Object -First 1) } catch {}
if (-not $tsIp) {
    Write-Step "Tailscale 需要登录"
    Write-Host "  请点击屏幕右下角的 Tailscale 图标，选择 Log in"
    Write-Host "  用 Google/微软/苹果账号登录"
    Write-Host "  登录完成后按回车继续..."
    Read-Host
    # Retry get IP
    try { $tsIp = (& "C:\Program Files\Tailscale\tailscale.exe" ip -4 2>$null | Select-Object -First 1) } catch {}
}

if ($tsIp) { Write-OK "Tailscale IP: $tsIp" }
else { Write-Warn "无法获取 Tailscale IP，稍后手动查看" }

# ===== Step 3: Install WorkBuddy Mobile Remote =====
if (-not $wbmrInstalled) {
    Write-Step "下载 WorkBuddy 手机远程助手安装包..."
    $wbmrInstaller = "$tempDir\WorkBuddyMobileRemote-Setup.exe"
    try {
        Invoke-WebRequest -Uri "https://share.weiyun.com/Bmp7Skyh" -OutFile $wbmrInstaller -UseBasicParsing -MaximumRedirection 10
        Write-OK "下载完成"
    } catch {
        Write-Warn "下载失败，请手动下载: https://share.weiyun.com/Bmp7Skyh"
        Write-Host "  下载后放到 $wbmrInstaller 再重新运行此脚本"
        exit 1
    }

    Write-Step "安装 WorkBuddy 手机远程助手..."
    try {
        Start-Process -FilePath $wbmrInstaller -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /TASKS=autostart,watchdog" -Wait
        Write-OK "安装完成"
    } catch {
        Write-Warn "静默安装失败，请手动双击 $wbmrInstaller 安装"
        Start-Process $wbmrInstaller
        Read-Host "安装完成后按回车继续"
    }
}

# ===== Step 4: Start Service =====
Write-Step "检查服务状态..."
$healthy = $false
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:18787/health" -UseBasicParsing -TimeoutSec 3
    if ($resp.StatusCode -eq 200) { $healthy = $true; Write-OK "服务已在运行" }
} catch {}

if (-not $healthy) {
    Write-Step "启动服务..."
    $startBat = "$installdir\start.bat"
    if (Test-Path $startBat) {
        Start-Process -FilePath $startBat -WindowStyle Minimized
        Start-Sleep 5
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:18787/health" -UseBasicParsing -TimeoutSec 5
            if ($resp.StatusCode -eq 200) { $healthy = $true; Write-OK "服务已启动" }
        } catch {}
    }
    if (-not $healthy) { Write-Err "服务启动失败，请手动运行 $startBat" }
}

# ===== Step 5: Show Result =====
Write-Step "获取访问信息..."
$token = ""
$tokenFile = "$installdir\data\token.txt"
if (Test-Path $tokenFile) { $token = (Get-Content $tokenFile -Raw).Trim() }

if (-not $tsIp) {
    try { $tsIp = (& "C:\Program Files\Tailscale\tailscale.exe" ip -4 2>$null | Select-Object -First 1) } catch {}
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 部署完成！" -ForegroundColor Green
Write-Host ""
if ($tsIp -and $token) {
    Write-Host " 手机访问地址: http://$tsIp`:18787/?token=$token" -ForegroundColor White
} else {
    Write-Host " 手机访问地址: 请查看服务启动窗口显示的地址" -ForegroundColor Yellow
}
Write-Host ""
Write-Host " 下一步：" -ForegroundColor Cyan
Write-Host " 1. 手机安装 Tailscale（Android 下载 APK，iPhone 在 App Store 搜索）"
Write-Host " 2. 用同一个账号登录 Tailscale"
Write-Host " 3. 手机浏览器打开上面的地址"
Write-Host " 4. 收藏到桌面"
Write-Host "========================================" -ForegroundColor Cyan
