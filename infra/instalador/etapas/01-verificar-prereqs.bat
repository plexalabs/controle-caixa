@echo off
echo [1/9] Verificando pre-requisitos do sistema...

REM Confirma admin (orquestrador ja checou, mas como cada etapa pode
REM ser chamada isolada para retomada, valida de novo).
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Etapa precisa ser executada como administrador.
  exit /b 1
)

REM Conectividade basica — sem internet nada vai funcionar.
ping -n 1 -w 2000 github.com >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Sem conexao com github.com. Verifique a internet.
  exit /b 1
)

ping -n 1 -w 2000 nodejs.org >nul 2>&1
if %errorLevel% neq 0 (
  echo [ERRO] Sem conexao com nodejs.org. Verifique a internet.
  exit /b 1
)

REM Avisa sobre PowerShell ExecutionPolicy — precisamos rodar
REM Invoke-WebRequest para baixar instaladores.
powershell -Command "if ((Get-ExecutionPolicy -Scope CurrentUser) -eq 'Restricted') { exit 1 }" >nul 2>&1
if %errorLevel% neq 0 (
  echo [aviso] PowerShell ExecutionPolicy esta Restricted.
  echo         Ajustando para RemoteSigned no escopo CurrentUser...
  powershell -Command "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force"
)

echo [info] Pre-requisitos OK.
exit /b 0
