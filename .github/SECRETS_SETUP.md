# Setup de Secrets para Deploy Automatizado

## O que é necessário

O workflow `deploy.yml` usa o GitHub Actions para fazer SSH no servidor e rodar o deploy.
Para isso, precisa de 3 secrets configurados no repositório GitHub.

## Configurar Secrets

1. Abrir o repositório no GitHub
2. Ir em **Settings → Secrets and variables → Actions**
3. Criar os seguintes secrets:

### `VPS_HOST`
```
51.255.199.78
```

### `VPS_USER`
```
root
```

### `VPS_SSH_KEY`
Gerar uma chave SSH dedicada para o GitHub Actions:

```bash
# No seu Mac (local)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f github-deploy-key -N ""

# Copiar a chave pública para o servidor
ssh-copy-id -i github-deploy-key.pub root@51.255.199.78

# Copiar o conteúdo da chave privada para o GitHub
cat github-deploy-key
```

Colar o conteúdo completo (com `-----BEGIN OPENSSH PRIVATE KEY-----` e `-----END OPENSSH PRIVATE KEY-----`) no campo do secret `VPS_SSH_KEY`.

**IMPORTANTE:** Não commite a chave privada no repositório.

## Verificar se funciona

Depois de configurar os secrets, faça um push no branch `main`:

```bash
git push origin main
```

Ir em **Actions** no GitHub para acompanhar o progresso do deploy.

## Troubleshooting

### "Permission denied (publickey)"
- Verificar se a chave pública foi copiada para o servidor
- Testar manualmente: `ssh -i github-deploy-key root@51.255.199.78`

### Deploy não dispara
- Verificar se o push foi para a branch `main`
- Verificar se o workflow `deploy.yml` está ativo em **Actions → Workflows**

### Health check falha
- Verificar logs: `pm2 logs eixo-server --lines 50`
- Verificar se o `.env.production` está atualizado no servidor
