# Windows 端到端验收：构建 → 起服务 → 跑三类程序 → 查 outcome / 步数 / trace 体积
# 用法： powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify-win.ps1
# 依赖：JDK 21+（含 javac/java）与 LLVM（clang++/lldb）；路径不在下面候选列表时用 -Java/-Javac 指定。
param(
    [string]$Java = '',
    [string]$Javac = '',
    [string]$Repo = ''
)

$ErrorActionPreference = 'Stop'
if (-not $Repo) { $Repo = Split-Path -Parent $PSScriptRoot }

# --- 工具链定位 ---------------------------------------------------------
$llvmDirs = @('C:\Program Files\LLVM\bin', 'C:\Program Files (x86)\LLVM\bin',
              (Join-Path $env:LOCALAPPDATA 'Programs\LLVM\bin'))
foreach ($dir in $llvmDirs) {
    if (Test-Path (Join-Path $dir 'lldb.exe')) { $env:PATH = $dir + ';' + $env:PATH; break }
}

if (-not $Java -or -not $Javac) {
    $candidates = @()
    if ($env:JAVA_HOME) { $candidates += (Join-Path $env:JAVA_HOME 'bin') }
    $candidates += 'F:\jdk21\jdk-21.0.13.1+2\bin'
    $candidates += 'C:\Program Files\Eclipse Adoptium\jdk-21\bin'
    $candidates += 'C:\Program Files\Java\jdk-21\bin'
    $candidates += 'F:\IntelliJ IDEA 2026.2.4\jbr\bin'
    $selected = $null
    foreach ($dir in $candidates) {
        $candidate = Join-Path $dir 'javac.exe'
        if (-not (Test-Path $candidate)) { continue }
        $version = & $candidate -version 2>&1 | Out-String
        if ($version -match 'javac (2[1-9]|[3-9]\d)') { $selected = $dir; break }
    }
    if (-not $selected) { Write-Host 'BUILD FAIL: 找不到 JDK 21+（设置 JAVA_HOME 或用 -Javac）' -ForegroundColor Red; exit 1 }
    $Java = Join-Path $selected 'java.exe'
    $Javac = Join-Path $selected 'javac.exe'
    Write-Host "jdk=$selected"
}

Set-Location $Repo
$fail = 0
function Step($text) { Write-Host "`n=== $text" -ForegroundColor Cyan }

# --- 构建 ---------------------------------------------------------------
Step 'BUILD'
Remove-Item -Recurse -Force out\classes -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force out\classes | Out-Null
$sources = Get-ChildItem -Recurse src\main\java -Filter *.java | ForEach-Object { $_.FullName }
& $Javac -encoding UTF-8 -d out\classes @sources
if ($LASTEXITCODE -ne 0) { Write-Host 'BUILD FAIL' -ForegroundColor Red; exit 1 }
Copy-Item -Recurse -Force src\main\resources\* out\classes\
Copy-Item -Force tracer\tracer.py out\classes\tracer.py
Write-Host 'BUILD OK' -ForegroundColor Green

# --- 起服务 -------------------------------------------------------------
Step 'SERVER'
$psi = New-Object Diagnostics.ProcessStartInfo
$psi.FileName = $Java
$psi.Arguments = '-cp out\classes dev.cppviz.Main'
$psi.WorkingDirectory = $Repo
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.EnvironmentVariables['VIZ_NO_BROWSER'] = '1'
$psi.EnvironmentVariables['PATH'] = $env:PATH
$server = [Diagnostics.Process]::Start($psi)
$first = $server.StandardOutput.ReadLine()
if ($first -notmatch 'VIZ_PORT=(\d+)') {
    Write-Host "SERVER FAIL: $first" -ForegroundColor Red
    $server.Kill(); exit 1
}
$port = [int]$Matches[1]
Write-Host "port=$port" -ForegroundColor Green

