@echo off
echo [6/9] Configurando .env.local...

if exist "C:\caixa-boti\.env.local" (
  echo [info] .env.local ja existe. Pulando para preservar credenciais.
  echo        Se quiser reconfigurar, apague o arquivo e rode novamente.
  exit /b 0
)

cd /d C:\caixa-boti

echo.
echo Cole as credenciais do projeto. Sao 2 valores que so o operador
echo tem acesso (nao estao no Git):
echo.

set /p ANON_KEY="VITE_SUPABASE_ANON_KEY: "
if "%ANON_KEY%"=="" (
  echo [ERRO] ANON_KEY e obrigatoria. Sem ela o app nao conecta no banco.
  exit /b 1
)

echo.
set /p SENTRY_DSN="VITE_SENTRY_DSN (ENTER para pular se nao tiver): "

REM URL do Supabase e fixa para este projeto -- nao ha multi-tenant.
(
  echo VITE_SUPABASE_URL=https://shjtwrojdgotmxdbpbta.supabase.co
  echo VITE_SUPABASE_ANON_KEY=%ANON_KEY%
  echo VITE_SENTRY_DSN=%SENTRY_DSN%
) > .env.local

echo [info] .env.local criado em C:\caixa-boti\.env.local
exit /b 0
