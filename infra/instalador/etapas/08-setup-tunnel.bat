@echo off
setlocal enabledelayedexpansion
echo [8/9] Configurando Cloudflare Tunnel...

set "CONFIG_PATH=C:\caixa-boti\infra\tunnel\config.yml"

if not exist "%CONFIG_PATH%" (
  echo [ERRO] config.yml nao encontrado em %CONFIG_PATH%.
  echo        A etapa 5 (clone) provavelmente falhou.
  exit /b 1
)

REM Idempotencia: se tunnel "caixa-boti" ja existe, pula a parte de
REM login + create e vai direto pra DNS + service install (que tambem
REM sao idempotentes).
cloudflared tunnel list 2>nul | findstr /C:"caixa-boti" >nul
if !errorLevel! equ 0 (
  echo [info] Tunnel "caixa-boti" ja existe. Pulando criacao.
  for /f "tokens=1" %%i in ('cloudflared tunnel list 2^>nul ^| findstr /C:"caixa-boti"') do set "TUNNEL_ID=%%i"
  goto :route_dns
)

echo.
echo Vai abrir o browser para autorizar o Cloudflare.
echo Selecione a zona "plexalabs.com" e clique Authorize.
echo Quando voltar, pressione qualquer tecla aqui.
pause >nul

cloudflared tunnel login
if !errorLevel! neq 0 (
  echo [ERRO] cloudflared tunnel login falhou.
  exit /b 1
)

echo.
echo [info] Criando tunnel "caixa-boti"...
REM Captura saida do create. Linha esperada:
REM   "Created tunnel caixa-boti with id 12345678-abcd-..."
REM Tokens: 1=Created 2=tunnel 3=caixa-boti 4=with 5=id 6=<UUID>
set "TUNNEL_ID="
for /f "tokens=6" %%i in ('cloudflared tunnel create caixa-boti 2^>^&1 ^| findstr /C:"Created tunnel"') do set "TUNNEL_ID=%%i"

if "!TUNNEL_ID!"=="" (
  echo [ERRO] Nao foi possivel capturar TUNNEL_ID da saida do create.
  echo        Execute manualmente: cloudflared tunnel create caixa-boti
  echo        Anote o UUID e edite %CONFIG_PATH% trocando TUNNEL_ID_AQUI.
  exit /b 1
)

echo [info] TUNNEL_ID: !TUNNEL_ID!

REM Substitui placeholders no config.yml via PowerShell. Duas passadas:
REM   1. TUNNEL_ID_AQUI -> UUID real do tunnel
REM   2. caminho placeholder do credentials-file -> caminho real
REM No regex de busca, "\\" matcha um "\" literal e "\." matcha ".".
REM No replacement, barras invertidas sao literais (sem doubling).
set "CRED_PATH=%USERPROFILE%\.cloudflared\!TUNNEL_ID!.json"

powershell -Command "(Get-Content '%CONFIG_PATH%') -replace 'TUNNEL_ID_AQUI', '!TUNNEL_ID!' -replace 'C:\\Users\\OPERADOR\\\.cloudflared\\TUNNEL_ID_AQUI\.json', '!CRED_PATH!' | Set-Content '%CONFIG_PATH%'"

echo [info] config.yml atualizado com TUNNEL_ID e credentials-file.

:route_dns
echo.
echo [info] Configurando DNS caixa-boti.plexalabs.com -^> tunnel...
cloudflared tunnel route dns caixa-boti caixa-boti.plexalabs.com
if !errorLevel! neq 0 (
  echo [aviso] cloudflared route dns retornou erro. Pode ser que o
  echo         registro ja exista (idempotencia). Continuando.
)

echo.
echo [info] Instalando cloudflared como servico do Windows...
cloudflared service install --config "%CONFIG_PATH%"
if !errorLevel! neq 0 (
  echo [aviso] cloudflared service install retornou erro. Pode ser que
  echo         o servico ja esteja instalado. Tentando reiniciar mesmo assim.
)

sc start cloudflared >nul 2>&1
sc query cloudflared | findstr /C:"RUNNING" >nul
if !errorLevel! neq 0 (
  echo [aviso] Servico cloudflared nao esta RUNNING. Verifique manualmente:
  echo         sc query cloudflared
) else (
  echo [info] Servico cloudflared rodando.
)

exit /b 0
