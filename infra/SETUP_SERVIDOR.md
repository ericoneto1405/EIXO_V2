# EIXO — Setup do Servidor (primeira vez)

Domínio: **eixo.agr.br**
Servidor: Ubuntu 22.04

---

## ANTES DE COMEÇAR

Você vai precisar de:
- Acesso SSH ao VPS (IP do servidor, usuário e senha ou chave)
- Acesso ao painel de DNS do seu domínio (onde registrou o eixo.agr.br)

---

## PASSO 1 — Apontar o DNS para o servidor

No painel do seu registrador de domínio, crie dois registros do tipo **A**:

| Nome | Tipo | Valor |
|------|------|-------|
| `@` | A | IP do seu VPS |
| `www` | A | IP do seu VPS |

> Pode levar até 24h para propagar, mas geralmente é rápido (minutos).

Para descobrir o IP do VPS, acesse o painel do provedor (Hostinger, DigitalOcean, etc.).

---

## PASSO 2 — Acessar o servidor via SSH

No seu computador (Mac/Linux, pelo Terminal):

```bash
ssh root@SEU_IP_DO_VPS
```

Se der erro de permissão, use:
```bash
ssh -i ~/.ssh/sua_chave root@SEU_IP_DO_VPS
```

---

## PASSO 3 — Instalar dependências

Cole esses comandos no servidor (um bloco de cada vez):

```bash
# Atualizar o sistema
apt-get update && apt-get upgrade -y

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# PostgreSQL 15
apt-get install -y postgresql-15

# Nginx
apt-get install -y nginx

# PM2 (mantém o servidor rodando)
npm install -g pm2

# Certbot (certificado HTTPS gratuito)
apt-get install -y certbot python3-certbot-nginx

# Git
apt-get install -y git
```

---

## PASSO 4 — Criar banco de dados

```bash
sudo -u postgres psql
```

Dentro do PostgreSQL, cole:
```sql
CREATE USER eixo_user WITH PASSWORD 'TROQUE_POR_SENHA_FORTE';
CREATE DATABASE eixo_prod OWNER eixo_user;
GRANT ALL PRIVILEGES ON DATABASE eixo_prod TO eixo_user;
\q
```

> Guarde o usuário (`eixo_user`) e a senha — vão entrar no `.env.production`.

---

## PASSO 5 — Clonar o projeto no servidor

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git eixo
cd eixo
```

> Substitua pela URL real do seu repositório Git (GitHub, GitLab, etc.).

---

## PASSO 6 — Configurar variáveis de ambiente

```bash
cp server/.env.production.example server/.env.production
nano server/.env.production
```

Preencha os valores:

```env
DATABASE_URL="postgresql://eixo_user:SENHA_DO_BANCO@localhost:5432/eixo_prod"
SESSION_TOKEN_SALT="GERE_ABAIXO"
NODE_ENV=production
PORT=3001

# Twilio (SMS de verificação)
TWILIO_ACCOUNT_SID=seu_sid
TWILIO_AUTH_TOKEN=seu_token
TWILIO_PHONE_NUMBER=+55...

# Resend (e-mails)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@eixo.agr.br

# Asaas (pagamentos)
ASAAS_API_KEY=sua_chave
ASAAS_ENV=production

# URL pública do sistema
APP_URL=https://eixo.agr.br
```

Para gerar o SESSION_TOKEN_SALT, rode:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Salvar no nano: `Ctrl+O`, Enter, `Ctrl+X`.

---

## PASSO 7 — Instalar dependências e criar banco

```bash
cd /var/www/eixo

# Instalar dependências do projeto
npm install

# Aplicar estrutura do banco
export $(grep -v '^#' server/.env.production | xargs)
npx prisma migrate deploy --schema server/prisma/schema.prisma
npx prisma generate --schema server/prisma/schema.prisma
```

---

## PASSO 8 — Build do frontend

```bash
cd /var/www/eixo/frontend
npm install
npm run build
```

Vai criar a pasta `frontend/dist` com o site compilado.

---

## PASSO 9 — Iniciar o servidor com PM2

```bash
cd /var/www/eixo
pm2 start server/index.js --name eixo-server
pm2 save
pm2 startup   # copie e cole o comando que ele mostrar
```

Verificar se está rodando:
```bash
pm2 status
pm2 logs eixo-server --lines 20
```

---

## PASSO 10 — Configurar Nginx

```bash
# Copiar o arquivo de configuração já pronto
cp /var/www/eixo/infra/nginx.conf /etc/nginx/sites-available/eixo

# Ativar
ln -s /etc/nginx/sites-available/eixo /etc/nginx/sites-enabled/

# Remover o site padrão (opcional mas recomendado)
rm -f /etc/nginx/sites-enabled/default

# Testar configuração
nginx -t

# Recarregar nginx
systemctl reload nginx
```

---

## PASSO 11 — Certificado HTTPS (SSL gratuito)

> O DNS já precisa estar apontando para o servidor (Passo 1).

```bash
certbot --nginx -d eixo.agr.br -d www.eixo.agr.br
```

Siga as instruções na tela. O certbot configura o HTTPS automaticamente.

Renovação automática (já vem configurada, mas para confirmar):
```bash
certbot renew --dry-run
```

---

## PASSO 12 — Configurar backup automático

```bash
# Tornar o script executável
chmod +x /var/www/eixo/server/backup.sh

# Rodar backup todo dia às 3h da manhã
crontab -e
```

Adicionar essa linha no crontab:
```
0 3 * * * /var/www/eixo/server/backup.sh >> /var/log/eixo_backup.log 2>&1
```

---

## Pronto!

O sistema estará acessível em: **https://eixo.agr.br**

---

## Deploys futuros

O fluxo oficial é automático: mescle um pull request na branch `main` e acompanhe o workflow `deploy` no GitHub Actions.

Se o GitHub Actions estiver indisponível, use a contingência **no servidor**:

```bash
cd /var/www/eixo
./deploy-manual.sh
```

Antes de executar, confirme que não existe outro deploy em andamento. O script faz backup, atualiza o código, instala dependências, aplica migrações, gera o build, reinicia o servidor e valida a disponibilidade.

---

## Comandos úteis no dia a dia

```bash
# Ver logs do servidor em tempo real
pm2 logs eixo-server

# Reiniciar o servidor
pm2 restart eixo-server

# Ver status
pm2 status

# Ver logs do Nginx
tail -f /var/log/nginx/eixo_error.log
```
