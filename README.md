# EIXO — Sistema de Gestão Pecuária

Plataforma web de gestão para pecuária de corte. Multi-tenant, com modelo de assinatura mensal.

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Banco de dados:** PostgreSQL + Prisma ORM
- **IA de suporte:** Google Gemini 2.5 Flash
- **Pagamentos:** Asaas

## Como rodar localmente

```bash
# Instalar dependências da raiz
npm install

# Instalar dependências do frontend
cd frontend && npm install && cd ..

# Instalar dependências do backend
cd server && npm install && cd ..
```

Configure as variáveis de ambiente conforme os arquivos de exemplo do projeto.

```bash
# Gerar Prisma Client
npx prisma generate --schema server/prisma/schema.prisma

# Rodar migrações em ambiente local
npx prisma migrate dev --schema server/prisma/schema.prisma

# Iniciar backend
node server/index.js

# Em outro terminal, iniciar frontend
cd frontend && npm run dev
```

## Deploy

O EIXO está em produção. O fluxo oficial é automático pelo GitHub Actions:

```text
branch de trabalho → pull request → main → validação → VPS → produção
```

A documentação completa está em [`infra/DEPLOY.md`](infra/DEPLOY.md). O checklist está em [`infra/DEPLOY_CHECKLIST_EIXO_AGR_BR.md`](infra/DEPLOY_CHECKLIST_EIXO_AGR_BR.md).

Antes de rodar deploy, confirme:

- branch correta;
- TypeScript sem erro;
- build concluído;
- pull request aprovado;
- CI aprovado.

## Módulos

| Módulo | Status |
|--------|--------|
| Visão Geral (Dashboard) | Ativo — disponível em todos os planos |
| Estrutura da Fazenda | Ativo |
| Manejo do Rebanho | Ativo |
| Financeiro | Ativo |
| Nutrição | Ativo |
| Confinamento e Contratos | Em desenvolvimento |
| Reprodução / Eixo Acasalamento | Em desenvolvimento |
| Estoque e Equipamentos | Planejado |
| Gestão Comercial | Planejado |
| Registro de Atividades | Planejado |

## Importação de rebanho

Não há importação automática por planilha (parse/upload). O usuário baixa uma planilha modelo em branco e preenche manualmente.

Planilha modelo disponível via `GET /herd/import/template`, acionada pelo botão "Planilha modelo" no `HerdModule.tsx`.

## Planos

### EIXO Essencial

- 1 fazenda
- Até 3 usuários
- Animais ilimitados
- Rebanho básico
- Estrutura da Fazenda
- Financeiro
- Visão Geral

### EIXO Gestão

- Até 3 fazendas
- Até 5 usuários
- Animais ilimitados
- Tudo do Plano Grátis
- Nutrição
- Pesagens avançadas
- Exportação Excel/PDF

### EIXO Performance

- Fazendas ilimitadas
- Usuários ilimitados
- Animais ilimitados
- Todos os módulos
- Eixo Acasalamento
- Confinamento
- Rastreabilidade completa
- Mapeamento por IA
- Integração com balanças eletrônicas

## Identidade visual

Marca guarda-chuva: **EIXO**.

A marca cobre o ecossistema de produtos futuros.

Logo: "EIXO" maiúsculo, tipografia geométrica bold, com o X bicolor.

### Arquivos de logo

Arquivos em:

```txt
frontend/public/
```

| Arquivo | Uso |
|---------|-----|
| `logo_eixo_official.svg` | Logo oficial usada no sistema |
| `eixo-x-icon.svg` | Favicon e ícone de app |

### Paleta EIXO

| Nome | Hex | Uso |
|------|-----|-----|
| Grafite Escuro | `#2F2F2F` | Sidebar, avatares, FAB de suporte |
| Grafite Principal | `#5E5E5E` | Texto secundário, ícones inativos |
| Verde EIXO | `#B6E23A` | Acento interativo — botões, tabs ativas, focus rings |
| Cinza Claro | `#EDEDED` | Fundo de página, tabs inativas, bordas |
| Branco | `#FFFFFF` | Fundo de conteúdo, superfícies |

Regra de contraste:

> `#B6E23A` é uma cor clara. Nunca usar texto branco sobre fundo verde. Todo texto sobre verde deve ser `#1a1a1a` ou `#2F2F2F`.

### Tipografia

| Uso | Fonte | Peso |
|-----|-------|------|
| Títulos e subtítulos | Manrope | SemiBold / Bold |
| Textos e interfaces | Inter | Regular / Medium |

## App de Manejo — Área do Vaqueiro

Aplicativo Android integrado ao EIXO, voltado ao trabalho em campo e curral.

Perfis principais:

| Perfil | Descrição |
|--------|-----------|
| `VAQUEIRO` | Interface simples para receber tarefas e registrar ocorrências |
| `ADMIN_CAMPO` | Operação de campo com pesagem, busca de animais e sincronização |

Características principais:

- ativação por código gerado no sistema web;
- vínculo do código ao aparelho;
- uso offline em operações de campo;
- fila local de pesagens;
- sincronização ao reconectar;
- tratamento de conflitos.

Plano completo:

```txt
EIXOCAMPO.md
```

Protótipo de referência:

```txt
app-de-manejo/
```

## Documentação

| Arquivo | Finalidade |
|--------|------------|
| `AGENTS.md` | Instruções para Codex e regras técnicas do projeto |
| `infra/DEPLOY.md` | Deploy e operação em produção |
| `infra/DEPLOY_CHECKLIST_EIXO_AGR_BR.md` | Checklist de publicação e verificação |
| `EIXOCAMPO.md` | Plano completo do App de Manejo |
| `README.md` | Visão geral do projeto |
