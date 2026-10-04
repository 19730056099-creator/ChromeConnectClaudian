# Send to Claudian 一键安装
# 1. 找到所有装了 Claudian 的 Obsidian vault，安装并启用 Claudian Bridge
# 2. 生成（或复用）token，同时写入桥接插件和 Chrome 扩展，无需手动粘贴
# 3. 打开 Chrome 扩展页，引导加载扩展

param([switch]$NoLaunch)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$PluginId = "claudian-bridge"
$ClaudianId = "realclaudian"
$Port = 27125
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-Json($path, $obj) {
  [IO.File]::WriteAllText($path, ($obj | ConvertTo-Json -Depth 5), $Utf8)
}

Write-Host "=== Send to Claudian 安装 ===" -ForegroundColor Cyan

# ---- 找 vault ----
$obsidianJson = Join-Path $env:APPDATA "obsidian\obsidian.json"
if (-not (Test-Path $obsidianJson)) { throw "未找到 Obsidian 配置：$obsidianJson" }
$vaultCfg = [IO.File]::ReadAllText($obsidianJson, $Utf8) | ConvertFrom-Json
$vaults = @($vaultCfg.vaults.PSObject.Properties | ForEach-Object { $_.Value.path } |
  Where-Object { Test-Path (Join-Path $_ ".obsidian\plugins\$ClaudianId") })
if ($vaults.Count -eq 0) { throw "没有找到安装了 Claudian 的 vault" }

# ---- token：复用已有的，保证重复安装后配对不失效 ----
$token = $null
foreach ($v in $vaults) {
  $data = Join-Path $v ".obsidian\plugins\$PluginId\data.json"
  if (Test-Path $data) {
    $old = [IO.File]::ReadAllText($data, $Utf8) | ConvertFrom-Json
    if ($old.token) { $token = $old.token; if ($old.port) { $Port = [int]$old.port }; break }
  }
}
if (-not $token) {
  $bytes = New-Object byte[] 16
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

# ---- 安装桥接插件 ----
foreach ($v in $vaults) {
  $dest = Join-Path $v ".obsidian\plugins\$PluginId"
  New-Item -ItemType Directory -Force $dest | Out-Null
  Copy-Item (Join-Path $Root "obsidian-bridge\manifest.json"), (Join-Path $Root "obsidian-bridge\main.js") $dest -Force
  Write-Json (Join-Path $dest "data.json") ([ordered]@{ port = $Port; token = $token })

  $cp = Join-Path $v ".obsidian\community-plugins.json"
  $enabled = @()
  if (Test-Path $cp) {
    $parsed = [IO.File]::ReadAllText($cp, $Utf8) | ConvertFrom-Json
    foreach ($p in $parsed) { $enabled += $p }
  }
  if ($enabled -notcontains $PluginId) {
    $enabled += $PluginId
    [IO.File]::WriteAllText($cp, (ConvertTo-Json -InputObject @($enabled)), $Utf8)
  }
  Write-Host "  [OK] 已安装到 vault：$v" -ForegroundColor Green
}

# ---- 把 token 写进 Chrome 扩展 ----
$ext = Join-Path $Root "chrome-extension"
$config = "// 由 install.bat 自动生成，请勿手动修改`nself.CLAUDIAN_CONFIG = { port: $Port, token: `"$token`" };`n"
[IO.File]::WriteAllText((Join-Path $ext "config.js"), $config, $Utf8)
Write-Host "  [OK] Chrome 扩展已写入 token" -ForegroundColor Green

# ---- 引导加载 Chrome 扩展 ----
if (-not $NoLaunch) { Set-Clipboard -Value $ext }
Write-Host ""
Write-Host "接下来只需两步：" -ForegroundColor Yellow
Write-Host "  1. 重启 Obsidian（如果正开着），让 Claudian Bridge 生效"
Write-Host "  2. 在刚打开的 Chrome 扩展页：打开右上角「开发者模式」->「加载已解压的扩展程序」"
Write-Host "     选择文件夹（路径已复制到剪贴板，可直接粘贴）："
Write-Host "     $ext" -ForegroundColor Cyan
Write-Host "  已经加载过扩展的话，在扩展页点它的刷新按钮即可。"
if (-not $NoLaunch) { try { Start-Process "chrome.exe" "chrome://extensions" } catch { Write-Host "  （未能自动打开 Chrome，请手动访问 chrome://extensions）" } }
