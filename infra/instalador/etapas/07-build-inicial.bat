@echo off
echo [7/9] Build inicial (npm install + npm run build)...

cd /d C:\caixa-boti

REM npm install e idempotente — se node_modules ja existe e package-lock
REM esta sincronizado, e quase no-op (~5s). Caso contrario baixa tudo
REM (~2-3 min na primeira vez).
echo [info] Instalando dependencias...
call npm install
if %errorLevel% neq 0 (
  echo [ERRO] npm install falhou.
  echo        Verifique a conexao e tente "cd C:\caixa-boti && npm install"
  echo        manualmente para ver o erro completo.
  exit /b 1
)

echo [info] Compilando build de producao...
call npm run build
if %errorLevel% neq 0 (
  echo [ERRO] Build falhou.
  echo        Comum: faltou variavel em .env.local. Verifique etapa 6.
  exit /b 1
)

if not exist "C:\caixa-boti\dist\index.html" (
  echo [ERRO] Build rodou mas dist\index.html nao existe.
  exit /b 1
)

echo [info] Build concluido em C:\caixa-boti\dist\
exit /b 0
