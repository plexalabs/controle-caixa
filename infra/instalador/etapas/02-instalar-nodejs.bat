@echo off
REM Sem setlocal aqui: precisamos que o "set PATH=..." mais abaixo
REM propague para o escopo do orquestrador, senao as etapas 3+ nao
REM acham npm/node neste cmd.exe (a entrada de PATH so aparece para
REM processos novos depois do MSI).
echo [2/9] Verificando Node.js...

REM Idempotencia: se ja tem Node, pula. Versao 20+ e suficiente
REM para Vite 5 e supabase-js -- major check apenas.
where node >nul 2>&1
if %errorLevel% equ 0 (
  for /f "tokens=*" %%i in ('node --version') do echo [info] Node.js ja instalado: %%i
  exit /b 0
)

echo [info] Node.js nao encontrado. Baixando v20.18.0 LTS...

REM Versao hardcoded -- pode ficar obsoleta. Quando passar de 6 meses,
REM atualizar para a LTS mais recente em https://nodejs.org/dist/.
powershell -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile '%TEMP%\nodejs-installer.msi'"

if not exist "%TEMP%\nodejs-installer.msi" (
  echo [ERRO] Falha ao baixar Node.js. Verifique a conexao ou
  echo        baixe manualmente em https://nodejs.org/.
  exit /b 1
)

echo [info] Instalando Node.js (silencioso, ~30s)...
msiexec /i "%TEMP%\nodejs-installer.msi" /quiet /norestart
if %errorLevel% neq 0 (
  echo [ERRO] msiexec retornou erro %errorLevel%.
  exit /b 1
)

REM PATH so atualiza para processos novos. Como o instalador roda no
REM mesmo cmd ate o fim, anexa o path do nodejs manualmente para
REM as etapas seguintes encontrarem node/npm.
set "PATH=%PATH%;%ProgramFiles%\nodejs"

where node >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Node.js instalado mas nao encontrado no PATH.
  echo        Reinicie o terminal e rode o instalador novamente.
  exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do echo [info] Node.js instalado: %%i
del "%TEMP%\nodejs-installer.msi" >nul 2>&1
exit /b 0
