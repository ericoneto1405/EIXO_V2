# EIXO — Guia de Produção

## Pré-requisitos no servidor (Ubuntu 22.04)

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL 15
sudo apt-get install -y postgresql-15

# Nginx
sudo apt-get install -y nginx

# PM2 (mantém o servidor rodando)
sudo npm install -g pm2

# Certbot (certificado SSL gratuito)
sudo apt-get install -y certbot python3-certbot-nginx
```

---

## Primeira vez no servidor

### 1. Configurar banco de dados

```bash
sudo -u postgres psql
CREATE USER eixo_user WITH PASSWORD 'senha_segura';
CREATE DATABASE eixo_prod OWNER eixo_user;
GRANT ALL PRIVILEGES ON DATABASE eixo_prod TO eixo_user;
\q
```

### 2. Configurar variáveis de ambiente

```bash
cp server/.env.production.example server/.env.production
nano server/.env.production   # preencher com valores reais
```

Gerar o SESSION_TOKEN_SALT:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Aplicar banco e iniciar servidor

```bash
export $(grep -v '^#' server/.env.production | xargs)
npx prisma migrate deploy --schema server/prisma/schema.prisma
npx prisma generate --schema server/prisma/schema.prisma

cd frontend && npm install && npm run build && cd ..

pm2 start server/index.js --name eixo-server --env production
pm2 save
pm2 startup   # ativa início automático após reboot
```

### 4. Configurar Nginx

```bash
# Editar o caminho do root no nginx.conf antes de copiar
sudo cp infra/nginx.conf /etc/nginx/sites-available/eixo
sudo ln -s /etc/nginx/sites-available/eixo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Certificado SSL (Let's Encrypt)

```bash
sudo certbot --nginx -d eixo.ag -d www.eixo.ag
# Renovação automática já é configurada pelo certbot
```

---

## Deploy de nova versão

```bash
./deploy.sh
```

O script faz automaticamente: backup → git pull → npm install → migração → build → reload PM2.

---

## Backup automático (cron diário às 3h)

```bash
crontab -e
# Adicionar linha:
0 3 * * * /caminho/para/EIXO\ V2/server/backup.sh >> /var/log/eixo-backup.log 2>&1
```

Backups ficam em `server/backups/`. Retenção: 7 dias.

Para restaurar um backup:
```bash
gunzip -c server/backups/eixo_backup_YYYY-MM-DD_HH-MM-SS.sql.gz | psql -U eixo_user -d eixo_prod
```

---

## Monitoramento de uptime

### Opção gratuita recomendada: UptimeRobot
1. Criar conta em https://uptimerobot.com
2. Criar monitor HTTP(S) para `https://eixo.ag`
3. Intervalo: 5 minutos
4. Alerta: e-mail para `admin@eixo.ag`

### Comandos úteis no servidor

```bash
pm2 status              # status dos processos
pm2 logs eixo-server    # logs em tempo real
pm2 logs eixo-server --lines 100   # últimas 100 linhas
sudo nginx -t           # testa config do nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/eixo_error.log
```

---

## Checklist antes de ir ao ar

- [ ] `.env.production` preenchido com valores reais
- [ ] `SESSION_TOKEN_SALT` único e gerado aleatoriamente
- [ ] `CORS_ORIGIN` apontando para `https://eixo.ag`
- [ ] `APP_BASE_URL` apontando para `https://eixo.ag`
- [ ] DNS do domínio `eixo.ag` apontando para o IP do servidor
- [ ] Certificado SSL instalado e renovação automática ativa
- [ ] PM2 configurado para iniciar com o servidor (`pm2 startup`)
- [ ] Backup automático configurado no cron
- [ ] Monitor de uptime criado no UptimeRobot
- [ ] Teste de login funcionando em produção
- [ ] Teste de importação de planilha funcionando
- [ ] Twilio e Resend com credenciais de produção (não sandbox)
