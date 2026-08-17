# Registers a logon scheduled task so the MCP HTTP server starts when this PC is on.
# The task runs as the current user and stops when the session/PC stops.

$ErrorActionPreference = "Stop"

$TaskName = "MoaMcpHttp"
$ServerDir = Split-Path -Parent $PSScriptRoot
$ServerFile = Join-Path $ServerDir "server.mjs"
$EnvFile = Join-Path $ServerDir ".env"

function Read-DotEnv([string]$Path) {
  $map = @{}
  Get-Content -Path $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }
    $name, $value = $line.Split("=", 2)
    $map[$name.Trim()] = $value.Trim()
  }
  return $map
}

function Get-FirstMcpToken([string]$Raw) {
  if (-not $Raw) { return $null }
  $first = ($Raw -split "[,\r\n]") | Where-Object { $_.Trim() } | Select-Object -First 1
  $separator = $first.LastIndexOf(":")
  if ($separator -le 0) { return $null }
  return $first.Substring(0, $separator).Trim()
}

if (-not (Test-Path $ServerFile)) {
  Write-Error "server.mjs를 찾을 수 없습니다: $ServerFile"
}

if (-not (Test-Path $EnvFile)) {
  Write-Error "mcp-server/.env가 없습니다. .env.example을 복사한 뒤 값을 넣으세요."
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js가 PATH에 없습니다. Node 18 이상을 설치하세요."
}

$envMap = Read-DotEnv $EnvFile
$token = Get-FirstMcpToken $envMap["MOA_MCP_TOKENS"]
if (-not $token -or $token.Length -lt 16) {
  Write-Error "MOA_MCP_TOKENS는 token:uuid 형식이고 토큰은 16자 이상이어야 합니다."
}

[System.Environment]::SetEnvironmentVariable("MOA_MCP_TOKEN", $token, "User")
$env:MOA_MCP_TOKEN = $token

$action = New-ScheduledTaskAction -Execute $node.Source -Argument "server.mjs --http" -WorkingDirectory $ServerDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -DontStopOnIdleEnd `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Output "로그온 시 Moa MCP HTTP 서버가 시작되도록 등록했습니다. 작업 이름: $TaskName"
Write-Output "Cursor는 http://127.0.0.1:8787/mcp 클라이언트로 붙습니다. Cursor를 한 번 재시작하세요."
Write-Output "사용자 환경변수 MOA_MCP_TOKEN을 .env 토큰과 맞춰 두었습니다."
