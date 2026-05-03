@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM   Caixa Boti -- Finalizar instalacao
REM
REM   Executa as etapas 8 (tunnel) e 9 (PM2) em sequencia, no
REM   caso do instalar-caixa-boti.bat ter parado antes de chegar
REM   nelas (ou se elas tiveram problema).
REM
REM   Pre-requisitos:
REM     - instalar-caixa-boti.bat ja rodou
REM     - Node, Git, cloudflared instalados
REM     - C:\caixa-boti com .env.local e dist/ presentes
REM ============================================================

echo ============================================================
echo   Caixa Boti -- Finalizar instalacao
echo ============================================================
echo.
echo Este script termina as etapas 8 (tunnel) e 9 (PM2) do
echo instalador principal.
echo.

set /p CONFIRMA="Prosseguir? (S/N): "
if /i not "!CONFIRMA!"=="S" (
    echo Cancelado.
    exit /b 0
)

echo.
echo --- Rodando 01-tunnel-setup.bat ---
echo.
call "%~dp001-tunnel-setup.bat"
if !errorLevel! neq 0 (
    echo.
    echo [ERRO] Setup do tunnel falhou. Veja mensagens acima.
    pause
    exit /b 1
)

echo.
echo --- Rodando 02-pm2-setup.bat ---
echo.
call "%~dp002-pm2-setup.bat"
if !errorLevel! neq 0 (
    echo.
    echo [ERRO] Setup do PM2 falhou. Veja mensagens acima.
    pause
    exit /b 1
)

REM ---------- Sumario ----------
set "APP_OK=0"
set "TUNNEL_OK=0"
sc query cloudflared 2>nul | findstr /C:"RUNNING" >nul && set "TUNNEL_OK=1"
call pm2 describe caixa-boti >nul 2>&1 && set "APP_OK=1"

echo.
echo.
if "!APP_OK!"=="1" if "!TUNNEL_OK!"=="1" (
    echo ############################################################
    echo #                                                          #
    echo #              [OK]   TUDO PRONTO - SISTEMA NO AR          #
    echo #                                                          #
    echo ############################################################
    echo.
    echo   App   ....  ONLINE    ^(PM2: caixa-boti^)
    echo   Tunel ....  RUNNING   ^(servico cloudflared^)
    echo.
    echo   Acesse agora: https://caixa-boti.plexalabs.com
    echo.
    echo   Voce pode FECHAR ESTA JANELA -- nao precisa ficar aberta.
    echo   Os dois sobem sozinhos a cada boot do Windows.
    echo.
    echo ############################################################
    echo.
    pause
    exit /b 0
)

echo ############################################################
echo #         [AVISO]  INSTALACAO INCOMPLETA                  #
echo ############################################################
echo.
if "!APP_OK!"=="1"     (echo   App   ....  ONLINE    ^(OK^))   else (echo   App   ....  PARADO    ^(rode 02-pm2-setup.bat^))
if "!TUNNEL_OK!"=="1"  (echo   Tunel ....  RUNNING   ^(OK^))   else (echo   Tunel ....  PARADO    ^(rode 01-tunnel-setup.bat^))
echo.
pause
exit /b 1
