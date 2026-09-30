# EIXO V2 — Checklist de Deploy

Checklist rápido para o ambiente `https://eixo.agr.br`.

Siga a regra de autorização de [`DEPLOY.md`](DEPLOY.md): preparar o lote, reunir pendências e obter uma única autorização para o fluxo completo. Os itens abaixo são verificações do executor, não perguntas individuais ao usuário.

## 0. Preparação e autorização

- [ ] Lote delimitado: arquivos, commits, exclusões do escopo e dependências revisados.
- [ ] Migrações pendentes no destino, efeitos no banco, configurações e recuperação apresentados.
- [ ] Validações seguras disponíveis executadas; resultados e bloqueios informados.
- [ ] Acesso ao GitHub e deploys em andamento verificados.
- [ ] Autorização de publicação obtida ou já identificada na conversa para o mesmo lote.

## 1. Antes da mesclagem

- [ ] Alterações restritas ao escopo aprovado.
- [ ] Branch atualizada com a base remota, sem conflitos; alterações alheias preservadas fora do lote.
- [ ] Nenhum segredo ou arquivo `.env` incluído no commit.
- [ ] Auditoria de dependências, geração do Prisma Client, TypeScript e build aprovados.
- [ ] Testes do backend, conhecimento do EIXO Suporte, schema Prisma e `git diff --check` aprovados.
- [ ] Todas as migrações pendentes que serão aplicadas estão revisadas e autorizadas.
- [ ] Pull request aberto para `main`.
- [ ] CI do pull request aprovado.

## 2. Iniciar o deploy

- [ ] Mesclar o pull request na `main`.
- [ ] Abrir `GitHub → Actions → deploy`.
- [ ] Confirmar que a execução corresponde ao commit mesclado.

Não execute deploy manual junto com o GitHub Actions. A VPS publica o SHA fixado pelo workflow (`github.sha`); confira a correspondência com o commit aprovado.

## 3. Acompanhar o workflow

- [ ] Instalação e build concluídos.
- [ ] Backup do banco concluído.
- [ ] Migrações aplicadas sem erro.
- [ ] PM2 reiniciado com sucesso.
- [ ] Health check da API aprovado.
- [ ] Versão do EIXO Suporte verificada e `releaseSha` publicado comparado ao commit esperado.
- [ ] Verificação pública do site aprovada.

## 4. Verificação pós-deploy

- [ ] Site abre em `https://eixo.agr.br`.
- [ ] Login funciona.
- [ ] API responde em `https://eixo.agr.br/api/health`.
- [ ] Tela alterada funciona conforme o pedido.
- [ ] Logs do servidor não apresentam reinício contínuo.

Registre evidências de PR, commit e execução do workflow no resultado final. Se não houver sessão para testar login/tela, informe essa pendência; disponibilidade pública não substitui validação autenticada.

Comando de consulta na VPS:

```bash
pm2 logs eixo-server --lines 100 --nostream
```

## 5. Se algo falhar

- [ ] Identificar a etapa exata no GitHub Actions.
- [ ] Verificar os logs do PM2 e do Nginx.
- [ ] Não executar novamente sem corrigir a causa.
- [ ] Apresentar correção ou reversão por branch e PR; obter autorização para o que exceder o plano aprovado.
- [ ] Avaliar migrações separadamente: reverter código não restaura o banco.
- [ ] Confirmar o novo deploy e repetir a verificação pós-deploy.

## Atenção

- Nunca apontar produção para o banco de desenvolvimento.
- Nunca versionar `server/.env.production` ou chaves privadas.
- Alterações de banco exigem backup e revisão antes da mesclagem.
