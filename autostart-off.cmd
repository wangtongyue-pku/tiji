@echo off
chcp 65001 >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p = Join-Path ([Environment]::GetFolderPath('Startup')) 'Tiji.lnk';" ^
  "if (Test-Path $p) { Remove-Item $p -Force; Write-Host '已取消开机自启。' } else { Write-Host '没有找到自启项，无需取消。' }"

echo.
pause
