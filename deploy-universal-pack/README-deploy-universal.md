# Deploy Universal

Arquivos:

- `deploy-universal.sh`: script único.
- `deploy.eixo.env`: configuração do EIXO.
- `deploy.gerped.env`: configuração do GERPED.

## Uso

```bash
chmod +x deploy-universal.sh
./deploy-universal.sh eixo "fix: ajuste no login"
./deploy-universal.sh gerped "fix: ajuste no dashboard"
```

## Para não pedir senha

Configure SSH uma vez:

```bash
ssh-copy-id root@IP_DA_VPS
ssh root@IP_DA_VPS "echo ok"
```

Se o segundo comando responder `ok` sem pedir senha, o deploy roda sem senha.

## Atenção

Não coloque senha dentro dos arquivos `.env`.
Use chave SSH.
