@echo off
chcp 65001 >nul
title Hermes Pet v3.0 - AI 桌面伙伴
echo.
echo ╔══════════════════════════════════════════╗
echo ║   🧚 Hermes Pet v3.0                     ║
echo ║   AI 桌面伙伴 - Live2D + Ollama 大模型    ║
echo ║   暖阳橙 #FF8C42 + 柔和紫 #A78BFA         ║
echo ╚══════════════════════════════════════════╝
echo.
echo 启动中...
echo.
cd /d "%~dp0"
node server.js
pause
