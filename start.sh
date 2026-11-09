#!/usr/bin/env sh
# 题迹 — macOS / Linux 启动脚本
set -e
cd "$(dirname "$0")"
exec node server.js --open
