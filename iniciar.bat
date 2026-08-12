@echo off
title NEW BYPASS / Bot
cd /d "%~dp0"

echo Iniciando o projeto...
echo.

if not exist "node_modules\" (
    echo Instalando dependencias...
    call npm install
    echo.
)

call npm start

if errorlevel 1 (
    echo.
    echo Erro ao iniciar. Verifique o .env e se o Node.js esta instalado.
    pause
)
