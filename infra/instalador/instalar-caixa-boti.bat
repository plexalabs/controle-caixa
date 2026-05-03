@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ════════════════════════════════════════════════════════
echo   Caixa Boti — Instalador local
echo   Plexa Lab's, 2026
echo ════════════════════════════════════════════════════════
echo.

REM Verifica se esta rodando como administrador (necessario para
REM msiexec, sc start, cloudflared service install).
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Este instalador precisa ser executado como administrador.
  echo Clique com botao direito no .bat e escolha "Executar como administrador".
  pause
  exit /b 1
)

REM Diretorio canonico onde o sistema fica instalado. Se mudar aqui,
REM mude tambem em todas as etapas\*.bat e na config.yml.
set "BASE_DIR=C:\caixa-boti"
echo [info] Diretorio de instalacao: %BASE_DIR%
echo.

set /p CONFIRMA="Prosseguir com instalacao? (S/N): "
if /i not "%CONFIRMA%"=="S" (
  echo Instalacao cancelada.
  exit /b 0
)
echo.

if not exist "%BASE_DIR%" mkdir "%BASE_DIR%"
cd /d "%BASE_DIR%"

REM As 9 etapas sao idempotentes — rodar 2x nao quebra nada e retoma
REM do ponto que falhou. Cada etapa ecoa "[N/9] ..." na entrada e
REM "[info] ..." nos passos relevantes; erros saem com "[ERRO] ...".
call "%~dp0etapas\01-verificar-prereqs.bat" || goto :erro
call "%~dp0etapas\02-instalar-nodejs.bat" || goto :erro
call "%~dp0etapas\03-instalar-git.bat" || goto :erro
call "%~dp0etapas\04-instalar-cloudflared.bat" || goto :erro
call "%~dp0etapas\05-clonar-repo.bat" || goto :erro
call "%~dp0etapas\06-configurar-env.bat" || goto :erro
call "%~dp0etapas\07-build-inicial.bat" || goto :erro
call "%~dp0etapas\08-setup-tunnel.bat" || goto :erro
call "%~dp0etapas\09-pm2-autostart.bat" || goto :erro

echo.
echo ════════════════════════════════════════════════════════
echo   Instalacao concluida com sucesso
echo ════════════════════════════════════════════════════════
echo.
echo Sistema disponivel em: https://caixa-boti.plexalabs.com
echo.
echo Para verificar status:
echo   sc query cloudflared
echo   pm2 status
echo.
pause
exit /b 0

:erro
echo.
echo [ERRO] Etapa falhou. Verifique a mensagem acima.
echo Para retomar do ponto que falhou, execute o instalador novamente.
pause
exit /b 1
