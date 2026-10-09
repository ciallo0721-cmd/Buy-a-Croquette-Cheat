#Requires -Version 5.0
<#
===============================================================================
  「买个可乐饼吧！」外挂 · 无限可乐饼  —— 卸载 / 还原脚本
===============================================================================
  用法：
    双击 uninstall.bat
    或  powershell -ExecutionPolicy Bypass -File uninstall.ps1
    或  powershell -ExecutionPolicy Bypass -File uninstall.ps1 -GamePath "X:\...\Buy a Croquette" -RestoreSave
===============================================================================
#>
[CmdletBinding()]
param(
    [string]$GamePath = '',
    [switch]$RestoreSave
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib.ps1')

Clear-Host
Head '买个可乐饼吧! · 无限可乐饼  —— 卸载 / 还原'
Say ''

# --- 1. 定位游戏 ---
$target = Resolve-GameTarget -GamePath $GamePath
if ($target -eq '') {
    Fail '没有找到游戏。'
    Say '  请使用 -GamePath 参数手动指定安装目录。' 'Yellow'
    exit 1
}
Ok "游戏目录: $target"

$jsDir      = Join-Path $target 'www\js'
$pluginsDir = Join-Path $jsDir 'plugins'
$pluginsJs  = Join-Path $jsDir 'plugins.js'
$saveDir    = Join-Path $target 'www\save'

# --- 2. 挑一份备份 ---
$backupRoot = Get-LatestBackup -GameDir $target
$backupJs   = ''
if ($backupRoot -ne '') {
    $cand = Join-Path $backupRoot 'plugins.js.bak'
    if (Test-Path -LiteralPath $cand) { $backupJs = $cand }
}
if ($backupRoot -ne '') { Ok ('找到备份: ' + $backupRoot) } else { Warn '没有找到任何备份目录。' }

# --- 3. 从 plugins.js 里摘掉插件条目 ---
Head '1/3  注销插件条目'
try {
    $cnt = Set-PluginsEntry -path $pluginsJs -Remove $true
    Ok ('已移除条目，剩余插件 ' + $cnt + ' 项')
} catch {
    Fail ('修改 plugins.js 失败: ' + $_.Exception.Message)
    exit 1
}

if (-not (Test-PluginsJs -path $pluginsJs)) {
    if ($backupJs -ne '') {
        Copy-Item -LiteralPath $backupJs -Destination $pluginsJs -Force
        Warn '校验失败，已从备份还原 plugins.js。'
    } else {
        Fail '校验失败且没有备份可用，请手动检查 plugins.js。'
        exit 1
    }
} else {
    Ok 'plugins.js 语法校验通过'
}

# --- 4. 删除插件文件 ---
Head '2/3  删除插件文件'
foreach ($f in @($PluginFile, $LegacyFile)) {
    $p = Join-Path $pluginsDir $f
    if (Test-Path -LiteralPath $p) {
        Remove-Item -LiteralPath $p -Force
        Ok ('已删除 ' + $f)
    } else {
        Warn ($f + ' 不存在，跳过。')
    }
}

# --- 5. 可选：还原存档 ---
Head '3/3  存档处理'
if ($RestoreSave) {
    $bkSave = ''
    if ($backupRoot -ne '') {
        $c = Join-Path $backupRoot 'save'
        if (Test-Path -LiteralPath $c) { $bkSave = $c }
    }
    if ($bkSave -ne '') {
        Copy-Item -Path (Join-Path $bkSave '*') -Destination $saveDir -Recurse -Force -ErrorAction SilentlyContinue
        Ok ('存档已从 ' + $bkSave + ' 还原')
    } else {
        Warn '没有可用的存档备份。'
    }
} else {
    Say '  未启用存档还原（加 -RestoreSave 参数可从备份覆盖存档）。' 'DarkGray'
    Say '  你的存档保持现状，不会被改动。' 'DarkGray'
}

Say ''
Say '  卸载完成：插件已移除，plugins.js 已还原到未注入状态。' 'Green'
Say '  （_cheat_backup_* 备份目录保留着，确认没问题后可自行删除）' 'DarkGray'
Say ''
