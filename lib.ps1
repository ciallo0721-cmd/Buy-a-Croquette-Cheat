#Requires -Version 5.0
<#
===============================================================================
  lib.ps1 —— 「买个可乐饼吧！· 无限可乐饼」公共函数库
  由 install.ps1 / uninstall.ps1 点源加载，不单独运行。

  注意：本文件刻意【不使用 ConvertFrom-Json / ConvertTo-Json】。
  PowerShell 5.1 的 ConvertFrom-Json 碰到空字符串键名会抛
  PSArgumentException，而本作的 MK_SimpleGreenworks 插件参数里正好有一个空键，
  一旦调用就爆炸。因此这里改用「括号深度扫描 + 纯文本手术」，
  只动我们要动的那一条，其余 49 条原样保留、逐字节不变。
===============================================================================
#>

$PluginName = 'KC_InfiniteCroquette'
$PluginFile = 'KC_InfiniteCroquette.js'
$LegacyName = 'KC_StarterCroquette'
$LegacyFile = 'KC_StarterCroquette.js'

function Say  ($m, $c) { if ($c) { Write-Host $m -ForegroundColor $c } else { Write-Host $m } }
function Head ($m) {
    Write-Host ''
    Write-Host ('=' * 64) -ForegroundColor DarkCyan
    Write-Host ("  $m") -ForegroundColor Cyan
    Write-Host ('=' * 64) -ForegroundColor DarkCyan
}
function Ok   ($m) { Write-Host ("  [OK]   " + $m) -ForegroundColor Green }
function Warn ($m) { Write-Host ("  [警告] " + $m) -ForegroundColor Yellow }
function Fail ($m) { Write-Host ("  [失败] " + $m) -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 判断目录是不是目标游戏
# ---------------------------------------------------------------------------
function Test-GameDir {
    param([string]$p)
    if ([string]::IsNullOrWhiteSpace($p)) { return $false }
    if (-not (Test-Path -LiteralPath $p)) { return $false }
    $items = Join-Path $p 'www\data\Items.json'
    $pkg   = Join-Path $p 'package.json'
    if (-not (Test-Path -LiteralPath $items)) { return $false }
    if (-not (Test-Path -LiteralPath $pkg))   { return $false }
    try {
        $txt = [IO.File]::ReadAllText($items, [Text.Encoding]::UTF8)
        if ($txt.IndexOf('市村') -lt 0)   { return $false }
        if ($txt.IndexOf('可乐饼') -lt 0) { return $false }
    } catch { return $false }
    return $true
}

# ---------------------------------------------------------------------------
# 自动探测游戏目录（Steam 库 + 逐盘符兜底）
# ---------------------------------------------------------------------------
function Find-GameDirs {
    $found = New-Object System.Collections.Generic.List[string]
    $roots = New-Object System.Collections.Generic.List[string]

    try {
        $sp = (Get-ItemProperty -Path 'HKCU:\Software\Valve\Steam' -Name SteamPath -ErrorAction Stop).SteamPath
        if ($sp) { $roots.Add($sp) }
    } catch { }
    foreach ($k in @('HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam')) {
        try {
            $sp = (Get-ItemProperty -Path $k -Name InstallPath -ErrorAction Stop).InstallPath
            if ($sp) { $roots.Add($sp) }
        } catch { }
    }

    $vdfs = @()
    foreach ($r in $roots) { $vdfs += (Join-Path $r 'steamapps\libraryfolders.vdf') }
    $vdfs += 'C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf'
    $vdfs += 'C:\Program Files\Steam\steamapps\libraryfolders.vdf'
    foreach ($v in ($vdfs | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $v) {
            try {
                $t = [IO.File]::ReadAllText($v)
                foreach ($m in [regex]::Matches($t, '"path"\s*"([^"]+)"')) {
                    $roots.Add(($m.Groups[1].Value -replace '\\\\', '\'))
                }
            } catch { }
        }
    }

    $drives = @()
    try { $drives = Get-PSDrive -PSProvider FileSystem -ErrorAction Stop | ForEach-Object { $_.Root } } catch { }
    foreach ($d in $drives) {
        $roots.Add((Join-Path $d 'SteamLibrary'))
        $roots.Add((Join-Path $d 'Steam'))
        $roots.Add((Join-Path $d 'Program Files (x86)\Steam'))
        $roots.Add((Join-Path $d 'Games\Steam'))
    }

    $subs = @(
        'steamapps\common\Buy a Croquette',
        'steamapps\common\BuyACroquette',
        'steamapps\common\Buy_a_Croquette'
    )
    foreach ($r in ($roots | Select-Object -Unique)) {
        foreach ($s in $subs) {
            $p = Join-Path $r $s
            if (Test-Path -LiteralPath $p) {
                if (Test-GameDir $p) {
                    if (-not $found.Contains($p)) { $found.Add($p) }
                }
            }
        }
    }
    return $found
}

# ---------------------------------------------------------------------------
# plugins.js —— 顶层对象扫描器
#   用括号深度 + 字符串状态机切出数组里的每一个顶层 { ... }，
#   正确处理字符串内的 {} 与转义反斜杠。
# ---------------------------------------------------------------------------
function Split-TopLevelObjects {
    param([string]$arr)
    $objs  = New-Object System.Collections.Generic.List[string]
    $depth = 0
    $start = -1
    $inStr = $false
    $esc   = $false

    for ($i = 0; $i -lt $arr.Length; $i++) {
        $c = $arr[$i]
        if ($inStr) {
            if ($esc) { $esc = $false }
            elseif ($c -eq '\') { $esc = $true }
            elseif ($c -eq '"') { $inStr = $false }
            continue
        }
        if ($c -eq '"') { $inStr = $true; continue }
        if ($c -eq '{') {
            if ($depth -eq 0) { $start = $i }
            $depth++
            continue
        }
        if ($c -eq '}') {
            $depth--
            if ($depth -eq 0 -and $start -ge 0) {
                $objs.Add($arr.Substring($start, $i - $start + 1))
                $start = -1
            }
            if ($depth -lt 0) { throw 'plugins.js 花括号不配对' }
            continue
        }
    }
    if ($depth -ne 0) { throw 'plugins.js 花括号不配对' }
    return ,$objs
}

function Get-PluginObjects {
    param([string]$path)
    $raw = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
    $s = $raw.IndexOf('[')
    $e = $raw.LastIndexOf(']')
    if ($s -lt 0 -or $e -le $s) { throw 'plugins.js 结构异常：找不到插件数组' }
    $arr = $raw.Substring($s, $e - $s + 1)
    $objs = Split-TopLevelObjects -arr $arr
    return @{ Raw = $raw; Head = $raw.Substring(0, $s); Tail = $raw.Substring($e + 1); Objects = $objs }
}

function Get-PluginName {
    param([string]$obj)
    $m = [regex]::Match($obj, '"name"\s*:\s*"((?:[^"\\]|\\.)*)"')
    if ($m.Success) { return $m.Groups[1].Value }
    return ''
}

function Get-PluginNames {
    param([string]$path)
    $info = Get-PluginObjects -path $path
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($o in $info.Objects) { $names.Add((Get-PluginName -obj $o)) }
    return ,$names
}

# 新插件条目的字面量（单行紧凑 JSON，与 MV 生成格式一致）
function New-PluginEntryText {
    $d = '开局资源注入 + 无限可乐饼（380 円 / 99 个）'
    return '{"name":"' + $PluginName + '","status":true,"description":"' + $d +
           '","parameters":{"Starting Gold":"380","Croquette Item ID":"2",' +
           '"Croquette Amount":"99","Infinite Mode":"always",' +
           '"Notice Face":"qianxu4","Notice Face Index":"0"}}'
}

# ---------------------------------------------------------------------------
# 写入：保留其余条目原文，只增/删我们这一条
# ---------------------------------------------------------------------------
function Set-PluginsEntry {
    param([string]$path, [bool]$Remove)

    $info = Get-PluginObjects -path $path
    $before = $info.Objects.Count

    $kept = New-Object System.Collections.Generic.List[string]
    $removed = 0
    foreach ($o in $info.Objects) {
        $n = Get-PluginName -obj $o
        if ($n -eq $PluginName) { $removed++; continue }
        if ($n -eq $LegacyName) { $removed++; continue }   # 旧版条目一律清掉，避免指向已删除的文件
        $kept.Add($o)
    }

    if (-not $Remove) { $kept.Add((New-PluginEntryText)) }

    $nl  = "`r`n"
    $arr = '[' + $nl + ($kept -join (',' + $nl)) + $nl + ']'
    $new = $info.Head + $arr + $info.Tail

    [IO.File]::WriteAllText($path, $new, (New-Object Text.UTF8Encoding($false)))

    # 写入后立刻用同一个扫描器复核
    $chk = Get-PluginObjects -path $path
    $expect = $before - $removed
    if (-not $Remove) { $expect++ }
    if ($chk.Objects.Count -ne $expect) {
        throw ("写入后条目数不符：期望 " + $expect + "，实际 " + $chk.Objects.Count)
    }
    foreach ($o in $chk.Objects) {
        if ((Get-PluginName -obj $o) -eq '') { throw '写入后出现无 name 的条目' }
    }
    return $chk.Objects.Count
}

function Test-PluginsJs {
    param([string]$path)
    try {
        $chk = Get-PluginObjects -path $path
        if ($chk.Objects.Count -lt 1) { return $false }
        foreach ($o in $chk.Objects) {
            if ((Get-PluginName -obj $o) -eq '') { return $false }
        }
        return $true
    } catch { return $false }
}

# ---------------------------------------------------------------------------
# 定位游戏（-GamePath 优先，否则自动搜索）
# ---------------------------------------------------------------------------
function Resolve-GameTarget {
    param([string]$GamePath)
    if (-not [string]::IsNullOrWhiteSpace($GamePath)) {
        if (Test-GameDir $GamePath) {
            return (Resolve-Path -LiteralPath $GamePath).Path
        }
        Warn "指定目录不是有效的「买个可乐饼吧！」安装路径: $GamePath"
    }
    Say '  正在自动搜索游戏安装位置 ...' 'DarkGray'
    $hits = @(Find-GameDirs)
    if ($hits.Count -eq 1) { return $hits[0] }
    if ($hits.Count -gt 1) {
        Say ''
        Say '  找到多个安装位置，请选择：' 'Yellow'
        for ($i = 0; $i -lt $hits.Count; $i++) { Say ("    [" + ($i+1) + "] " + $hits[$i]) }
        $sel = Read-Host '  输入编号'
        $n = 0
        if ([int]::TryParse($sel, [ref]$n) -and $n -ge 1 -and $n -le $hits.Count) { return $hits[$n - 1] }
        Fail '输入无效。'
        return ''
    }
    return ''
}

# ---------------------------------------------------------------------------
# 找到该游戏目录下最新的备份
# ---------------------------------------------------------------------------
function Get-LatestBackup {
    param([string]$GameDir)
    $dirs = @(Get-ChildItem -LiteralPath $GameDir -Directory -Filter '_cheat_backup_*' -ErrorAction SilentlyContinue |
              Sort-Object Name -Descending)
    if ($dirs.Count -eq 0) { return '' }
    return $dirs[0].FullName
}
