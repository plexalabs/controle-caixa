@echo off
setlocal enabledelayedexpansion
echo [9/9] Configurando PM2 para autostart do app...

cd /d C:\caixa-boti

REM Idempotencia: se PM2 ja esta gerenciando "caixa-boti", reinicia
REM em vez de recriar (preserva logs e historico de restarts).
where pm2 >nul 2>&1
if !errorLevel! equ 0 (
  pm2 describe caixa-boti >nul 2>&1
  if !errorLevel! equ 0 (
    echo [info] PM2 ja gerencia "caixa-boti". Reiniciando para pegar novo build.
    call pm2 restart caixa-boti
    call pm2 save
    exit /b 0
  )
)

REM Instala PM2 globalmente. pm2-windows-startup e o helper que cria
REM uma tarefa do Windows para subir o PM2 daemon no boot.
echo [info] Instalando PM2 globalmente...
call npm install -g pm2 pm2-windows-startup
if %errorLevel% neq 0 (
  echo [ERRO] npm install -g pm2 falhou.
  echo        Verifique permissoes do diretorio global do npm.
  exit /b 1
)

echo [info] Configurando PM2 para subir no boot...
call pm2-startup install
if %errorLevel% neq 0 (
  echo [aviso] pm2-startup install retornou erro. Pode ser idempotencia.
)

echo [info] Iniciando app gerenciado pelo PM2...
REM "npm run preview" porque o build ja foi feito na etapa 7. Usar
REM "start:local" reconstrutiria todo build a cada restart do PM2.
call pm2 start npm --name "caixa-boti" -- run preview
if %errorLevel% neq 0 (
  echo [ERRO] pm2 start falhou.
  exit /b 1
)

call pm2 save
echo [info] PM2 configurado. Sistema vai subir automaticamente no boot.
exit /b 0
