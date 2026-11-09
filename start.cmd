@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "OPEN_FLAG=--open"
if /i "%~1"=="--quiet" set "OPEN_FLAG="

set "PORT=4321"
set "URL=http://127.0.0.1:%PORT%"

rem ---------- 已经在运行就直接打开 ----------
curl -s --max-time 2 "%URL%/api/health" 2>nul | findstr "ok" >nul
if not errorlevel 1 (
  echo 题迹已经在运行：%URL%
  if defined OPEN_FLAG start "" "%URL%"
  exit /b 0
)

rem ---------- 找 Node ----------
set "NODE_EXE="
where node >nul 2>nul && set "NODE_EXE=node"

if not defined NODE_EXE (
  for %%P in (
    "%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
    "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    "%ProgramFiles%\nodejs\node.exe"
    "%LOCALAPPDATA%\Programs\nodejs\node.exe"
  ) do (
    if not defined NODE_EXE if exist "%%~P" set "NODE_EXE=%%~P"
  )
)

if not defined NODE_EXE (
  echo.
  echo 没有找到 Node.js。
  echo 请安装 Node.js 18 或更高版本：https://nodejs.org/
  echo 或者把 Node 的安装路径加进环境变量 PATH。
  echo.
  pause
  exit /b 1
)

echo.
echo  正在启动「题迹」...
echo.
"%NODE_EXE%" server.js %OPEN_FLAG%

echo.
echo  服务已停止。按任意键关闭窗口。
pause >nul
