@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM   Caixa Boti -- Setup do Cloudflare Tunnel (etapa 8 do
REM   instalador principal, isolada para retomada limpa).
REM
REM   Pode rodar isolado se o instalar-caixa-boti.bat parou
REM   antes de chegar nessa etapa. Idempotente: se tunnel ja
REM   existe, reusa.
REM ============================================================

echo ============================================================
echo   Caixa Boti -- Setup do Cloudflare Tunnel
echo ============================================================
echo.

REM ---------- Pre-checks ----------
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO] Este script precisa ser executado como administrador.
    echo Clique direito e selecione "Executar como administrador".
    pause
    exit /b 1
)

where cloudflared >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO] cloudflared nao encontrado no PATH.
    echo Reinstale via instalar-caixa-boti.bat ou abra um CMD novo.
    pause
    exit /b 1
)

REM ---------- Etapa 1/5: Login ----------
echo.
echo === Etapa 1/5: Login no Cloudflare ===
echo.

if exist "%USERPROFILE%\.cloudflared\cert.pem" (
    echo [INFO] cert.pem ja existe. Pulando login.
) else (
    echo Vou abrir o browser para voce autorizar a zona "plexalabs.com".
    echo Depois de autorizar, volte aqui.
    echo.
    echo Pressione qualquer tecla para abrir o browser...
    pause >nul

    cloudflared tunnel login

    if not exist "%USERPROFILE%\.cloudflared\cert.pem" (
        echo.
        echo [ERRO] Login falhou. cert.pem nao foi criado.
        echo Tente novamente ou rode manualmente: cloudflared tunnel login
        echo Se o browser nao abriu, copie a URL do output acima e cole no browser.
        pause
        exit /b 1
    )

    echo [OK] Login concluido. cert.pem em %USERPROFILE%\.cloudflared\
)
echo.

REM ---------- Etapa 2/5: Criar tunnel (idempotente) ----------
echo === Etapa 2/5: Criar tunnel "caixa-boti" ===

cloudflared tunnel list 2>nul | findstr /C:"caixa-boti" >nul
if !errorLevel! equ 0 (
    echo [INFO] Tunnel "caixa-boti" ja existe. Pulando criacao.
) else (
    cloudflared tunnel create caixa-boti
    if !errorLevel! neq 0 (
        echo [ERRO] Falha ao criar tunnel.
        pause
        exit /b 1
    )
    echo [OK] Tunnel criado.
)
echo.

REM ---------- Etapa 3/5: Capturar UUID ----------
echo === Etapa 3/5: Capturar UUID do tunnel ===

REM cloudflared tunnel list tem cabecalho na primeira linha:
REM   ID    NAME    CREATED   CONNECTIONS
REM Pegamos a linha que contem "caixa-boti" e tokens=1 = UUID.
set "TUNNEL_ID="
for /f "tokens=1" %%i in ('cloudflared tunnel list 2^>nul ^| findstr /C:"caixa-boti"') do (
    set "TUNNEL_ID=%%i"
)

if "!TUNNEL_ID!"=="" (
    echo [AVISO] Nao consegui capturar UUID automaticamente.
    echo.
    echo Rode em outra janela:
    echo     cloudflared tunnel list
    echo.
    echo E cole aqui o UUID da linha do "caixa-boti" (parece com 12345678-abcd-efgh-...).
    echo.
    set /p TUNNEL_ID="UUID do tunnel caixa-boti: "

    if "!TUNNEL_ID!"=="" (
        echo [ERRO] UUID obrigatorio.
        pause
        exit /b 1
    )
)

echo [OK] UUID: !TUNNEL_ID!
echo.

REM ---------- Etapa 4/5: Editar config.yml ----------
echo === Etapa 4/5: Reescrever config.yml com valores reais ===

set "CONFIG_PATH=C:\caixa-boti\infra\tunnel\config.yml"
set "CRED_PATH=%USERPROFILE%\.cloudflared\!TUNNEL_ID!.json"

if not exist "!CRED_PATH!" (
    echo [ERRO] Arquivo de credenciais nao existe:
    echo     !CRED_PATH!
    echo UUID pode estar errado, ou tunnel pode ter sido criado em outro usuario.
    pause
    exit /b 1
)

REM Reescreve config.yml inteiro (mais robusto que regex).
(
    echo tunnel: !TUNNEL_ID!
    echo credentials-file: !CRED_PATH!
    echo.
    echo ingress:
    echo   - hostname: caixa-boti.plexalabs.com
    echo     service: http://127.0.0.1:4173
    echo   - service: http_status:404
) > "!CONFIG_PATH!"

echo [OK] config.yml reescrito em !CONFIG_PATH!
echo.

REM ---------- Etapa 5/5: DNS + Service ----------
echo === Etapa 5/5: Configurar DNS e instalar como servico Windows ===

cloudflared tunnel route dns caixa-boti caixa-boti.plexalabs.com
if !errorLevel! neq 0 (
    echo [AVISO] route dns retornou erro. Pode ja estar configurado.
)
echo.

cloudflared service install --config "!CONFIG_PATH!"
if !errorLevel! neq 0 (
    echo [AVISO] service install retornou erro. Pode ja estar instalado.
)

sc start cloudflared >nul 2>&1
echo.
sc query cloudflared

echo.
sc query cloudflared | findstr /C:"RUNNING" >nul
if !errorLevel! equ 0 (
    echo ============================================================
    echo   [OK] Tunnel configurado e RUNNING.
    echo
    echo   Site disponivel em: https://caixa-boti.plexalabs.com
    echo   ^(precisa do app rodando -- proximo passo: 02-pm2-setup.bat^)
    echo ============================================================
) else (
    echo ============================================================
    echo   [AVISO] cloudflared nao esta RUNNING.
    echo   Tente: sc start cloudflared
    echo ============================================================
)
echo.
pause
exit /b 0
