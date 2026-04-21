# EIXO V2 — Instruções para Claude

## Sobre o projeto

**EIXO** é um ecossistema de gestão para pecuária de corte.
O **EIXO Sistema de Gestão** é o produto principal: plataforma web + app Android, multi-tenant, com modelo de assinatura mensal (Asaas). Estrutura de planos: 1 gratuito (aquisição de clientes) + 2 pagos (upgrades com módulos avançados).
Eixo nasceu com propósito de descomplicar a gestão na pecuária. Facilitar a vida do empresário=pecuarista. 

Stack: React + TypeScript + Vite + Tailwind (frontend) | Node.js + Express + Prisma + PostgreSQL (backend).

---

## Fluxo de trabalho

- **Claude** comanda o projeto: analisa arquivos, toma decisões, monta prompts e faz edições pontuais simples diretamente.
- **Codex** escreve e executa o código: recebe prompts precisos e reporta o resultado.
- **Antes de qualquer prompt para o Codex**, sempre ler os arquivos envolvidos para entender o estado real. Nunca criar prompts baseados em suposição.
- Alterações simples (troca de classe, texto, configuração) Claude faz diretamente. Alterações de lógica, novos componentes ou migrações vão para o Codex.

---

## Paleta visual obrigatória (stone/amber)

Nunca usar classes `gray-` ou `dark:` no lugar dessa paleta.

| Elemento | Valor |
|----------|-------|
| Fundo principal | `#ede3d0` |
| Fundo card | `#fffaf1` |
| Borda padrão | `border-[#d7cab3]` |
| Título principal | `text-[#2f3a2d]` |
| Texto secundário | `text-[#6d6558]` |
| Botão primário | `bg-[#9d7d4d]` hover `bg-[#8f7144]` |
| Botão excluir | `bg-[#fbede8]` texto `text-[#8c4d39]` |
| Header tabela | `bg-[#f1e7d8]` texto `text-[#74644e]` |
| Tab ativa | `bg-[#9d7d4d] text-white` |
| Tab inativa | `bg-[#f1e7d8] text-[#6d6558]` hover `bg-[#e8ddd0]` |
| Sidebar | `bg-[#4c4030]` (sólido, sem transparência) |
| Border radius | `rounded-2xl` ou `rounded-[24px]` |

---

## Validação obrigatória

Após qualquer alteração no frontend:
```
npx tsc -p frontend/tsconfig.json --noEmit
```
Nunca avançar sem TypeScript limpo.

---

## Decisões já tomadas

- Fundo do app autenticado: cor sólida `#ede3d0` (sem foto de fundo — foto só em Login, Register e PublicLanding)
- Sidebar: fundo sólido `bg-[#4c4030]`, transparência removida
- `window.confirm` e `window.alert` proibidos — sempre usar modal visual
- HerdModule — aba "Relatórios" removida: relatórios aparecem contextualmente dentro de cada aba por módulo
- HerdModule — aba "Configurações" mantida: será desenvolvida (peso alvo de abate, raças, intervalo de pesagem)
- HerdModule — paginação da tabela de Animais: 30 por página
- HerdModule — abas na ordem: Visão do Rebanho → Animais → Lotes/Grupos → Pesagens → Configurações
- Busca e filtros da aba Animais posicionados abaixo das abas (não acima)

---

## Estado atual dos módulos

| Módulo | Status |
|--------|--------|
| Visão Geral (dashboard) | Ativo |
| Estrutura da Fazenda | Ativo — fazendas e pastos |
| Manejo do Rebanho | Em desenvolvimento |
| Nutrição | Ativo — revisar paleta visual |
| Confinamento e Contratos | Placeholder |
| Reprodução / Eixo Acasalamento | Placeholder parcial |
| Estoque e Equipamentos | Placeholder |
| Financeiro | Placeholder — construir do zero |
| Gestão Comercial | Placeholder |
| Registro de Atividades | Placeholder |

---

## Estrutura de planos

**Princípio:** animais nunca são limitados — são o coração do produto. Limitar animal pune quem mais tem a ganhar. O limitador correto são fazendas, módulos, usuários e campos avançados.

### Plano Grátis — "Entre e sinta o valor"
- Animais: **ilimitado**
- Fazendas: **1**
- Usuários: **1**
- Módulos: Rebanho (básico), Estrutura da Fazenda, Visão Geral, Financeiro básico
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

1. **HerdModule** — concluir importação inteligente de planilha (em andamento)
2. **HerdModule** — Visão do Rebanho com 6 cards (em andamento)
3. **HerdModule** — aba Pesagens, modal de detalhe, aba Configurações
4. **Nutrição** — revisar paleta para stone/amber
5. **Financeiro** — construir do zero
6. **Relatórios** — aparecem contextualmente dentro de cada módulo
7. **Planos e billing** — integração com Asaas para mensalidade
8. **App Android** — planejamento futuro para manejo em campo
9. **Integração com balanças eletrônicas** — MVP: Bluetooth SPP (Coimma) + BLE (Tru-Test S3)

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
