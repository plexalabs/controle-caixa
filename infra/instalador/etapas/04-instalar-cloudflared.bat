@echo off
echo [4/9] Verificando cloudflared...

where cloudflared >nul 2>&1
if %errorLevel% equ 0 (
  for /f "tokens=*" %%i in ('cloudflared --version') do echo [info] cloudflared ja instalado: %%i
  exit /b 0
)

echo [info] Baixando cloudflared (Windows amd64 MSI)...
powershell -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.msi' -OutFile '%TEMP%\cloudflared.msi'"

if not exist "%TEMP%\cloudflared.msi" (
  echo [ERRO] Falha ao baixar cloudflared. Verifique a conexao ou
  echo        baixe manualmente em
  echo        https://github.com/cloudflare/cloudflared/releases/latest.
  exit /b 1
)

echo [info] Instalando cloudflared (silencioso, ~10s)...
msiexec /i "%TEMP%\cloudflared.msi" /quiet /norestart
if %errorLevel% neq 0 (
  echo [ERRO] msiexec retornou erro %errorLevel%.
  exit /b 1
)

REM cloudflared instala em "C:\Program Files (x86)\cloudflared\" e ja
REM acrescenta ao PATH global, mas a sessao atual nao ve. Anexa para
REM as etapas 5/8 funcionarem sem reabrir o terminal.
set "PATH=%PATH%;%ProgramFiles(x86)%\cloudflared"

where cloudflared >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] cloudflared instalado mas nao encontrado no PATH.
  exit /b 1
)

for /f "tokens=*" %%i in ('cloudflared --version') do echo [info] cloudflared instalado: %%i
del "%TEMP%\cloudflared.msi" >nul 2>&1
exit /b 0
