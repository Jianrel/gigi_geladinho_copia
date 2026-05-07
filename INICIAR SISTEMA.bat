@echo off
title Gigi Geladinho Gourmet - Sistema de Estoque
color 0A
echo.
echo  ========================================
echo    GIGI GELADINHO GOURMET - ESTOQUE
echo  ========================================
echo.
echo  Iniciando o sistema...
echo.

cd /d "%~dp0"
set PATH=%PATH%;%APPDATA%\npm;C:\Program Files\nodejs

node server.js

echo.
echo  Sistema encerrado. Pressione qualquer tecla para sair.
pause > nul
