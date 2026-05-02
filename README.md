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

Marca guarda-chuva: **EIXO** — cobre todo o ecossistema de produtos futuros.

Logo: "EIXO" maiúsculo, tipografia geométrica bold, com o X bicolor — uma diagonal em Grafite `#2F2F2F` (ou branco sobre fundo escuro), outra em Verde EIXO `#B6E23A`.

### Arquivos de logo (`frontend/public/`)

| Arquivo | Uso |
|---------|-----|
| `logo_eixo_official.svg` | Fundos claros (telas públicas, Login, Landing) |
| `logo_eixo_white.svg` | Fundos escuros (sidebar) |
| `logo_eixo_negative.svg` | Monocromático branco |
| `eixo-x-icon.svg` | Favicon e ícone de app |

### Paleta EIXO (Manual de Marca v1.0)

| Nome | Hex | Uso |
|------|-----|-----|
| Grafite Escuro | `#2F2F2F` | Sidebar, avatares, FAB de suporte |
| Grafite Principal | `#5E5E5E` | Texto secundário, ícones inativos |
| Verde EIXO | `#B6E23A` | Acento interativo — botões, tabs ativas, focus rings |
| Cinza Claro | `#EDEDED` | Fundo de página, tabs inativas, bordas |
| Branco | `#FFFFFF` | Fundo de conteúdo, superfícies |

> **Regra de contraste:** `#B6E23A` é uma cor clara — nunca usar texto branco sobre fundo verde. Todo texto sobre verde deve ser `#1a1a1a` ou `#2F2F2F`.

### Tipografia

| Uso | Fonte | Peso |
|-----|-------|------|
| Títulos e subtítulos | Manrope | SemiBold / Bold |
| Textos e interfaces | Inter | Regular / Medium |

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

### Perfis de acesso

| Perfil | Destino |
|--------|---------|
| `VAQUEIRO` | Tela de ocorrências do campo |
| `ADMIN_CAMPO` | Tela de Gerenciamento (pesagem, busca de animais) |

### Gerenciamento V1 — ADMIN_CAMPO

- Busca única de animais (sem distinção Comercial/P.O. para o operador)
- Pesagem manual com funcionamento offline
- Fila local de pesagens com status: `enviado`, `pendente`, `erro`, `conflito`
- Sincronização automática ao reconectar + botão "Sincronizar agora"
- Tratamento de conflito de pesagem (mesmo animal na mesma sessão ou data duplicada no servidor)

### Integração com balanças eletrônicas

Coimma / Tru-Test S3 via Bluetooth — previsto para fase futura.

Protótipo de referência: `app-de-manejo/`

---

## Referência técnica

- Instruções para Claude: `CLAUDE.md`
- Regras de backend e Prisma: `AGENTS.md`
- Plano completo do EIXO Campo: `EIXOCAMPO.md`
