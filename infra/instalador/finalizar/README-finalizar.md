# Finalizar instalacao Caixa Boti

Scripts para terminar as etapas 8 (tunnel) e 9 (PM2) do instalador
principal (`infra/instalador/instalar-caixa-boti.bat`) caso elas
tenham falhado ou nao tenham rodado.

## Quando usar

Use estes scripts se:

- Voce rodou `instalar-caixa-boti.bat` e ele terminou
- `cloudflared --version` funciona (cloudflared instalado), MAS
- `sc query cloudflared` retorna "servico nao existe" OU
- `pm2 --version` retorna "nao reconhecido"
- Pasta `C:\caixa-boti` existe com `.env.local` e `dist/`

Ou seja: o instalador parou ou pulou silenciosamente as etapas
finais e voce ficou sem tunnel + sem autostart.

## Como usar (caminho automatico)

1. Abra o CMD como **administrador**
2. Va para a pasta:

   ```cmd
   cd C:\caixa-boti\infra\instalador\finalizar
   ```

3. Execute:

   ```cmd
   finalizar-instalacao.bat
   ```

4. Siga as instrucoes na tela. Em algum momento vai abrir o browser
   para autorizar o Cloudflare -- autorize a zona `plexalabs.com`.

## Como usar (caminho granular, se algo falhar)

Os dois `.bat` tambem podem ser rodados isolados:

```cmd
01-tunnel-setup.bat       REM so o tunnel
02-pm2-setup.bat          REM so o autostart do app
```

Cada um tem `pause` no final, entao a janela nao fecha sozinha
e voce ve o que aconteceu.

## Plano B (manual, se os .bat falharem)

Comandos puros que os scripts executam por baixo dos panos:

```cmd
REM 1. Login (abre browser)
cloudflared tunnel login

REM 2. Cria tunnel
cloudflared tunnel create caixa-boti

REM 3. Anota o UUID que apareceu e edita config.yml
notepad C:\caixa-boti\infra\tunnel\config.yml
REM     trocar TUNNEL_ID_AQUI pelo UUID real (2 ocorrencias)

REM 4. DNS
cloudflared tunnel route dns caixa-boti caixa-boti.plexalabs.com

REM 5. Servico Windows
cloudflared service install --config C:\caixa-boti\infra\tunnel\config.yml
sc start cloudflared

REM 6. PM2 + autostart
npm install -g pm2 pm2-windows-startup
pm2-startup install
cd C:\caixa-boti
pm2 start npm --name "caixa-boti" -- run preview
pm2 save
```

## Alternativa ao PM2: NSSM (recomendado)

Depois que tudo estiver funcionando com PM2, voce pode opcionalmente
trocar PM2 por NSSM rodando o `instalar-servico-windows.bat` na
**pasta acima** (`infra/instalador/`).

NSSM tem 3 vantagens sobre PM2 nesse cenario:

1. Roda em **Session 0** (totalmente invisivel ao operador, sem
   nenhuma janela)
2. Eh um servico Windows nativo (igual o cloudflared) -- aparece
   no `services.msc` e responde a `sc query`
3. Restart automatico em crash com throttle e logs rotacionados

O `instalar-servico-windows.bat` mata o PM2 antigo e cria o NSSM
no lugar (idempotente).

## Troubleshooting

### "cert.pem nao foi criado"

Login do cloudflared falhou silenciosamente. Causas comuns:

- Browser nao abriu sozinho. Solucao: copie a URL que aparece no
  output do terminal e abra manualmente
- Voce autorizou a zona errada. Volte e escolha `plexalabs.com`
- Voce fechou a aba antes de clicar Authorize

Tente rodar isolado:

```cmd
cloudflared tunnel login
```

Confira que apareceu `C:\Users\<seu-user>\.cloudflared\cert.pem`.

### "credentials-file nao existe"

UUID errado no `config.yml`. Liste os tunnels:

```cmd
cloudflared tunnel list
```

Pegue o UUID da linha do `caixa-boti` e rode `01-tunnel-setup.bat`
de novo, colando o UUID quando ele pedir.

### "pm2 nao e reconhecido"

PATH nao atualizou na janela CMD atual. Solucoes:

- Abra um **CMD novo** e tente: `pm2 --version`
- Se ainda nao funcionar, reinstale:

  ```cmd
  npm install -g pm2 pm2-windows-startup
  ```

### "service install retornou erro"

Provavelmente o servico ja existe (idempotencia). Confirme:

```cmd
sc query cloudflared
```

Se aparecer com STATE: RUNNING, esta tudo certo. Se STOPPED:

```cmd
sc start cloudflared
```

### Janela CMD fecha antes de eu ler o erro

Os scripts tem `pause` no final, mas se voce executou via duplo-clique
e o cmd fechou imediatamente, eh porque o `.bat` saiu via `exit /b`
sem chegar no `pause`. Solucao: abra o CMD primeiro, navegue ate
a pasta, e execute o `.bat` por nome -- assim a janela fica aberta
mesmo apos o `exit`.
