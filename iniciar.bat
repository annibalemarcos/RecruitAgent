@echo off
cd /d "%~dp0"
chcp 65001 >nul
title RecruitAgent Pro - Agente de Recrutamento & Candidaturas
cls

echo =====================================================================
echo       RecruitAgent Pro - Agente de Recrutamento e Candidaturas
echo =====================================================================
echo.

:: 1. Verificar se o Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Node.js não foi encontrado no seu computador!
    echo Por favor, instale o Node.js 24 LTS em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: 2. Verificar se o arquivo .env existe, caso contrário copia de .env.example
if not exist ".env" (
    if exist ".env.example" (
        echo [INFO] Criando arquivo .env pré-configurado para localhost:3000...
        copy ".env.example" ".env" >nul
        echo [INFO] Arquivo .env criado com sucesso.
        echo [DICA] Abra o arquivo .env e configure as chaves das APIs no .env ou na tela Configuracoes
        echo.
    )
)

:: 3. Verificar se as dependências (node_modules) estão instaladas
if not exist "node_modules\" (
    echo [INFO] Dependências não encontradas. Instalando pacotes com npm install...
    echo Isso pode levar alguns instantes na primeira execução...
    call npm install --legacy-peer-deps
    if %errorlevel% neq 0 (
        echo [INFO] Tentando instalação com --force...
        call npm install --force
    )
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Falha ao instalar dependências. Verifique sua conexão à internet.
        pause
        exit /b 1
    )
    echo [SUCESSO] Dependências instaladas com sucesso!
    echo.
)

:: 4. Iniciar o servidor e abrir o navegador automaticamente
echo =====================================================================
echo   Iniciando o servidor local em http://localhost:3000 ...
echo   Pressione Ctrl + C nesta janela para encerrar o aplicativo.
echo =====================================================================
echo.

:: Aguarda 2 segundos e abre o navegador padrão no Windows
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Desativa atualizacoes automaticas do navegador durante o uso local
set "DISABLE_HMR=true"
call npm start

if %errorlevel% neq 0 (
    echo.
    echo [AVISO] O processo foi encerrado.
    pause
)
