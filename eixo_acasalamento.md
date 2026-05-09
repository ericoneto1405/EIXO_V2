# Eixo Acasalamento — Fonte Oficial do Módulo

## 1. Visão do Produto

O **Eixo Acasalamento** é o módulo premium da EIXO para acasalamento dirigido na pecuária de corte.

Ele funciona como um **zootecnista virtual sênior**: cruza os dados do plantel da fazenda com uma base técnica de touros comerciais das principais centrais de sêmen e valida esses touros em fontes oficiais da raça.

O objetivo é reduzir o achismo na compra e uso de sêmen, protegendo o produtor contra marketing fraco, risco de parto, baixa confiabilidade genética e falta de comprovação oficial.

## 2. Regra Central do Módulo

O módulo só recomenda um touro quando três condições são atendidas:

1. O touro tem disponibilidade comercial em central de sêmen **ou** existe estoque no botijão da fazenda.
2. O touro possui identificação oficial confiável, principalmente **série/RGN**.
3. A associação ou programa oficial confirma prova genética específica para o objetivo escolhido.

Se uma dessas condições falhar, o touro pode aparecer como bloqueado, mas **não entra no ranking de recomendação**.

## 3. Princípio de Verdade

A central vende.

A associação valida.

A EIXO recomenda somente quando a validação oficial sustenta a promessa comercial.

Para o MVP Nelore, a fonte oficial inicial é **ABCZ/PMGZ**.

A associação da raça deve ser tratada como fonte oficial, não como dado secundário.

Na Fase 3, a primeira validação oficial segura é a confirmação de identidade do animal na consulta pública da ABCZ por **série + RGN**.

Essa validação confirma que o touro comercial existe oficialmente na associação, mas **não libera recomendação por característica** enquanto o sistema não extrair DEP, DECA, acurácia e prova específica do PMGZ.

## 4. Raça Inicial

A primeira raça do módulo é **Nelore**.

Motivos:

- Maior relevância comercial no corte brasileiro.
- Forte presença nas principais centrais de sêmen.
- Existência de dados oficiais via ABCZ/PMGZ.
- Escopo mais controlado para validar o motor antes de expandir.

## 5. Centrais Comerciais Iniciais

A base comercial deve começar pelas principais centrais com presença relevante em corte/Nelore:

- Alta Genetics.
- ABS Pecplan.
- CRV Lagoa.
- Semex.
- Genex.
- Select Sires.
- Renascer Biotecnologia.

A `Tairana` fica como candidata futura, especialmente pela relação com coleta, produção e presença no mercado.

Referências comerciais usadas na Fase 2:

- CRV Corte Zebu: `https://touros.crvbrasil.com.br/segment/corte-zebu`.
- CRV Corte Europeu: `https://touros.crvbrasil.com.br/segment/corte-europeu`.
- CRV API pública do catálogo: `https://api-main-e6pbdwdwoa-rj.a.run.app/bull/find`.
- Semex Corte Taurino: `https://semex.com.br/lista-corte/Taurino`.
- Semex Corte Zebu: `https://semex.com.br/lista-corte-zebu/Zebu`.
- Alta Genetics busca pública de touros: `https://touros.altagenetics.com.br/Busca/GetCurrentList/{termo}`.
- Genex produtos: `https://produtos.genexbrasil.com.br/search`.

Nota operacional:

A Renascer pode ser pausada na sincronização automática porque exige leitura de muitas páginas individuais. Ela deve ser reativada quando a prioridade for profundidade da central, não velocidade da carga geral.

## 6. Chave Técnica: Série/RGN

A série e o RGN são a chave mais importante para cruzar o touro da central com a associação.

O sistema deve normalizar essa chave antes de salvar ou comparar.

Exemplos equivalentes:

```text
REM 9350
REM9350
REM-9350
REM.9350
```

Todos devem virar a mesma chave normalizada.

Regra:

```text
remover espaços, pontos, hífens e caracteres inconsistentes
converter para maiúsculas
usar raça + chave oficial normalizada para evitar duplicidade lógica
```

O sistema não deve recomendar touro por aproximação de nome.

