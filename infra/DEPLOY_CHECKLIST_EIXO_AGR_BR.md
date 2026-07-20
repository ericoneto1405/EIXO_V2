# EIXO V2 — Checklist de Deploy

Checklist rápido para o ambiente `https://eixo.agr.br`.

## 1. Antes da mesclagem

- [ ] Alterações restritas ao escopo aprovado.
- [ ] Nenhum segredo ou arquivo `.env` incluído no commit.
- [ ] TypeScript e build validados.
- [ ] Migrações revisadas, quando existirem.
- [ ] Pull request aberto para `main`.
- [ ] CI do pull request aprovado.

## 2. Iniciar o deploy

- [ ] Mesclar o pull request na `main`.
- [ ] Abrir `GitHub → Actions → deploy`.
- [ ] Confirmar que a execução corresponde ao commit mesclado.

Não execute `deploy-local.sh` ou outro script manual junto com o GitHub Actions.

## 3. Acompanhar o workflow

- [ ] Instalação e build concluídos.
- [ ] Backup do banco concluído.
- [ ] Migrações aplicadas sem erro.
- [ ] PM2 reiniciado com sucesso.
- [ ] Health check da API aprovado.
- [ ] Verificação pública do site aprovada.

## 4. Verificação pós-deploy

- [ ] Site abre em `https://eixo.agr.br`.
- [ ] Login funciona.
- [ ] API responde em `https://eixo.agr.br/api/health`.
- [ ] Tela alterada funciona conforme o pedido.
- [ ] Logs do servidor não apresentam reinício contínuo.

Comando de consulta na VPS:

```bash
pm2 logs eixo-server --lines 100 --nostream
```

## 5. Se algo falhar

- [ ] Identificar a etapa exata no GitHub Actions.
- [ ] Verificar os logs do PM2 e do Nginx.
- [ ] Não executar novamente sem corrigir a causa.
- [ ] Corrigir ou reverter por uma nova branch e pull request.
- [ ] Confirmar o novo deploy e repetir a verificação pós-deploy.

## Atenção

- Nunca apontar produção para o banco de desenvolvimento.
- Nunca versionar `server/.env.production` ou chaves privadas.
- Alterações de banco exigem backup e revisão antes da mesclagem.
