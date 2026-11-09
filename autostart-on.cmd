@echo off
chcp 65001 >nul
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Startup')) 'Tiji.lnk'));" ^
  "$s.TargetPath = '%~dp0start.cmd';" ^
  "$s.Arguments = '--quiet';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.WindowStyle = 7;" ^
  "$s.Description = 'Tiji - personal learning site';" ^
  "$s.Save()"

if errorlevel 1 (
  echo 设置失败，请手动把 start.cmd 的快捷方式放进启动文件夹。
  pause
  exit /b 1
)

echo.
echo  已设置开机自启：登录后会在后台（最小化）启动服务，不自动弹浏览器。
echo  之后直接访问 http://127.0.0.1:4321 即可。
echo.
echo  取消自启：双击 autostart-off.cmd
echo.
pause
