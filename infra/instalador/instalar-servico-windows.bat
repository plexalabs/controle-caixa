@echo off
REM ============================================================
REM   Caixa Boti -- Conversor para servico nativo do Windows
REM
REM   O que faz:
REM   1. Para e remove o PM2 (se existir) -- janela visivel, flaky
REM   2. Baixa o NSSM (Non-Sucking Service Manager)
REM   3. Cria servico "caixa-boti-app" rodando vite preview oculto
REM      em Session 0 (invisivel ao operador)
REM   4. Configura auto-start no boot + restart automatico em crash
REM   5. Cria pasta de logs com rotacao automatica
REM
REM   Resultado: junto com o servico "cloudflared" ja existente
REM   (etapa 8 do instalador), o sistema fica 100% transparente:
REM   liga o PC, sobe sozinho, fica disponivel em
REM   https://caixa-boti.plexalabs.com sem janela aberta.
REM
REM   Pode rodar quantas vezes quiser -- e idempotente.
REM ============================================================

setlocal enabledelayedexpansion

echo ============================================================
echo   Caixa Boti -- Conversor para servico nativo do Windows
echo ============================================================
echo.

REM ---------- 1. Pre-requisitos ----------
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Precisa rodar como administrador.
  echo Clique direito no .bat e escolha "Executar como administrador".
  pause
  exit /b 1
)

set "BASE_DIR=C:\caixa-boti"
set "BIN_DIR=%BASE_DIR%\bin"
set "LOG_DIR=%BASE_DIR%\logs"
set "NSSM_EXE=%BIN_DIR%\nssm.exe"
set "SERVICE_NAME=caixa-boti-app"

if not exist "%BASE_DIR%\package.json" (
  echo [ERRO] %BASE_DIR%\package.json nao encontrado.
  echo Rode antes o instalar-caixa-boti.bat.
  pause
  exit /b 1
)

if not exist "%BASE_DIR%\dist\index.html" (
  echo [ERRO] %BASE_DIR%\dist\index.html nao encontrado.
  echo Build nao foi feito. Rode "npm run build" em %BASE_DIR%.
  pause
  exit /b 1
)

REM Localiza node.exe -- precisamos do path absoluto pra registrar
REM no NSSM. PATH novo do MSI nem sempre tem propagado pro Session 0.
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" (
  echo [ERRO] node.exe nao encontrado em %NODE_EXE%.
  echo Rode antes o instalar-caixa-boti.bat (etapa 2).
  pause
  exit /b 1
)

set "VITE_JS=%BASE_DIR%\node_modules\vite\bin\vite.js"
if not exist "%VITE_JS%" (
  echo [ERRO] vite nao encontrado em node_modules.
  echo Rode "npm install" em %BASE_DIR%.
  pause
  exit /b 1
)

if not exist "%BIN_DIR%" mkdir "%BIN_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [info] Pre-requisitos OK.
echo.

REM ---------- 2. Remove PM2 antigo (se existir) ----------
echo [info] Verificando se ha PM2 gerenciando caixa-boti...
where pm2 >nul 2>&1
if !errorLevel! equ 0 (
  pm2 describe caixa-boti >nul 2>&1
  if !errorLevel! equ 0 (
    echo [info] PM2 esta gerenciando "caixa-boti". Removendo...
    call pm2 stop caixa-boti >nul 2>&1
    call pm2 delete caixa-boti >nul 2>&1
    call pm2 save --force >nul 2>&1
    echo [info] PM2 limpo.
  ) else (
    echo [info] PM2 instalado mas sem app "caixa-boti". Nada a remover.
  )
) else (
  echo [info] PM2 nao instalado. Nada a remover.
)
echo.

REM ---------- 3. Baixa NSSM (se nao existir) ----------
if exist "%NSSM_EXE%" (
  echo [info] NSSM ja presente em %NSSM_EXE%.
) else (
  echo [info] Baixando NSSM 2.24 (estavel)...
  powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip'"
  if not exist "%TEMP%\nssm.zip" (
    echo [ERRO] Falha ao baixar NSSM. Verifique a conexao.
    pause
    exit /b 1
  )
  echo [info] Extraindo nssm.exe (win64)...
  powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; Expand-Archive -Path '%TEMP%\nssm.zip' -DestinationPath '%TEMP%\nssm-extract' -Force; Copy-Item '%TEMP%\nssm-extract\nssm-2.24\win64\nssm.exe' '%NSSM_EXE%' -Force; Remove-Item '%TEMP%\nssm.zip','%TEMP%\nssm-extract' -Recurse -Force"
  if not exist "%NSSM_EXE%" (
    echo [ERRO] Falha ao extrair nssm.exe.
    pause
    exit /b 1
  )
  echo [info] NSSM instalado em %NSSM_EXE%.
)
echo.

REM ---------- 4. Remove servico antigo (se existir) ----------
sc query %SERVICE_NAME% >nul 2>&1
if !errorLevel! equ 0 (
  echo [info] Servico "%SERVICE_NAME%" ja existe. Removendo para reconfigurar...
  "%NSSM_EXE%" stop %SERVICE_NAME% >nul 2>&1
  "%NSSM_EXE%" remove %SERVICE_NAME% confirm >nul 2>&1
  REM da um respiro pro SCM processar
  ping -n 2 127.0.0.1 >nul
)

