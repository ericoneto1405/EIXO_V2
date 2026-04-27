# EIXO — Sistema de Gestão Pecuária

Plataforma web de gestão para pecuária de corte. Multi-tenant, modelo de assinatura mensal.

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Banco de dados:** PostgreSQL + Prisma ORM
- **IA de suporte:** Google Gemini 2.5 Flash
- **Pagamentos:** Asaas (em integração)

## Como rodar localmente

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com as credenciais do banco e APIs

# Gerar o Prisma client
npx prisma generate

# Rodar migrações
npx prisma migrate dev

# Iniciar backend
node server/index.js

# Em outro terminal — iniciar frontend
cd frontend && npm run dev
```

## Módulos

| Módulo | Status |
|--------|--------|
| Visão Geral (Dashboard) | Ativo — exclusivo planos pagos |
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

O sistema aceita qualquer planilha do produtor — não é necessário usar um modelo específico. Na importação, o usuário mapeia as colunas da sua planilha para os campos do EIXO. Modelos de exemplo estão disponíveis em `frontend/public/` para quem não tem planilha própria.

## Planos

- **Gratuito:** 1 fazenda, até 3 usuários, módulos básicos, animais ilimitados
- **Pago 1:** até 3 fazendas, até 5 usuários, Financeiro completo, Nutrição
- **Pago 2:** ilimitado, todos os módulos, Acasalamento, Confinamento, Rastreabilidade

## Identidade visual

Marca guarda-chuva: **eixo** — cobre todo o ecossistema de produtos futuros.

Paleta: sidebar escuro `#1c1917`, conteúdo branco, acento terra cotta `#a8442a`.

Arquivos de logo em `frontend/public/logo_eixo_black.svg` e `logo_eixo_white.svg`.

## App de Manejo — Área do Vaqueiro

Aplicativo Android voltado para o trabalho em campo, integrado ao sistema web. Um único app com dois perfis de acesso:

| Perfil | Descrição |
|--------|-----------|
| **Vaqueiro** | Interface simples — receber e confirmar tarefas, registrar ocorrências básicas |
| **Admin de Campo** | Operação completa em campo — pesagem, movimentação, sanidade, integração com balança eletrônica |

### Autenticação por código de ativação

Sem login e senha. O gestor gera um código único no sistema web e repassa ao trabalhador. No primeiro uso, o app vincula o código ao aparelho (device ID). A partir daí, o acesso é automático — o trabalhador só abre o app.

**Regras do código:**
- Validade: 48 horas após geração
- Uso único no primeiro acesso
- Vinculado a um único aparelho
- Não transferível entre dispositivos

**Statuses do trabalhador:**

| Status | Descrição |
|--------|-----------|
| `PENDENTE_ATIVACAO` | Código gerado, aguardando primeiro uso |
| `ATIVO` | Código ativado, aparelho vinculado |
| `CODIGO_EXPIRADO` | 48h sem ativação |
| `BLOQUEADO` | Acesso revogado pelo gestor |
| `APARELHO_REVOGADO` | Aparelho desvinculado, novo código necessário |

**Alertas automáticos:** exibidos no header do sistema web, vinculados a tarefas e processos com prazo — sem alertas genéricos por inatividade.

### Módulos do Admin de Campo

- Pesagem com integração a balanças eletrônicas (Coimma / Tru-Test S3 via Bluetooth)
- Movimentação de animais entre pastos
- Registro de ocorrências e sanidade
- Confirmação de tarefas com timestamp e localização

Protótipo de referência: `app-de-manejo/`

---

## Referência técnica

- Instruções para Claude: `CLAUDE.md`
- Regras de backend e Prisma: `AGENTS.md`
