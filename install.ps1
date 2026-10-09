#Requires -Version 5.0
<#
===============================================================================
  「买个可乐饼吧！」外挂 · 无限可乐饼  —— 安装脚本
===============================================================================
  用法：
    双击 install.bat
    或  powershell -ExecutionPolicy Bypass -File install.ps1
    或  powershell -ExecutionPolicy Bypass -File install.ps1 -GamePath "X:\...\Buy a Croquette"
===============================================================================
#>
[CmdletBinding()]
param(
    [string]$GamePath = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

$SrcPlugin = Join-Path $PSScriptRoot ('plugin\' + $PluginFile)

Clear-Host
Head '买个可乐饼吧! · 无限可乐饼  —— 安装程序'
Say ''

# --- 0. 自检 ---
if (-not (Test-Path -LiteralPath $SrcPlugin)) {
    Fail "找不到插件文件：$SrcPlugin"
    Say '  请确保 install.ps1、lib.ps1 与 plugin 文件夹在同一目录下。' 'DarkGray'
    exit 1
}

# --- 1. 定位游戏 ---
$target = Resolve-GameTarget -GamePath $GamePath
if ($target -eq '') {
    Fail '没有找到游戏。'
    Say ''
    Say '  请手动指定，例如：' 'Yellow'
    Say '    powershell -ExecutionPolicy Bypass -File install.ps1 -GamePath "I:\SteamLibrary\steamapps\common\Buy a Croquette"' 'Gray'
    exit 1
}
Ok "游戏目录: $target"

$jsDir      = Join-Path $target 'www\js'
$pluginsDir = Join-Path $jsDir 'plugins'
$pluginsJs  = Join-Path $jsDir 'plugins.js'
$saveDir    = Join-Path $target 'www\save'

foreach ($p in @($jsDir, $pluginsDir)) {
    if (-not (Test-Path -LiteralPath $p)) { Fail "目录缺失: $p"; exit 1 }
}
if (-not (Test-Path -LiteralPath $pluginsJs)) { Fail "找不到 plugins.js: $pluginsJs"; exit 1 }

# --- 2. 备份 ---
Head '1/4  备份原始文件'
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupRoot = Join-Path $target ('_cheat_backup_' + $stamp)
$null = New-Item -ItemType Directory -Path $backupRoot -Force
Copy-Item -LiteralPath $pluginsJs -Destination (Join-Path $backupRoot 'plugins.js.bak') -Force
Ok ('plugins.js -> ' + (Join-Path $backupRoot 'plugins.js.bak'))

if (Test-Path -LiteralPath $saveDir) {
    $saveBk = Join-Path $backupRoot 'save'
    $null = New-Item -ItemType Directory -Path $saveBk -Force
    Copy-Item -Path (Join-Path $saveDir '*') -Destination $saveBk -Recurse -Force -ErrorAction SilentlyContinue
    $cnt = @(Get-ChildItem -LiteralPath $saveBk -File -Recurse -ErrorAction SilentlyContinue).Count
    Ok ('存档 ' + $cnt + ' 个文件 -> ' + $saveBk)
} else {
    Warn '未找到存档目录，跳过。'
}

# --- 3. 安装插件 ---
Head '2/4  安装插件文件'
Copy-Item -LiteralPath $SrcPlugin -Destination (Join-Path $pluginsDir $PluginFile) -Force
Ok ($PluginFile + '  ->  www\js\plugins\')

$legacyPath = Join-Path $pluginsDir $LegacyFile
if (Test-Path -LiteralPath $legacyPath) {
    Remove-Item -LiteralPath $legacyPath -Force
    Ok ('已清理旧版插件 ' + $LegacyFile)
}

# --- 4. 注册到插件列表 ---
Head '3/4  注册到 plugins.js'
$before = (Get-PluginNames -path $pluginsJs).Count
$after  = Set-PluginsEntry -path $pluginsJs -Remove $false
Ok ('插件条目 ' + $before + ' -> ' + $after + ' （已写入 ' + $PluginName + '）')

if (-not (Test-PluginsJs -path $pluginsJs)) {
    Copy-Item -LiteralPath (Join-Path $backupRoot 'plugins.js.bak') -Destination $pluginsJs -Force
    Fail '写入后校验失败，已自动还原 plugins.js。'
    Say ('  备份位于: ' + $backupRoot) 'Gray'
    exit 1
}
Ok 'plugins.js 语法校验通过'

# --- 5. 完成 ---
Head '4/4  完成'
Say ''
Say '  补丁已安装：' 'Green'
Say '    * 新游戏开局  ->  持有 380 円' 'White'
Say '    * 新游戏开局  ->  99 个市村可乐饼' 'White'
Say '    * 无限模式    ->  可乐饼数量永不低于 99' 'White'
Say '    * 开局声明    ->  7 页版权声明，按确定键逐页跳过' 'White'
Say ''
if (Test-Path -LiteralPath (Join-Path $target 'nw.exe')) {
    Say '  启动游戏请运行:  nw.exe' 'Yellow'
    Say '  （Game.exe 是引擎本体，双击它无法启动）' 'DarkGray'
} else {
    Say '  启动方式：Steam 库中直接启动游戏。' 'Yellow'
}
Say ''
Say '  注意：补丁只影响【新档】。读档不会追溯生效。' 'Yellow'
Say '  还原方法：双击 uninstall.bat。' 'DarkGray'
Say ''
Say ('  本次备份目录: ' + $backupRoot) 'DarkGray'
Say ''
