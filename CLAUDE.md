# EIXO V2 — Instruções para Claude

## Sobre o projeto
IMPORTATE:Nunca adicione, altere, exclua, nem diretamente ou diretamente, sem o meu consentimento!
Mantenha o máximo do seu raciocinio e criatividade, mas eu preciso estar ciente!

**EIXO** é um ecossistema de gestão para pecuária de corte.
O **EIXO Sistema de Gestão** é o produto principal: plataforma web + app Android, multi-tenant, com modelo de assinatura mensal (Asaas). Estrutura de planos: 1 gratuito (aquisição de clientes) + 2 pagos (upgrades com módulos avançados).
Eixo nasceu com propósito de descomplicar a gestão na pecuária. Facilitar a vida do empresário=pecuarista. 

Stack: React + TypeScript + Vite + Tailwind (frontend) | Node.js + Express + Prisma + PostgreSQL (backend).

---

## Fluxo de trabalho

- **Claude** comanda o projeto: analisa arquivos, toma decisões, monta prompts e faz edições pontuais simples diretamente, apenas com permissão explicita do usuário.
- **Codex** escreve e executa o código: recebe prompts precisos e reporta o resultado.
- **Antes de qualquer prompt para o Codex**, sempre ler os arquivos envolvidos para entender o estado real. Nunca criar prompts baseados em suposição.
- Alterações simples (troca de classe, texto, configuração) Claude faz diretamente. Alterações de lógica, novos componentes ou migrações vão para o Codex.

---

## Paleta visual obrigatória

Nunca usar classes `gray-` ou `dark:`. Tema único — sem modo escuro/claro/sistema.

| Elemento | Valor |
|----------|-------|
| Sidebar fundo | `bg-[#1c1917]` |
| Sidebar hover/ativo | `bg-[#292524]` (estrutural) ou `bg-[#a8442a]` (acento ativo) |
| Conteúdo fundo | `bg-white` |
| Página fundo | `bg-[#f5f5f4]` |
| Borda padrão | `border-[#e7e5e4]` |
| Título principal | `text-[#1c1917]` |
| Texto secundário | `text-[#78716c]` |
| Texto mudo | `text-[#a8a29e]` |
| Botão primário | `bg-[#a8442a]` hover `bg-[#933a22]` texto `text-white` |
| Botão excluir | `bg-[#fbede8]` texto `text-[#8c4d39]` |
| Focus ring inputs | `focus:ring-[#a8442a]` |
| Tab ativa | `bg-[#a8442a] text-white` |
| Tab inativa | `bg-[#f5f5f4] text-[#78716c]` hover `bg-[#ece9e6]` |
| Badge acento | `bg-[#faeee8]` texto `text-[#7a2a14]` dot `bg-[#a8442a]` |
| Border radius | `rounded-2xl` ou `rounded-[24px]` |

**Regra de ouro:** `#1c1917` é estrutural (sidebar, avatares, FAB de suporte). `#a8442a` é acento interativo (botões primários, tabs ativas, checkboxes, focus rings, links de destaque).

---

## Validação obrigatória

Após qualquer alteração no frontend:
```
npx tsc -p frontend/tsconfig.json --noEmit
```
Nunca avançar sem TypeScript limpo.

---

## Decisões já tomadas

- Fundo do app autenticado: `bg-white` no conteúdo, `bg-[#f5f5f4]` na página (sem foto — foto só em Login, Register e PublicLanding)
- Sidebar: fundo sólido `bg-[#1c1917]`, sem transparência
- Modo escuro/claro/sistema: **não existe** — tema único light
- `window.confirm` e `window.alert` proibidos — sempre usar modal visual
- HerdModule — aba "Relatórios" removida: relatórios aparecem contextualmente dentro de cada aba por módulo
- HerdModule — aba "Configurações" mantida: será desenvolvida (peso alvo de abate, raças, intervalo de pesagem)
- HerdModule — paginação da tabela de Animais: 30 por página
- HerdModule — abas na ordem: Visão do Rebanho → Animais → Lotes/Grupos → Pesagens → Configurações
- Busca e filtros da aba Animais posicionados abaixo das abas (não acima)

### Importação de rebanho
- O produtor importa **qualquer planilha que já usa** — não precisa de modelo específico
- O sistema exibe mapeamento de colunas: o usuário liga cada coluna da sua planilha ao campo correspondente do EIXO
- Existe um arquivo modelo para download (`modelo_rebanho_comercial.xlsx` e `modelo_rebanho_po.xlsx`) — apenas como conveniência para quem não tem planilha própria
- Limite: 2 MB por arquivo, colunas e linhas máximas definidas no código
- Plano Pago 2 terá mapeamento por IA (futuro)

### Logomarca
- Marca guarda-chuva: **eixo** — cobre todo o ecossistema de produtos
- Logo: wordmark "eixo" em typeface geométrica bold com ponto flutuante acima do "i"
- Arquivos: `frontend/public/logo_eixo_black.svg` (para fundos claros) e `frontend/public/logo_eixo_white.svg` (para fundos escuros)
- No sidebar: `<img src="/logo_eixo_white.svg" />`
- Nas telas públicas (Login, Register, Landing): `<img src="/logo_eixo_black.svg" />`

