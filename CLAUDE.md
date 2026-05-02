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

### Cores base (Manual de Marca EIXO)

| Nome | Hex | Uso |
|------|-----|-----|
| Grafite Escuro | `#2F2F2F` | Sidebar, avatares, FAB de suporte |
| Grafite Principal | `#5E5E5E` | Texto secundário, ícones inativos |
| Verde EIXO | `#B6E23A` | Acento interativo principal |
| Cinza Claro | `#EDEDED` | Fundo de página, tabs inativas, hover |
| Branco | `#FFFFFF` | Fundo de conteúdo, superfícies |

### Mapeamento por elemento

| Elemento | Valor |
|----------|-------|
| Sidebar fundo | `bg-[#2F2F2F]` |
| Sidebar hover | `bg-white/8` (branco 8% opacidade) |
| Sidebar item ativo | `bg-[#B6E23A]` texto `text-[#1a1a1a]` |
| Conteúdo fundo | `bg-white` |
| Página fundo | `bg-[#EDEDED]` |
| Borda padrão | `border-[#EDEDED]` |
| Título principal | `text-[#2F2F2F]` |
| Texto secundário | `text-[#5E5E5E]` |
| Texto mudo | `text-[#5E5E5E]/60` |
| Botão primário | `bg-[#B6E23A]` hover `bg-[#a3d130]` texto `text-[#1a1a1a]` |
| Botão excluir | `bg-[#fce8e8]` texto `text-[#8c2020]` |
| Focus ring inputs | `focus:ring-[#B6E23A]` |
| Tab ativa | `bg-[#B6E23A] text-[#1a1a1a]` |
| Tab inativa | `bg-[#EDEDED] text-[#5E5E5E]` hover `bg-[#e0e0e0]` |
| Badge acento | `bg-[#f0f9d4]` texto `text-[#3a5c10]` dot `bg-[#B6E23A]` |
| Border radius | `rounded-2xl` ou `rounded-[24px]` |

### Tipografia

| Uso | Fonte | Peso |
|-----|-------|------|
| Títulos e subtítulos | Manrope | SemiBold / Bold |
| Textos e interfaces | Inter | Regular / Medium |

**Regra de ouro:** `#2F2F2F` é estrutural (sidebar, avatares, FAB de suporte). `#B6E23A` é acento interativo (botões primários, tabs ativas, checkboxes, focus rings, links de destaque).

**Regra crítica de contraste:** o Verde EIXO `#B6E23A` é uma cor clara — **nunca usar texto branco sobre fundo verde**. Todo texto sobre `#B6E23A` deve ser escuro (`#1a1a1a` ou `#2F2F2F`).

---

## Validação obrigatória

Após qualquer alteração no frontend:
```
npx tsc -p frontend/tsconfig.json --noEmit
```
Nunca avançar sem TypeScript limpo.

---

## Decisões já tomadas

- Fundo do app autenticado: `bg-white` no conteúdo, `bg-[#EDEDED]` na página (sem foto — foto só em Login, Register e PublicLanding)
- Sidebar: fundo sólido `bg-[#2F2F2F]`, sem transparência
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
- Marca guarda-chuva: **EIXO** — cobre todo o ecossistema de produtos
- Logo: "EIXO" maiúsculo, tipografia geométrica bold, com o X bicolor (uma diagonal em Grafite `#2F2F2F` ou branco, outra diagonal em Verde EIXO `#B6E23A`)
- Tipografia institucional: **Manrope** | Tipografia de apoio: **Inter**
- Arquivos SVG disponíveis em `frontend/public/`:

| Arquivo | Versão | Uso |
|---------|--------|-----|
| `logo_eixo_official.svg` | Principal colorida (grafite + verde) | Fundos claros |
| `logo_eixo_white.svg` | Para fundos escuros (branco + verde) | Sidebar, fundos escuros |
| `logo_eixo_negative.svg` | Monocromática branca | Fundos escuros sem cor |
| `eixo-x-icon.svg` | Símbolo X isolado | Favicon, ícone de app |

- No sidebar: `<img src="/logo_eixo_white.svg" />`
- Nas telas públicas (Login, Register, Landing): `<img src="/logo_eixo_official.svg" />`
- Todos os SVGs usam `#B6E23A` como verde — já corrigido e padronizado

### Eixo Suporte (chat de suporte)
- Componente: `frontend/components/AssistantChat.tsx`
- Modelo: Gemini 2.5 Flash via `/api/chat/send-message`
- Prompt de sistema: `EIXO_SUPORTE_SYSTEM_PROMPT` em `server/index.js`
- Renderizador de markdown: processa `**negrito**`, `- lista` e `• lista`. **Não processa `* lista` (asterisco)** — instruir o modelo a usar traço (`-`) para listas
- FAB de acesso: botão "eixo suporte" no canto inferior direito do app autenticado (fundo `#2F2F2F`, mantém cor grafite escuro — nunca usa o verde como fundo do FAB)

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

1. **Paleta nova** — atualizar `index.css` e `tailwind.config.cjs` com Verde EIXO `#B6E23A` e Grafite `#2F2F2F` (Codex)
2. **HerdModule** — aba Pesagens com sessões nomeadas, modal de detalhe, aba Configurações
3. **Nutrição** — revisar paleta visual com nova identidade
4. **Eixo Suporte** — atualizar system prompt (usar `-` para listas, corrigir info sobre importação)
5. **Planos e billing** — integração com Asaas para mensalidade
6. **EIXO Campo — Gerenciamento V1** — pesagem manual, offline, conflitos (ver `EIXOCAMPO.md`)
7. **Integração com balanças eletrônicas** — MVP: Bluetooth SPP (Coimma) + BLE (Tru-Test S3)

---

## EIXO Campo

App Android para uso em campo e curral. Perfis: `VAQUEIRO` (ocorrências) e `ADMIN_CAMPO` (gerenciamento e pesagem).

Plano completo, regras de conflito e testes: **`EIXOCAMPO.md`**

### Contrato de API — não quebrar

A rota de pesagem do campo é compartilhada com o desktop:

```
POST /animals/:id/pesagens
{ "data": "YYYY-MM-DD", "peso": 420 }
```

Campos que **nunca podem mudar sem alinhamento com o EIXO Campo**: caminho da rota, `data`, `peso`, formato da data, resposta com `id`/`data`/`peso`/`gmd`, validação por fazenda, atualização de `pesoAtual`/`gmd`/`gmd30`, bloqueio de duplicata na mesma data.

Campos novos opcionais (ex: `weighingSessionId`) podem ser adicionados sem quebrar o contrato.

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
