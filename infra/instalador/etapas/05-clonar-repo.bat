@echo off
setlocal enabledelayedexpansion
echo [5/9] Clonando repositorio...

REM Idempotencia: detecta clone previo pelo package.json.
if exist "C:\caixa-boti\package.json" (
  echo [info] Repo ja clonado em C:\caixa-boti. Atualizando com git pull...
  cd /d C:\caixa-boti
  git pull --ff-only
  if !errorLevel! neq 0 (
    echo [aviso] git pull falhou. Continuando com versao local existente.
  )
  exit /b 0
)

cd /d C:\caixa-boti

REM Repo plexalabs/controle-caixa. Se for privado, este clone falha
REM com 403 e o operador precisa configurar:
REM   1. Personal Access Token: https://github.com/settings/tokens
REM   2. git config --global credential.helper manager
REM   3. Primeiro clone vai pedir usuario/PAT no Credential Manager.
git clone https://github.com/plexalabs/controle-caixa.git .
if %errorLevel% neq 0 (
  echo [ERRO] Clone falhou.
  echo        Se o repo for privado, configure um Personal Access Token
  echo        em https://github.com/settings/tokens (escopo "repo") e
  echo        rode novamente — o Git Credential Manager vai pedir as
  echo        credenciais na primeira vez.
  exit /b 1
)

echo [info] Repositorio clonado.
exit /b 0
