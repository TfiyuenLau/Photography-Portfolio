@echo off
chcp 65001 >nul
title 个人摄影作品集 · 本地管理工作台 (Portfolio Studio)
echo ========================================================
echo   正在启动个人摄影作品集开发服务与管理工作台...
echo   - 前台展示地址: http://localhost:3000
echo   - 管理后台地址: http://localhost:3000/admin
echo   - 默认管理密码: admin123 (可在 .env.local 中修改 ADMIN_PASSWORD)
echo ========================================================
echo.
start "" "http://localhost:3000/admin"
pnpm dev
pause
