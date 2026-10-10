# Removes the logon scheduled task. Does not delete .env or stop a manually started server.

$ErrorActionPreference = "Stop"
$TaskName = "MoaMcpHttp"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Output "등록된 작업이 없습니다: $TaskName"
  exit 0
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Output "로그온 자동 시작을 해제했습니다: $TaskName"