function Invoke-Case {
    param([string]$Name, [string]$Code)
    $body = 'code=' + [uri]::EscapeDataString($Code)
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $resp = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/run" -Method Post `
        -Body $body -ContentType 'application/x-www-form-urlencoded' -TimeoutSec 180
    $sw.Stop()
    $trace = Join-Path $env:USERPROFILE ".cppviz\runs\$($resp.traceId)\trace.jsonl"
    $bytes = if (Test-Path $trace) { (Get-Item $trace).Length } else { -1 }
    $steps = [int]$resp.steps
    $perStep = if ($steps -gt 0 -and $bytes -gt 0) { [int]($bytes / $steps) } else { 0 }
    Write-Host ("CASE {0}: outcome={1} steps={2} ms={3} traceBytes={4} bytesPerStep={5} out=[{6}]" -f `
        $Name, $resp.outcome, $resp.steps, $sw.ElapsedMilliseconds, $bytes, $perStep, ($resp.programOutput -replace "`n", '\n'))
    return @{ Resp = $resp; Trace = $trace; Bytes = $bytes; Steps = $steps; PerStep = $perStep }
}

$basic = @'
#include <cstdio>
#include <vector>
int main(){
  std::vector<int> v;
  for (int i = 0; i < 3; i++) v.push_back(i * 10);
  printf("%d\n", v[2]);
  return 0;
}
'@

$glob = @'
#include <cstdio>
int g = 7;
int main(){
  int x = g + 1;
  printf("%d\n", x);
  return 0;
}
'@

$crash = @'
#include <cstdio>
int main(){
  int *p = nullptr;
  printf("before\n");
  *p = 42;
  return 0;
}
'@

Step 'CASE basic'
$r1 = Invoke-Case 'basic' $basic
if ($r1.Resp.outcome -ne 'ok' -or $r1.Steps -lt 3 -or $r1.Resp.programOutput -notmatch '20' -or $r1.Bytes -lt 100) {
    Write-Host '  FAIL basic（期望 ok / >=3 步 / 输出 20）' -ForegroundColor Red; $fail++
} else { Write-Host '  PASS basic' -ForegroundColor Green }
if ($r1.PerStep -gt 4000) { Write-Host "  FAIL 每步 trace 过大: $($r1.PerStep) B/步" -ForegroundColor Red; $fail++ }
else { Write-Host "  PASS trace 体积 ($($r1.PerStep) B/步)" -ForegroundColor Green }

Step 'CASE global'
$r2 = Invoke-Case 'global' $glob
$hasGlobal = $false
if (Test-Path $r2.Trace) { $hasGlobal = [bool](Select-String -Path $r2.Trace -Pattern '"name": "g"' -Quiet) }
if (-not $hasGlobal) { Write-Host '  FAIL 用户全局 g 没出现在 trace 里' -ForegroundColor Red; $fail++ }
else { Write-Host '  PASS 用户全局 g 保留' -ForegroundColor Green }
$noise = $false
if (Test-Path $r2.Trace) { $noise = [bool](Select-String -Path $r2.Trace -Pattern 'xdatasym|GS_ContextRecord|module_names|errno_no_memory' -Quiet) }
if ($noise) { Write-Host '  FAIL 系统库全局仍然漏进 trace' -ForegroundColor Red; $fail++ }
else { Write-Host '  PASS 没有系统库全局' -ForegroundColor Green }

Step 'CASE crash'
$r3 = Invoke-Case 'crash' $crash
if ($r3.Resp.outcome -ne 'crash' -or $r3.Steps -lt 2) {
    Write-Host "  FAIL 崩溃没被识别（outcome=$($r3.Resp.outcome) steps=$($r3.Steps)）" -ForegroundColor Red; $fail++
} else { Write-Host '  PASS 崩溃识别' -ForegroundColor Green }

Step 'CASE env'
$envInfo = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/env" -TimeoutSec 60
Write-Host ("compiler={0} lldb={1} python={2}" -f $envInfo.compilerPath, $envInfo.lldbPath, $envInfo.python.found)
if (-not $envInfo.compilerPath -or -not $envInfo.lldbPath -or -not $envInfo.python.found) {
    Write-Host '  FAIL /api/env 没报出可用的工具链' -ForegroundColor Red; $fail++
} else { Write-Host '  PASS /api/env' -ForegroundColor Green }

$server.Kill()
$server.WaitForExit()

Step 'RESULT'
if ($fail -eq 0) { Write-Host 'ALL PASS' -ForegroundColor Green; exit 0 }
Write-Host "$fail FAILURE(S)" -ForegroundColor Red
exit 1