Se faltar série/RGN, o touro fica pendente ou bloqueado.

## 7. Fluxo do Produtor

A experiência do produtor deve ser simples, em 3 etapas.

### Etapa 1 — Plantel

O produtor informa a entrada da análise:

- lote da fazenda;
- grupo de matrizes;
- matriz individual;
- planilha externa.

Nesta etapa, o módulo não deve repetir o Manejo de Rebanho. O plantel aqui é apenas a entrada técnica da consultoria de acasalamento.

### Etapa 2 — Objetivo Econômico

O produtor escolhe o objetivo principal:

- vender bezerro pesado na desmama;
- boi gordo para frigorífico;
- fêmeas de reposição;
- precocidade sexual;
- parto seguro para novilhas.

O sistema não procura o melhor touro geral. Ele procura o melhor touro para o dinheiro que a fazenda quer ganhar.

### Etapa 3 — Resultado

O sistema entrega:

- Top touros aprovados;
- motivo técnico da recomendação;
- DEPs, DECA e acurácias usadas;
- quantidade de filhos/progênie como evidência visual;
- origem da disponibilidade do sêmen;
- dose estimada para IATF;
- bloqueios técnicos explicados;
- auditoria das fontes usadas.

## 8. Prateleira e Máquina da Verdade

A prateleira de touros e a máquina da verdade não devem parecer passos manuais para o produtor.

Elas são partes internas da auditoria do resultado.

### Prateleira de Touros

Mostra os touros comerciais encontrados nas centrais e/ou no botijão da fazenda.

Deve informar:

- central de origem;
- disponibilidade de sêmen;
- série/RGN;
- raça;
- status da coleta;
- pendências.

### Máquina da Verdade

Valida se a promessa comercial do touro aparece na prova oficial.

Exemplo:

Se o objetivo é precocidade, o touro precisa ter prova oficial ligada a precocidade.

Prova geral não basta para recomendação específica.

## 9. Disponibilidade de Sêmen

A regra de disponibilidade é:

```text
entra na análise se tiver sêmen em central comercial
OU
se existir estoque no botijão da fazenda
```

O produtor pode escolher:

- usar todos os touros disponíveis no mercado e no botijão;
- restringir a recomendação apenas ao que já existe no botijão.

A origem deve aparecer no resultado:

- Central comercial.
- Botijão da fazenda.
- Central + botijão.

Se não houver sêmen na central nem estoque local, o touro não pode ser recomendado.

## 10. Regra de Prova Oficial por Objetivo

Cada objetivo exige prova específica.

### Desmama

Exige prova ligada a peso/desempenho até a desmama.

Exemplos:

- DEP de desmama;
- índice diretamente ligado à desmama;
- acurácia confiável para essa característica.

### Carcaça

Exige prova ligada a carcaça.

Exemplos:

- AOL;
- acabamento;
- características equivalentes reconhecidas no programa oficial.

### Reposição

Exige prova ligada a habilidade materna, fertilidade ou características maternais.

### Precocidade

Exige prova oficial específica ou índice diretamente ligado à precocidade.

Não basta o catálogo dizer que o touro é precoce.

### Parto Seguro

Exige prova de baixo peso ao nascer ou característica equivalente.

Para novilhas ou fêmeas leves, a trava de segurança deve ser rígida.

## 11. Score e Confiança

A acurácia é o principal peso matemático de confiança.

A quantidade de filhos/progênie deve aparecer na tela para gerar confiança visual, mas não deve multiplicar diretamente o ranking.

Motivo:

- filhos ajudam a explicar confiabilidade;
- a acurácia já representa a segurança estatística;
- usar filhos diretamente favoreceria touros antigos e poderia distorcer o ranking.

## 12. Bloqueios Técnicos

Bloquear um touro é parte do valor do produto.

O produtor precisa entender por que o sistema não recomendou.

Categorias principais:

- sem disponibilidade comercial ou no botijão;
- sem estoque suficiente no botijão;
- sem série/RGN;
- não encontrado na ABCZ/PMGZ;
- sem prova oficial da característica;
- baixa acurácia;
- risco de parto;
- falha de coleta;
- dado inconsistente entre central e associação.

