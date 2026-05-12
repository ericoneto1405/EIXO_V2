# EIXO — Guia Completo de Deploy

## Visão geral

O deploy do EIXO segue um fluxo de **3 ambientes**:

```
Mac (desenvolvimento)  →  GitHub (repositório)  →  VPS (produção)
```

O desenvolvedor trabalha no Mac, o código vai para o GitHub, e a VPS busca esse código, faz o build e serve para os usuários.

---

## Parte 1 — Configuração inicial do Mac (uma vez só)

### Pré-requisitos

Antes de tudo, verifique se você tem as ferramentas necessárias:

```bash
git --version    # deve retornar algo como "git version 2.x"
node --version   # deve retornar "v20.x" ou superior
npm --version    # deve retornar "10.x" ou superior
```

Se não tiver, instale via [Homebrew](https://brew.sh):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git node
```

### Clonar o repositório

```bash
git clone https://github.com/SEU_USUARIO/eixo.git
cd eixo
```

### Instalar dependências

```bash
npm install
cd frontend && npm install && cd ..
cd server && npm install && cd ..
```

### Configurar variáveis de ambiente

```bash
cp server/.env.production.example server/.env.local
```

Edite `server/.env.local` com valores de desenvolvimento. Para uso local, o mínimo necessário é:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/eixo_dev"
SESSION_TOKEN_SALT="qualquer-string-longa-para-desenvolvimento"
CORS_ORIGIN="http://localhost:5173"
APP_BASE_URL="http://localhost:5173"
NODE_ENV="development"
PORT="3001"
```

Para gerar um `SESSION_TOKEN_SALT` seguro:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Rodar localmente

```bash
npm run dev
```

Isso inicia frontend (`localhost:5173`) e backend (`localhost:3001`) em paralelo.

---

## Parte 2 — Configurar chave SSH (uma vez só)

Sem chave SSH, cada deploy pede a senha do servidor. Com a chave, é automático.

### Verificar se já tem uma chave

```bash
ls ~/.ssh/id_ed25519.pub
```

Se o arquivo existir, pule para "Copiar chave para o servidor". Se não existir:

### Criar chave SSH

```bash
ssh-keygen -t ed25519 -C "deploy-eixo"
```

Pressione Enter em todas as perguntas (sem senha na chave agiliza o deploy).

### Copiar chave para o servidor

```bash
ssh-copy-id root@51.255.199.78
```

Vai pedir a senha do servidor **uma última vez**. Depois disso, nunca mais.

### Testar

```bash
ssh root@51.255.199.78 "echo ok"
```

Deve responder `ok` sem pedir senha.

### (Opcional) Criar atalho no ~/.ssh/config

```
Host eixo-vps
  HostName 51.255.199.78
  User root
  IdentityFile ~/.ssh/id_ed25519
```

Com isso, `ssh eixo-vps` conecta diretamente.

---

## Parte 3 — Como fazer um deploy

No terminal, dentro da pasta do projeto:

```bash
./deploy-local.sh "descrição do que foi feito"
```

Exemplos:
```bash
./deploy-local.sh "fix: botão de GPS preenchendo os dois campos"
./deploy-local.sh "feat: previsão do tempo no dashboard"
./deploy-local.sh "chore: ajuste visual no card de fazendas"
```

> A mensagem entre aspas vira o nome do commit no Git. Use verbos curtos: `feat:`, `fix:`, `chore:`, `refactor:`.

Se o script não tiver permissão de execução:
```bash
chmod +x deploy-local.sh
```

---

## Parte 4 — O que o script faz (passo a passo)

### Passo 1 — Ajusta o vite.config.ts para produção

```bash
sed -i '' "s|https://eixo.agr.br|http://localhost:3001|g" frontend/vite.config.ts
```

**Por quê?** O `vite.config.ts` tem uma configuração de proxy para desenvolvimento:

```ts
proxy: {
  '/api/': {
    target: 'https://eixo.agr.br',  // em desenvolvimento: aponta para produção
  }
}
```

No Mac, o frontend roda em `localhost:5173` e o proxy redireciona chamadas `/api/` para `eixo.agr.br` (servidor de produção). Isso permite testar a interface com dados reais sem precisar subir o backend localmente.

Na VPS, o frontend e o backend rodam na mesma máquina. O proxy precisa apontar para `localhost:3001`. O script faz essa troca antes de commitar.

### Passo 2 — Commit e push para o GitHub

```bash
git add -A
git commit -m "mensagem"
git push origin main
```

Salva todas as alterações e envia para o repositório no GitHub. Se não houver nada novo, o commit é ignorado (sem erro).

### Passo 3 — Build na VPS via SSH

```bash
ssh root@51.255.199.78 "
  cd /var/www/eixo &&
  git pull origin main &&
  cd frontend && npm run build &&
  cd .. && pm2 reload eixo-server --update-env
"
```

A VPS executa, em sequência:
1. **`git pull`** — baixa o código recém-enviado do GitHub
2. **`npm run build`** — compila o frontend (React → arquivos estáticos em `dist/`)
3. **`pm2 reload eixo-server`** — reinicia o servidor Node.js sem derrubar conexões ativas

### Passo 4 — Restaura o vite.config.ts para desenvolvimento

```bash
sed -i '' "s|http://localhost:3001|https://eixo.agr.br|g" frontend/vite.config.ts
```

Desfaz a troca do Passo 1, voltando o proxy para `eixo.agr.br`. O desenvolvedor pode continuar trabalhando normalmente no Mac.

---

## Parte 5 — Primeira vez na VPS (configuração do servidor)

Isso só precisa ser feito uma vez, quando o servidor é novo.

### Pré-requisitos no servidor (Ubuntu 22.04)

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

### 1. Configurar banco de dados

```bash
sudo -u postgres psql
CREATE USER eixo_user WITH PASSWORD 'senha_segura';
CREATE DATABASE eixo_prod OWNER eixo_user;
GRANT ALL PRIVILEGES ON DATABASE eixo_prod TO eixo_user;
\q
```

### 2. Clonar o repositório na VPS

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/SEU_USUARIO/eixo.git eixo
cd eixo
npm install
cd frontend && npm install && cd ..
cd server && npm install && cd ..
```

### 3. Configurar variáveis de ambiente

```bash
cp server/.env.production.example server/.env.production
nano server/.env.production
```

Preencha com os valores reais:

```env
DATABASE_URL="postgresql://eixo_user:senha_segura@localhost:5432/eixo_prod?schema=public"
SESSION_TOKEN_SALT="GERE_COM_O_COMANDO_ABAIXO"
CORS_ORIGIN="https://eixo.agr.br"
APP_BASE_URL="https://eixo.agr.br"
NODE_ENV="production"
PORT="3001"

GOOGLE_API_KEY="..."
TWILIO_ACCOUNT_SID="..."
TWILIO_AUTH_TOKEN="..."
TWILIO_VERIFY_SID="..."
RESEND_API_KEY="..."
RESEND_FROM_EMAIL="noreply@eixo.agr.br"
```

Gerar o `SESSION_TOKEN_SALT`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Aplicar migrações e fazer o build inicial

```bash
cd /var/www/eixo
export $(grep -v '^#' server/.env.production | xargs)
npx prisma migrate deploy --schema server/prisma/schema.prisma
npx prisma generate --schema server/prisma/schema.prisma
cd frontend && npm run build && cd ..
```

### 5. Iniciar o servidor com PM2

```bash
pm2 start server/index.js --name eixo-server --env production
pm2 save
pm2 startup   # ativa início automático após reboot do servidor
```

### 6. Configurar Nginx

```bash
sudo cp infra/nginx.conf /etc/nginx/sites-available/eixo
sudo ln -s /etc/nginx/sites-available/eixo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 7. Certificado SSL

```bash
sudo certbot --nginx -d eixo.agr.br -d www.eixo.agr.br
```

A renovação automática já é configurada pelo certbot.

---

## Parte 6 — Backup automático (cron diário às 3h)

```bash
crontab -e
# Adicionar linha:
0 3 * * * /var/www/eixo/server/backup.sh >> /var/log/eixo-backup.log 2>&1
```

Backups ficam em `server/backups/` com retenção de 7 dias.

Para restaurar um backup:
```bash
gunzip -c server/backups/eixo_backup_YYYY-MM-DD_HH-MM-SS.sql.gz | psql -U eixo_user -d eixo_prod
```

---

## Infraestrutura atual

| Item | Valor |
|------|-------|
| IP | `51.255.199.78` |
| Domínio | `https://eixo.agr.br` |
| Diretório do projeto | `/var/www/eixo` |
| Processo gerenciado por | PM2 (nome: `eixo-server`) |
| Backend | Node.js + Express na porta `3001` |
| Frontend compilado | `frontend/dist/` (servido pelo Express) |

---

## Monitoramento

```bash
pm2 status                         # status dos processos
pm2 logs eixo-server               # logs em tempo real
pm2 logs eixo-server --lines 100   # últimas 100 linhas
sudo tail -f /var/log/nginx/eixo_error.log
```

Monitoramento externo: [UptimeRobot](https://uptimerobot.com) — monitor HTTP para `https://eixo.agr.br`, intervalo de 5 minutos.

---

## Problemas comuns

### "Permission denied" ao fazer SSH
Configure a chave SSH conforme descrito na Parte 2. Se a chave já está configurada mas ainda pede senha, verifique:
```bash
ssh -v root@51.255.199.78
```

### O deploy rodou mas as mudanças não aparecem no browser
O browser pode estar usando cache. Force reload:
- Mac: **Cmd+Shift+R**
- Windows/Linux: **Ctrl+Shift+R**

### git index.lock — erro no git add
Ocorre quando um processo git anterior travou. Resolva com:
```bash
rm .git/index.lock
```

### "Nada novo para commitar"
O script avisa mas continua normalmente. A VPS ainda faz `git pull` e rebuild. Se quiser forçar o rebuild sem mudanças de código, basta rodar o script da mesma forma.

### Erro no build da VPS ("module not found" etc.)
Provavelmente uma dependência nova não foi instalada. Na VPS:
```bash
cd /var/www/eixo && npm install
cd frontend && npm install && cd ..
cd server && npm install && cd ..
```

Depois rode o deploy normalmente.

---

## Fluxo resumido

```
1. Você edita o código no Mac
2. ./deploy-local.sh "mensagem"
   ├── Ajusta vite.config.ts para VPS
   ├── git add + commit + push → GitHub
   ├── SSH na VPS → git pull + npm build + pm2 reload
   └── Restaura vite.config.ts para desenvolvimento
3. Mudanças no ar em https://eixo.agr.br
```
