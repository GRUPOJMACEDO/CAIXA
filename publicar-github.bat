@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   CAIXA - Grupo J.Macedo - Publicar no GitHub
echo ============================================
echo.

cd /d "%~dp0"
echo Pasta atual: %cd%
echo.

git config --global user.name >nul 2>&1
if not errorlevel 1 goto GIT_CONFIGURADO

set /p GITNOME="Seu nome completo (para o Git): "
set /p GITEMAIL="Seu e-mail do GitHub: "
git config --global user.name "%GITNOME%"
git config --global user.email "%GITEMAIL%"
echo.
echo Nome e e-mail configurados.
echo.
goto DEPOIS_CONFIG

:GIT_CONFIGURADO
echo Git ja configurado neste computador, pulando essa etapa.
echo.

:DEPOIS_CONFIG
if exist ".git" goto GIT_JA_INICIADO

echo Iniciando o repositorio Git...
git init
git branch -M main
goto DEPOIS_INIT

:GIT_JA_INICIADO
echo Repositorio Git ja iniciado, pulando essa etapa.

:DEPOIS_INIT
echo.

git remote get-url origin >nul 2>&1
if not errorlevel 1 goto REMOTE_JA_CONECTADO

echo Conectando ao GitHub (GRUPOJMACEDO/CAIXA)...
git remote add origin https://github.com/GRUPOJMACEDO/CAIXA.git
goto DEPOIS_REMOTE

:REMOTE_JA_CONECTADO
echo Ja conectado ao GitHub, pulando essa etapa.

:DEPOIS_REMOTE
echo.

echo Preparando os arquivos...
git add .
echo.

set /p MENSAGEM="Descreva rapidamente o que mudou (ex: ajustes de tela): "
if "%MENSAGEM%"=="" set MENSAGEM=Atualizacao do sistema CAIXA

git commit -m "%MENSAGEM%"
echo.

echo Enviando para o GitHub...
echo (pode abrir uma janela do navegador pedindo login no GitHub - faca login normalmente)
echo.
git push -u origin main

echo.
echo ============================================
echo   Concluido! Confira o resultado acima.
echo   Se aparecer algum erro em vermelho, tire
echo   um print e mande para o Claude.
echo ============================================
echo.
pause