REM ---------- 5. Cria o servico ----------
echo [info] Criando servico Windows "%SERVICE_NAME%"...
"%NSSM_EXE%" install %SERVICE_NAME% "%NODE_EXE%" "%VITE_JS%" preview --host 127.0.0.1 --port 4173
if !errorLevel! neq 0 (
  echo [ERRO] nssm install falhou.
  pause
  exit /b 1
)

REM Working directory -- vite precisa achar package.json e dist/.
"%NSSM_EXE%" set %SERVICE_NAME% AppDirectory "%BASE_DIR%"

REM Display name e descricao no services.msc
"%NSSM_EXE%" set %SERVICE_NAME% DisplayName "Caixa Boti - App Web"
"%NSSM_EXE%" set %SERVICE_NAME% Description "Vite preview servindo o build de producao do Caixa Boti em 127.0.0.1:4173. Roteado para internet via servico cloudflared."

REM Auto-start no boot do Windows.
"%NSSM_EXE%" set %SERVICE_NAME% Start SERVICE_AUTO_START

REM Logs em arquivo, com rotacao automatica a cada 1MB.
"%NSSM_EXE%" set %SERVICE_NAME% AppStdout "%LOG_DIR%\app.out.log"
"%NSSM_EXE%" set %SERVICE_NAME% AppStderr "%LOG_DIR%\app.err.log"
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateOnline 1
"%NSSM_EXE%" set %SERVICE_NAME% AppRotateBytes 1048576

REM Restart automatico em qualquer saida (esperada ou crash), com 5s
REM de delay pra nao entrar em loop quente se algo estiver realmente
REM quebrado (vite vai logar erro nos logs e parar de tentar depois).
"%NSSM_EXE%" set %SERVICE_NAME% AppExit Default Restart
"%NSSM_EXE%" set %SERVICE_NAME% AppRestartDelay 5000
"%NSSM_EXE%" set %SERVICE_NAME% AppThrottle 10000

REM Garante que matar o servico mata todos os processos filhos
REM (vite, esbuild, etc.) -- senao pode ficar processo orfao.
"%NSSM_EXE%" set %SERVICE_NAME% AppKillProcessTree 1
"%NSSM_EXE%" set %SERVICE_NAME% AppStopMethodSkip 0
"%NSSM_EXE%" set %SERVICE_NAME% AppStopMethodConsole 10000

REM Roda como LocalSystem (default) -- nao precisa de credencial de
REM usuario, sobe antes de qualquer login. Session 0, sem janela.
"%NSSM_EXE%" set %SERVICE_NAME% Type SERVICE_WIN32_OWN_PROCESS

echo [info] Servico configurado.
echo.

REM ---------- 6. Inicia o servico ----------
echo [info] Iniciando servico...
"%NSSM_EXE%" start %SERVICE_NAME%

REM Aguarda alguns segundos pro vite subir.
ping -n 4 127.0.0.1 >nul

sc query %SERVICE_NAME% | findstr /C:"RUNNING" >nul
if !errorLevel! neq 0 (
  echo [aviso] Servico nao esta RUNNING. Cheque os logs:
  echo         type "%LOG_DIR%\app.err.log"
) else (
  echo [info] Servico "%SERVICE_NAME%" esta RUNNING.
)
echo.

REM ---------- 7. Verifica cloudflared ----------
sc query cloudflared >nul 2>&1
if !errorLevel! neq 0 (
  echo [aviso] Servico "cloudflared" nao esta instalado.
  echo         Sem ele, https://caixa-boti.plexalabs.com nao funciona.
  echo         Rode novamente o instalar-caixa-boti.bat (etapa 8).
) else (
  sc query cloudflared | findstr /C:"RUNNING" >nul
  if !errorLevel! equ 0 (
    echo [info] Servico "cloudflared" tambem esta RUNNING.
  ) else (
    echo [aviso] cloudflared instalado mas parado. Iniciando...
    sc start cloudflared >nul 2>&1
  )
)
echo.

REM ---------- 8. Sumario ----------
echo ============================================================
echo   Conversao concluida
echo ============================================================
echo.
echo Servicos rodando em background (invisivel ao usuario):
echo   - %SERVICE_NAME%   (vite preview em 127.0.0.1:4173)
echo   - cloudflared      (tunel para caixa-boti.plexalabs.com)
echo.
echo Comandos uteis:
echo.
echo   Status:
echo     sc query %SERVICE_NAME%
echo     sc query cloudflared
echo.
echo   Logs do app:
echo     type "%LOG_DIR%\app.out.log"
echo     type "%LOG_DIR%\app.err.log"
echo.
echo   Restart manual (depois de "git pull && npm run build"):
echo     sc stop %SERVICE_NAME% ^&^& sc start %SERVICE_NAME%
echo.
echo   Desinstalar este servico (volta ao zero):
echo     "%NSSM_EXE%" stop %SERVICE_NAME%
echo     "%NSSM_EXE%" remove %SERVICE_NAME% confirm
echo.
echo Sistema vai subir automaticamente em todo boot do Windows.
echo Acesso publico: https://caixa-boti.plexalabs.com
echo.
pause
exit /b 0