Exemplo de mensagem:

```text
Touro encontrado na central, mas sem comprovação oficial de precocidade na ABCZ/PMGZ. Não recomendado.
```

## 13. Scrapers e Coleta de Dados

Os scrapers não são uma ação comum do produtor.

Eles devem rodar como rotina técnica/admin, em segundo plano.

A tela do produtor deve mostrar apenas:

- última sincronização;
- status da base;
- pendências relevantes.

Não deve existir botão público para atualizar centrais e auditoria.

Comportamento obrigatório dos coletores:

- se a central falhar, registrar pendência;
- se a associação falhar, registrar pendência;
- não inventar dado;
- não completar informação genética por aproximação;
- não recomendar touro sem prova oficial obrigatória.

## 14. Estados Vazios

Estados vazios devem ser claros e comerciais.

Mensagens esperadas:

```text
Base ainda não sincronizada.
Nenhum touro com série/RGN.
Nenhum touro passou na ABCZ/PMGZ.
Este lote não possui fêmeas aptas.
```

Essas mensagens devem passar segurança, não parecer erro do sistema.

## 15. Backend e Segurança

As rotas do módulo devem seguir os padrões do EIXO:

- autenticação obrigatória;
- validação de acesso ao plano premium;
- isolamento por fazenda/organização;
- uso de filtros de escopo da fazenda;
- sem vazamento de dados entre organizações.

Rotas principais do módulo:

```text
GET  /genetics/acasalamento/sources/status
POST /genetics/acasalamento/admin/sources/sync
POST /genetics/acasalamento/admin/bulls/import
GET  /genetics/acasalamento/bulls
GET  /genetics/acasalamento/bulls/:id
POST /genetics/acasalamento/recommendations
GET  /genetics/acasalamento/sessions
GET  /genetics/acasalamento/sessions/:id
GET  /genetics/acasalamento/collection-issues
```

## 16. Frontend

A tela principal fica em:

```text
/genetics/acasalamento
```

O menu lateral deve mostrar apenas:

```text
Eixo Acasalamento
```

Não deve haver submódulos antigos como:

- Plantel;
- Seleção;
- Relatórios.

Essas ideias foram substituídas pelo fluxo único da consultoria.

## 17. O Que Não Fazer

O módulo não deve:

- repetir o Manejo de Rebanho;
- recomendar touro por nome parecido;
- tratar catálogo como verdade final;
- usar mock como prova oficial;
- permitir botão público de scraper;
- esconder bloqueios técnicos;
- favorecer touro apenas por ter muitos filhos;
- recomendar touro sem sêmen disponível ou estoque local;
- recomendar touro sem prova oficial específica.

## 18. Fases de Fechamento

As fases abaixo são a referência oficial para transformar o Eixo Acasalamento de MVP visual em módulo funcional, vendável e confiável.

### Fase 1 — MVP Usável

Objetivo: o produtor consegue abrir o módulo, escolher a entrada do plantel, escolher o objetivo econômico e entender o resultado ou o estado vazio.

Entregas esperadas:

- tela única do Eixo Acasalamento;
- fluxo em 3 etapas;
- menu lateral sem submódulos antigos;
- linguagem clara para produtor;
- estados vazios profissionais;
- sem botão público de sincronização;
- sem repetição do Manejo de Rebanho.

Critério de fechamento:

O produtor entende o que o módulo faz mesmo quando a base ainda está vazia.

### Fase 2 — Base Comercial de Touros

Objetivo: montar a prateleira real de touros comerciais das principais centrais.

Entregas esperadas:

- importar touros das principais centrais;
- salvar central de origem;
- capturar nome, raça, registro, série e RGN quando existirem;
- normalizar série/RGN;
- evitar touro duplicado;
- marcar pendência quando faltar chave oficial;
- mostrar contadores reais na tela.

Critério de fechamento:

A EIXO tem uma base comercial consultável e sabe separar touro pronto de touro pendente.

Rota administrativa da fase:

```text
POST /genetics/acasalamento/admin/bulls/import
```

Uso esperado:

