@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ============================================================
REM   Caixa Boti -- Setup do PM2 (etapa 9 do instalador
REM   principal, isolada para retomada limpa).
REM
REM   PM2 = process manager pra Node.js. Instala globalmente,
REM   configura autostart no boot via pm2-windows-startup, e
REM   inicia o app "caixa-boti" rodando vite preview.
REM
REM   Alternativa mais robusta: instalar-servico-windows.bat
REM   (na pasta acima), que usa NSSM em vez de PM2 -- recomendado
REM   pra producao real porque roda em Session 0 (sem janela).
REM ============================================================

echo ============================================================
echo   Caixa Boti -- Setup do PM2 (autostart do app)
echo ============================================================
echo.

REM ---------- Pre-checks ----------
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO] Este script precisa ser executado como administrador.
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERRO] npm nao encontrado no PATH.
    echo Node.js esta instalado? Abra um CMD novo e tente: npm --version
    pause
    exit /b 1
)

if not exist "C:\caixa-boti\package.json" (
    echo [ERRO] C:\caixa-boti\package.json nao existe.
    echo Repo nao foi clonado. Rode antes o instalar-caixa-boti.bat (etapa 5).
    pause
    exit /b 1
)

if not exist "C:\caixa-boti\dist\index.html" (
    echo [ERRO] C:\caixa-boti\dist\index.html nao existe.
    echo Build nao foi feito. Rode em C:\caixa-boti: npm run build
    pause
    exit /b 1
)

REM ---------- Etapa 1/3: Instalar PM2 ----------
echo.
echo === Etapa 1/3: Instalar PM2 globalmente ===

where pm2 >nul 2>&1
if !errorLevel! equ 0 (
    echo [INFO] PM2 ja instalado:
    call pm2 --version
) else (
    echo [INFO] Instalando pm2 e pm2-windows-startup...
    call npm install -g pm2 pm2-windows-startup
    if !errorLevel! neq 0 (
        echo [ERRO] Falha ao instalar PM2. Verifique a conexao npm.
        pause
        exit /b 1
    )
    echo [OK] PM2 instalado.
)
echo.

REM ---------- Etapa 2/3: Configurar startup ----------
echo === Etapa 2/3: Registrar PM2 no startup do Windows ===

call pm2-startup install
if !errorLevel! neq 0 (
    echo [AVISO] pm2-startup retornou erro. Pode ja estar configurado.
)
echo.

REM ---------- Etapa 3/3: Iniciar app ----------
echo === Etapa 3/3: Iniciar Caixa Boti via PM2 ===

cd /d C:\caixa-boti

call pm2 describe caixa-boti >nul 2>&1
if !errorLevel! equ 0 (
    echo [INFO] App "caixa-boti" ja existe no PM2. Reiniciando...
    call pm2 restart caixa-boti
) else (
    echo [INFO] Iniciando app pela primeira vez...
    call pm2 start npm --name "caixa-boti" -- run preview
    if !errorLevel! neq 0 (
        echo [ERRO] Falha ao iniciar app via PM2.
        pause
        exit /b 1
    )
)

call pm2 save

echo.
call pm2 status

echo.
echo ============================================================
echo   [OK] PM2 configurado e app rodando.
echo
echo   App local: http://127.0.0.1:4173
echo   Publico:   https://caixa-boti.plexalabs.com  (precisa do tunnel)
echo
echo   Comandos uteis:
echo     pm2 status              ver estado
echo     pm2 logs caixa-boti     ver logs em streaming
echo     pm2 restart caixa-boti  reiniciar apos git pull + npm run build
echo ============================================================
echo.
pause
exit /b 0
