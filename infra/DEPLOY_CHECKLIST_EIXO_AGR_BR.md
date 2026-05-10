# EIXO V2 — Checklist de Deploy (Servidor Real)

## Objetivo
Checklist curto para deploy seguro no ambiente que atende `https://eixo.agr.br`.

## 1) Antes do deploy
- [ ] Confirmar que está no servidor real (não no notebook local).
- [ ] Confirmar branch correta:
  - `git branch --show-current`
- [ ] Confirmar árvore limpa:
  - `git status -sb`
- [ ] Confirmar `.env.production` com valores reais:
  - `DATABASE_URL` do banco de produção
  - `TWILIO_ACCOUNT_SID` começando com `AC`
  - `TWILIO_VERIFY_SID` começando com `VA`
  - `PORT=3000` (padrão do proxy observado)

## 2) Deploy
- [ ] Rodar script:
  - `./deploy.sh`
- [ ] Validar PM2:
  - `pm2 status eixo-server`
- [ ] Validar logs (sem erro de crash):
  - `pm2 logs eixo-server --lines 80 --nostream`

## 3) Nginx (host real)
- [ ] Confirmar proxy ativo para a porta da API (esperado: `3000`).
- [ ] Testar configuração:
  - `sudo nginx -t`
- [ ] Recarregar Nginx:
  - `sudo systemctl reload nginx`

## 4) Testes rápidos pós-deploy
- [ ] Site responde:
  - `curl -I "https://eixo.agr.br/?new=1"`
- [ ] Health da API responde:
  - `curl -s "https://eixo.agr.br/api/health"`
- [ ] Login web funcionando.
- [ ] Tela HQ abre para usuário com `SUPER_ADMIN`.

## 5) Se algo der errado
- [ ] Ver logs:
  - `pm2 logs eixo-server --lines 150 --nostream`
  - `sudo tail -n 150 /var/log/nginx/error.log`
- [ ] Voltar para commit anterior e reiniciar:
  - `git log --oneline -n 5`
  - `git checkout <commit_anterior>`
  - `./deploy.sh`

## Observações importantes
- Evite apontar produção para banco de desenvolvimento (`eixo_dev`).
- Não use placeholders em credenciais de produção.
- Faça backup antes de toda migração (o `deploy.sh` já faz isso).
