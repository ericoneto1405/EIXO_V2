# Setup de Secrets para Deploy Automatizado

Usar somente para configuração inicial, alteração ou rotação de secrets; nunca como etapa de deploy normal. Publicação: [fonte canônica](../infra/DEPLOY.md).

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
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/eixo-github-actions-deploy -N ""

# Copiar a chave pública para o servidor
ssh-copy-id -i ~/.ssh/eixo-github-actions-deploy.pub root@51.255.199.78

# Enviar a chave privada diretamente ao secret, sem exibi-la no terminal
gh secret set VPS_SSH_KEY --repo ericoneto1405/EIXO_V2 < ~/.ssh/eixo-github-actions-deploy
```

Também é possível cadastrar manualmente o conteúdo no secret `VPS_SSH_KEY`, evitando copiar a chave para arquivos dentro do projeto.

**IMPORTANTE:** Não commite a chave privada no repositório.

## Verificar a configuração

Confirmar os nomes com `gh secret list` (sem revelar valores) e testar a autenticação SSH com comando remoto somente de leitura, como `true`. Configurar secrets não autoriza publicação; não fazer push direto na `main` para testá-los. A próxima publicação autorizada segue [DEPLOY.md](../infra/DEPLOY.md).

## Rotação e diagnóstico de autenticação

- Adicionar a chave nova antes de revogar a anterior; confirmar o acesso novo e atualizar o secret sem exibir a chave.
- Após uma publicação autorizada confirmar o novo acesso, revogar a chave antiga na VPS e remover cópias privadas obsoletas com autorização correspondente.
- Em `Permission denied (publickey)`, conferir usuário, chave pública autorizada e correspondência do secret; nunca colar segredos em logs.
- Falhas de workflow ou healthcheck pertencem ao diagnóstico de [DEPLOY.md](../infra/DEPLOY.md).
