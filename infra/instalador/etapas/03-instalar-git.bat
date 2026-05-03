@echo off
echo [3/9] Verificando Git...

where git >nul 2>&1
if %errorLevel% equ 0 (
  for /f "tokens=*" %%i in ('git --version') do echo [info] Git ja instalado: %%i
  exit /b 0
)

echo [info] Git nao encontrado. Baixando Git for Windows...

REM URL "latest" do Git for Windows segue redirect para o release atual.
REM Resolvemos via PowerShell antes de baixar para evitar quebra silenciosa
REM se o servidor mudar o esquema de redirect.
powershell -Command "$ProgressPreference='SilentlyContinue'; $r = Invoke-WebRequest -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' -UseBasicParsing | ConvertFrom-Json; $asset = $r.assets | Where-Object { $_.name -like '*64-bit.exe' -and $_.name -notlike '*Portable*' -and $_.name -notlike '*MinGit*' } | Select-Object -First 1; if (-not $asset) { exit 1 }; Invoke-WebRequest -Uri $asset.browser_download_url -OutFile '%TEMP%\git-installer.exe'"

if not exist "%TEMP%\git-installer.exe" (
  echo [ERRO] Falha ao baixar Git. Verifique a conexao ou
  echo        baixe manualmente em https://git-scm.com/download/win.
  exit /b 1
)

echo [info] Instalando Git (silencioso, ~60s)...
REM /VERYSILENT do Inno Setup + /NORESTART evita reboot. /COMPONENTS
REM minimo: ext (icones), assoc (associacao .git), assoc_sh (bash).
"%TEMP%\git-installer.exe" /VERYSILENT /NORESTART /SUPPRESSMSGBOXES /NOCANCEL /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"
if %errorLevel% neq 0 (
  echo [ERRO] Instalador do Git retornou erro %errorLevel%.
  exit /b 1
)

set "PATH=%PATH%;%ProgramFiles%\Git\cmd"

where git >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Git instalado mas nao encontrado no PATH.
  exit /b 1
)

for /f "tokens=*" %%i in ('git --version') do echo [info] Git instalado: %%i
del "%TEMP%\git-installer.exe" >nul 2>&1
exit /b 0
