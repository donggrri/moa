# Ensures the Moa MCP HTTP server is running on this PC.
# Cursor is the client; this process is the server. Stops when the PC is off.

$ErrorActionPreference = "Stop"

$ServerDir = Split-Path -Parent $PSScriptRoot
$ServerFile = Join-Path $ServerDir "server.mjs"
$EnvFile = Join-Path $ServerDir ".env"
$LogDir = Join-Path $ServerDir "logs"
$LogFile = Join-Path $LogDir "http.log"

function Read-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) {
    return $map
  }
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

function Get-HealthUrl {
  $envMap = Read-DotEnv $EnvFile
  $hostName = $envMap["MOA_MCP_HTTP_HOST"]
  if (-not $hostName) { $hostName = "127.0.0.1" }
  $port = $envMap["MOA_MCP_HTTP_PORT"]
  if (-not $port) { $port = "8787" }
  return "http://${hostName}:${port}/health"
}

function Test-MoaMcpHealth {
  $url = Get-HealthUrl
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Path $ServerFile)) {
  Write-Error "server.mjs를 찾을 수 없습니다: $ServerFile"
}

if (-not (Test-Path $EnvFile)) {
  Write-Error "mcp-server/.env가 없습니다. .env.example을 복사해 URL, service_role, MOA_MCP_TOKENS를 넣으세요."
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js가 PATH에 없습니다. Node 18 이상을 설치하세요."
}

if (Test-MoaMcpHealth) {
  Write-Output "Moa MCP HTTP 서버가 이미 실행 중입니다. $(Get-HealthUrl)"
  exit 0
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$process = Start-Process -FilePath $node.Source -ArgumentList "server.mjs --http" -WorkingDirectory $ServerDir -WindowStyle Hidden -RedirectStandardError $LogFile -PassThru

$deadline = (Get-Date).AddSeconds(8)
while ((Get-Date) -lt $deadline) {
  if (Test-MoaMcpHealth) {
    Write-Output "Moa MCP HTTP 서버를 시작했습니다. pid=$($process.Id) $(Get-HealthUrl)"
    exit 0
  }
  Start-Sleep -Milliseconds 250
}

Write-Error "서버가 시작되지 않았습니다. $LogFile 를 확인하세요."
