# EIXO Campo — Plano de Desenvolvimento

## Sobre o EIXO Campo

App Android voltado para uso em campo e curral, integrado ao sistema web EIXO. Opera com dois perfis de acesso distintos, ativados por código gerado no sistema web.

---

## Perfis de acesso

| Perfil | Destino |
|--------|---------|
| `VAQUEIRO` | Tela de ocorrências do campo |
| `ADMIN_CAMPO` | Tela de Gerenciamento |

- O botão **Vaqueiro** aceita apenas código com perfil `VAQUEIRO`.
- O botão **Gerenciamento** aceita apenas código com perfil `ADMIN_CAMPO`.
- Código de perfil errado é bloqueado com mensagem de erro — sem acesso cruzado.

### Autenticação por código de ativação

Sem login e senha. O gestor gera um código único no sistema web e repassa ao operador. No primeiro uso, o app vincula o código ao aparelho (device ID). A partir daí, o acesso é automático.

**Regras do código:**
- Validade: 48 horas após geração
- Uso único no primeiro acesso
- Vinculado a um único aparelho
- Não transferível entre dispositivos

**Statuses do operador:**

| Status | Descrição |
|--------|-----------|
| `PENDENTE_ATIVACAO` | Código gerado, aguardando primeiro uso |
| `ATIVO` | Código ativado, aparelho vinculado |
| `CODIGO_EXPIRADO` | 48h sem ativação |
| `BLOQUEADO` | Acesso revogado pelo gestor |
| `APARELHO_REVOGADO` | Aparelho desvinculado, novo código necessário |

---

## Gerenciamento — V1

### Escopo da primeira versão

- Busca única de animais
- Pesagem manual pelo celular
- Funcionamento offline com fila local
- Sincronização automática ao voltar internet
- Botão manual "Sincronizar agora"
- Tratamento de conflito de pesagem

### Visão do operador

No curral, o operador não vê separação entre rebanho comercial e P.O. — são apenas animais. A distinção técnica entre tabelas é resolvida internamente pelo sistema, invisível para quem está no campo.

### Campos da pesagem

| Campo | Tipo | Observação |
|-------|------|------------|
| Animal | seleção | buscado pelo brinco/identificação |
| Data | data | padrão: data atual |
| Peso | número | em kg |
| Status | enum | `enviado`, `pendente`, `erro`, `conflito` |

---

## Sessão de pesagem no campo

Pesagens feitas pelo EIXO Campo entram no banco sem vínculo a uma sessão nomeada (`weighingSessionId = null`). O conceito de sessão nomeada é gerenciado pelo desktop. Integração de sessões com o campo fica para fase futura.

---

## Regras de conflito de pesagem

### Caso 1 — Mesmo animal, mesma sessão, pesos diferentes

Quando o operador seleciona um animal que já foi pesado na sessão atual e informa um peso diferente, o app exibe uma tela de atenção com o peso já registrado e três opções:

| Opção | Ação |
|-------|------|
| **Substituir** | Descarta a pesagem anterior, registra o novo peso |
| **Cancelar** | Mantém a pesagem anterior, ignora a nova entrada |
| **Pesar novamente** | Volta para o campo de peso para nova leitura |

### Caso 2 — Mesmo animal, mesma sessão, pesos iguais

Quando o mesmo animal aparece duas vezes na sessão com o mesmo peso — provável entrada duplicada acidental. O app exibe uma tela de atenção mostrando as duas pesagens lado a lado e duas opções:

| Opção | Ação |
|-------|------|
| **Cancelar as duas** | Remove ambas da sessão |
| **Manter uma** | O operador escolhe qual das duas permanece |

### Conflito com o servidor (data duplicada)

Se ao sincronizar já existir uma pesagem no servidor para o mesmo animal na mesma data:
- O app não substitui automaticamente
- O status da pesagem fica como `conflito` na fila
- O operador resolve na próxima abertura do app
- A substituição só ocorre com confirmação explícita do operador

---

## Offline e sincronização

- Sem internet: pesagem salva na fila local do app (`offlineStorage.ts`)
- Com internet: sincronização automática em background
- Botão manual **Sincronizar agora** sempre disponível
- Status de cada pesagem visível ao operador: `enviado`, `pendente`, `erro`, `conflito`

---

## Backend — APIs utilizadas

**Rota oficial de pesagem (contrato fixo):**
```
POST /animals/:id/pesagens
{ "data": "2026-05-01", "peso": 420 }
```

**Contrato que não pode ser quebrado:**
- Caminho da rota
- Campos `data` e `peso` obrigatórios
- Formato da data
- Resposta com `id`, `data`, `peso` e `gmd`
- Validação de permissão por fazenda
- Atualização de `pesoAtual`, `gmd` e `gmd30` do animal
- Bloqueio de pesagem duplicada na mesma data (padrão)

**Evolução sem quebrar o contrato:**
- Campos novos (`source`, `weighingSessionId`) podem ser adicionados como opcionais
- Substituição controlada: aceitar flag explícita de substituição — sem alterar o comportamento padrão

---

## Arquivos envolvidos

| Arquivo | Papel |
|---------|-------|
| `app-de-manejo/src/App.tsx` | Roteamento por perfil |
| `app-de-manejo/src/hooks/useAppAuth.ts` | Validação de perfil no código de ativação |
| `app-de-manejo/src/offlineStorage.ts` | Fila local de pesagens offline |
| `app-de-manejo/src/types.ts` | Tipos compartilhados |
| Novo: tela de Gerenciamento | Componente da interface do ADMIN_CAMPO |
| Novo: adapter de pesagens | Funções de chamada à API de pesagem |
| `server/index.js` | Ajuste nas rotas de pesagem |

---

## Testes da V1

- [ ] Ativar código Vaqueiro e confirmar que abre ocorrências
- [ ] Tentar código Vaqueiro em Gerenciamento e confirmar bloqueio
- [ ] Ativar código ADMIN_CAMPO e confirmar que abre Gerenciamento
- [ ] Buscar animal e confirmar resultado único (sem distinção Comercial/P.O.)
- [ ] Salvar pesagem online e confirmar no histórico do desktop
- [ ] Salvar pesagem offline e confirmar status `pendente`
- [ ] Voltar internet e confirmar sincronização automática
- [ ] Pesar mesmo animal duas vezes com pesos diferentes — confirmar Caso 1
- [ ] Pesar mesmo animal duas vezes com mesmo peso — confirmar Caso 2
- [ ] Criar conflito de data duplicada com servidor — confirmar status `conflito`
- [ ] Confirmar que perfil Vaqueiro continua enviando ocorrências normalmente

---

## Fora do escopo da V1

- Integração com balança eletrônica ou bastão eletrônico (fase futura)
- Sessões de pesagem nomeadas vindas do campo (fase futura)
- Relatórios por sessão no app (fase futura)

---

## Referência técnica

- Instruções gerais para Claude: `CLAUDE.md`
- Regras de backend e Prisma: `AGENTS.md`
- Plano de sessões de pesagem no desktop: `CLAUDE.md` → seção Próximos passos