- importar lista controlada de touros comerciais em JSON;
- aceitar `sourceCode` ou `central`;
- normalizar série/RGN;
- evitar duplicidade por raça + chave oficial;
- registrar pendência quando faltar série/RGN;
- não criar prova oficial artificial.

### Fase 3 — Validação Oficial ABCZ/PMGZ

Objetivo: confirmar se o touro comercial existe na fonte oficial e possui prova genética específica.

Entregas esperadas:

- cruzar série/RGN com ABCZ/PMGZ;
- salvar DEPs, DECA, acurácias e filhos/progênie;
- separar prova por objetivo econômico;
- bloquear touro sem prova específica;
- registrar pendência quando a associação não confirmar;
- exibir filhos/progênie como evidência visual.

Critério de fechamento:

A máquina da verdade consegue aprovar ou bloquear touros com motivo claro.

### Fase 4 — Motor de Recomendação

Objetivo: transformar base comercial e prova oficial em ranking técnico.

Entregas esperadas:

- aplicar objetivo econômico escolhido;
- usar acurácia como peso principal de confiança;
- aplicar trava de parto para novilhas ou fêmeas leves;
- bloquear baixa confiança quando necessário;
- ranquear Top touros;
- explicar por que cada touro venceu;
- explicar por que cada touro foi bloqueado.

Critério de fechamento:

O sistema deixa de listar dados e passa a entregar recomendação técnica defensável.

### Fase 5 — Botijão da Fazenda

Objetivo: considerar o estoque real de sêmen da fazenda na recomendação.

Entregas esperadas:

- ler lotes de sêmen em `SemenBatch`;
- considerar touro sem disponibilidade atual na central, mas com doses no botijão;
- permitir análise com mercado + botijão;
- permitir análise restrita ao botijão;
- bloquear estoque insuficiente;
- calcular doses necessárias;
- mostrar origem da disponibilidade.

Critério de fechamento:

O produtor consegue usar a inteligência da EIXO também sobre o sêmen que já comprou.

### Fase 6 — Sessões, Histórico e Consultoria

Objetivo: transformar cada análise em uma consultoria salva e reutilizável.

Entregas esperadas:

- salvar cada análise;
- reabrir análise antiga;
- mostrar recomendações anteriores;
- preservar os dados usados na decisão;
- gerar resumo técnico;
- preparar base para relatório exportável futuramente.

Critério de fechamento:

O módulo deixa de ser uma consulta pontual e vira histórico técnico da fazenda.

### Fase 7 — Scrapers Inteligentes e Rotina Admin

Objetivo: manter a base de touros viva sem expor complexidade ao produtor.

Entregas esperadas:

- jobs de sincronização em segundo plano;
- tela ou rota admin para disparar sincronização;
- status por fonte;
- pendências por central;
- pendências por ABCZ/PMGZ;
- log de coleta;
- comportamento seguro quando uma fonte falhar;
- nenhum botão público de scraper para o produtor.

Critério de fechamento:

A base pode ser atualizada com controle técnico e sem travar o navegador do produtor.

### Fase 8 — Produto Premium e Comercialização

Objetivo: fechar o módulo como produto pago e preparar venda híbrida futura.

Entregas esperadas:

- bloqueio por plano;
- tela clara de upgrade;
- copy comercial alinhada ao valor do módulo;
- diferenciação entre mensalidade dentro do sistema e venda externa futura;
- motor separado do React;
- base para API, consultoria avulsa ou produto independente.

Critério de fechamento:

O Eixo Acasalamento está pronto para ser vendido como módulo premium e, no futuro, como inteligência separada do sistema principal.

## 19. Definição de Sucesso

O módulo está funcionando quando o produtor consegue:

1. Escolher um lote, grupo, matriz ou planilha.
2. Escolher um objetivo econômico.
3. Receber touros recomendados com explicação técnica.
4. Ver por que outros touros foram bloqueados.
5. Saber se a recomendação veio da central, do botijão ou dos dois.
6. Confiar que a associação oficial validou a recomendação.

A promessa do módulo é simples:

```text
A EIXO não mostra o touro mais bonito do catálogo.
A EIXO mostra o touro que passa na prova, está disponível e faz sentido econômico para aquela fazenda.
```