### Eixo Suporte (chat de suporte)
- Componente: `frontend/components/AssistantChat.tsx`
- Modelo: Gemini 2.5 Flash via `/api/chat/send-message`
- Prompt de sistema: `EIXO_SUPORTE_SYSTEM_PROMPT` em `server/index.js`
- Renderizador de markdown: processa `**negrito**`, `- lista` e `• lista`. **Não processa `* lista` (asterisco)** — instruir o modelo a usar traço (`-`) para listas
- FAB de acesso: botão "eixo suporte" no canto inferior direito do app autenticado (fundo `#1c1917`, mantém cor escura mesmo após acento terra cotta)

---

## Estado atual dos módulos

| Módulo | Status |
|--------|--------|
| Visão Geral (dashboard) | Ativo |
| Estrutura da Fazenda | Ativo — fazendas e pastos |
| Manejo do Rebanho | Ativo (importação ✅, animais ✅) — Pesagens e Configurações pendentes |
| Nutrição | Ativo — paleta visual desatualizada (pendente) |
| Confinamento e Contratos | Placeholder |
| Reprodução / Eixo Acasalamento | Placeholder parcial |
| Estoque e Equipamentos | Placeholder |
| Financeiro | Ativo (lançamentos, contas, fluxo, DRE) |
| Gestão Comercial | Placeholder |
| Registro de Atividades | Placeholder |

---

## Estrutura de planos

**Princípio:** animais nunca são limitados — são o coração do produto. Limitar animal pune quem mais tem a ganhar. O limitador correto são fazendas, módulos, usuários e campos avançados.

## Nomes oficiais dos planos

| Plano | Nome |
|-------|------|
| Gratuito | **Plano Grátis** |
| Pago 1 | **Eixo Gestão** |
| Pago 2 | **Eixo Decisão** |

---

### Plano Grátis — "Entre e sinta o valor"
- Animais: **ilimitado**
- Fazendas: **1**
- Usuários: **até 3**
- Módulos: Rebanho (básico), Estrutura da Fazenda, Financeiro básico
- **Visão Geral (Dashboard): bloqueado** — exclusivo de planos pagos
- Importação: campos básicos (brinco, raça, sexo, data nasc, peso, lote, pasto, categoria, obs) + data de entrada + valor de compra
- Exportação de dados: não

### Plano Pago 1 — "Gestão com controle financeiro"
- Animais: **ilimitado**
- Fazendas: **até 3**
- Usuários: **até 5**
- Módulos: tudo do grátis + Financeiro, Nutrição, Pesagens avançadas
- Importação: campos do grátis + data/valor de compra, tatuagem, mãe, pai, SISBOV
- Exportação de dados: sim (Excel/PDF)

### Plano Pago 2 — "Operação profissional / P.O. / Exportação"
- Animais: **ilimitado**
- Fazendas: **ilimitado**
- Usuários: **ilimitado**
- Módulos: tudo + Eixo Acasalamento, Confinamento, Rastreabilidade completa
- Importação: todos os campos + EID, NCF, RGD, RGN, ABCZ + **mapeamento por IA**
- Exportação de dados: sim + relatório de erros auditável
- Integração com balanças eletrônicas: sim

---

## Campos de importação por plano

| Campo | Grátis | Pago 1 | Pago 2 |
|-------|--------|--------|--------|
| Brinco, Raça, Sexo, Nasc, Peso | ✅ | ✅ | ✅ |
| Lote, Pasto, Categoria, Obs | ✅ | ✅ | ✅ |
| Data de entrada, Valor de compra | ✅ | ✅ | ✅ |
| Tatuagem, Mãe, Pai, SISBOV | ❌ | ✅ | ✅ |
| EID, NCF, RGD, RGN, ABCZ | ❌ | ❌ | ✅ |
| Mapeamento por IA | ❌ | ❌ | ✅ |

---

## Próximos passos

1. **Paleta acento terra cotta** — aplicar `#a8442a` em botões primários, tabs ativas, checkboxes, focus rings (Codex)
2. **HerdModule** — aba Pesagens, modal de detalhe, aba Configurações
3. **Nutrição** — revisar paleta visual
4. **Eixo Suporte** — atualizar system prompt (usar `-` para listas, corrigir info sobre importação)
5. **Planos e billing** — integração com Asaas para mensalidade
6. **App Android** — planejamento futuro para manejo em campo
7. **Integração com balanças eletrônicas** — MVP: Bluetooth SPP (Coimma) + BLE (Tru-Test S3)
8. **Integrar app Android

---

## Princípios de arquitetura do produto

### Evento único, impacto duplo
Qualquer evento de rebanho com impacto financeiro deve ser registrado **uma única vez** pelo usuário. O sistema propaga automaticamente para os módulos envolvidos. Nunca exigir que o produtor lance o mesmo evento em dois lugares.

| Evento | Impacto no Rebanho | Impacto no Financeiro |
|--------|-------------------|----------------------|
| Compra de animais | Cria animais, registra custo por cabeça | Lança saída (pagamento) |
| Venda de animais | Baixa animais do rebanho | Lança entrada (recebimento) |
| Morte de animal | Baixa animal do rebanho | Registra perda |
| Nascimento | Cria animal no rebanho | Sem impacto financeiro direto |

Esse princípio se aplica a todos os módulos futuros — Nutrição, Sanidade, Confinamento. Um lançamento, múltiplos efeitos.

---

## Referência técnica

Para regras detalhadas de backend, modelos Prisma, rotas e padrões de código, consultar `AGENTS.md`.
