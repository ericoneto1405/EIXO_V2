# Plano do EIXO Suporte

## Objetivo

Transformar o EIXO Suporte em um atendimento confiável, atualizado e resolutivo, capaz de solucionar sozinho pelo menos 99% das dúvidas elegíveis sobre o uso do sistema.

O atendimento deve ser cordial, positivo e direto. Quando o cliente estiver frustrado ou relatar um problema sério, o tom deve ser acolhedor e respeitoso, sem alegria artificial.

O canal humano continuará disponível para casos que realmente exigem decisão, acesso ou intervenção de uma pessoa. A meta de 1% não poderá ser atingida escondendo o canal humano ou classificando atendimentos de forma artificial.

## Situação atual confirmada

- Existe chat no frontend, API de mensagens, integração com IA, histórico e painel de suporte no HQ.
- As conversas são armazenadas como registros de `ActivityLog`.
- O contexto da IA contém plano, módulos, permissões, fazenda selecionada e links internos.
- Há fallback e alerta pelo Telegram quando a IA falha ou produz resposta considerada fraca.
- A versão mais recente disponível em `origin/main` permite Groq, Gemini ou Vertex.
- A `main` local está 14 commits atrás de `origin/main` e precisa ser atualizada antes da implementação.
- Os arquivos locais de ambiente encontrados têm `GOOGLE_API_KEY`, mas não têm as novas configurações de provedor. A produção ainda precisa ser verificada sem expor os segredos.
- Não existem testes dedicados ao EIXO Suporte.
- O cliente não possui mais o botão de especialista, mas a API e o HQ ainda mantêm o fluxo de atendimento humano.

## Definição da meta de 1%

### Indicador principal

`taxa de atendimento humano = conversas com resposta humana / conversas elegíveis com mensagem do cliente`

Uma conversa conta como humana quando tiver resposta de administrador ou quando depender de ação manual para ser resolvida.

### Conversas elegíveis

Entram na meta:

- dúvidas sobre telas, botões e caminhos;
- dúvidas sobre cadastro e operação;
- explicação de regras existentes;
- orientação sobre plano e permissões;
- diagnóstico de erros conhecidos;
- dúvidas sobre dados que o próprio cliente pode consultar.

Ficam separadas, mas continuam visíveis no indicador bruto:

- suspeita de fraude ou incidente de segurança;
- alteração financeira ou cadastral que exija autorização humana;
- indisponibilidade geral do sistema;
- cobrança contestada;
- solicitação jurídica ou de privacidade;
- defeito ainda não conhecido pelo sistema.

### Proteções contra uma meta enganosa

A meta só será considerada atingida quando, no mesmo período:

- atendimento humano elegível for menor ou igual a 1%;
- taxa de fallback for menor ou igual a 1%;
- respostas corretas na avaliação automatizada forem maiores ou iguais a 98%;
- links internos válidos forem maiores ou iguais a 99%;
- não houver vazamento entre usuários, organizações ou fazendas;
- satisfação média for maior ou igual a 4,5 de 5;
- abandono após resposta ruim não for contado como resolução.

A medição oficial será feita em uma janela móvel de 30 dias, depois de pelo menos 500 conversas elegíveis. Enquanto não houver esse volume, o resultado será tratado como amostra inicial.

## Arquitetura desejada

```text
Mudança no EIXO
  -> catálogo canônico de telas, ações, permissões e regras
  -> validação automática no pull request
  -> base de conhecimento versionada com o commit publicado
  -> EIXO Suporte consulta a versão publicada
  -> resposta com contexto real do cliente
  -> telemetria mede resolução, erro e necessidade humana
  -> dúvidas não resolvidas viram melhoria da base e dos testes
```

O suporte não deve aprender sozinho diretamente das conversas de produção. Uma resposta errada poderia contaminar as próximas respostas. As conversas devem gerar sugestões de melhoria, que serão revisadas e transformadas em conhecimento versionado e testado.

## Fase 1 — Segurança e confiabilidade

### Entregas

1. Atualizar a branch de trabalho a partir de `origin/main` e revisar o diff antes de alterar código.
2. Confirmar o provedor de IA em cada ambiente e configurar fallback explícito entre os provedores permitidos.
3. Validar formato, proprietário, organização e fazenda de toda conversa antes de gravar ou consultar mensagens.
4. Montar o histórico no servidor a partir do banco. O navegador não será a fonte confiável do histórico enviado à IA.
5. Tratar toda falha de persistência. Nenhuma resposta será considerada concluída se a mensagem necessária não tiver sido armazenada.
6. Tornar atômicas as operações do HQ que precisam registrar mais de um evento, como assumir e responder.
7. Reduzir dados pessoais enviados à IA e ao Telegram. E-mail e mensagem completa só devem sair do EIXO quando forem realmente necessários.
8. Definir um estado único para cada conversa: automática, aguardando equipe, assumida, resolvida ou revisão interna.

### Critérios de aceite

- Um usuário não consegue escrever, consultar nem afetar conversa de outro usuário.
- Uma organização não acessa dados de outra organização.
- Fazenda informada fora do escopo não entra no contexto da IA.
- Falha de banco, IA ou alerta gera estado rastreável e mensagem honesta.
- Configuração inválida impede inicialização silenciosamente defeituosa ou aciona um fallback conhecido.
- Testes automatizados cobrem autenticação, escopo, propriedade, rate limit, persistência e fallback.

## Fase 2 — Conhecimento que acompanha o sistema

### Fonte canônica

Criar um catálogo único e legível por máquina contendo:

- módulo e funcionalidade;
- rota ou visão interna;
- ações disponíveis;
- textos reais dos botões importantes;
- plano e permissão necessários;
- pré-requisitos;
- passos curtos de uso;
- erros conhecidos e solução;
- data e commit da última atualização.

O catálogo será a fonte do prompt e das respostas. A lista manual existente dentro de `chatService.js` deixará de ser a única fonte de verdade.

### Atualização automática segura

1. Toda alteração em navegação, rotas, permissões, planos ou fluxos principais exige atualização do tópico correspondente.
2. O CI compara arquivos sensíveis alterados com o catálogo de suporte.
3. O CI valida se os links internos apontam para rotas ou visões existentes.
4. O CI executa perguntas de referência para os fluxos alterados.
5. O deploy é bloqueado quando a mudança quebra link, permissão, resposta esperada ou deixa conhecimento obrigatório desatualizado.
6. O artefato publicado recebe o mesmo commit da aplicação.
7. Após o deploy, um teste confirma que a aplicação e a base de conhecimento usam a mesma versão.

### Critérios de aceite

- Nenhuma rota ou botão inexistente aparece nas respostas aprovadas.
- Uma mudança relevante não chega à produção sem conhecimento e avaliação correspondentes.
- O HQ mostra a versão do conhecimento usada em cada resposta.
- É possível voltar para a última base válida sem reverter todo o sistema.

## Fase 3 — Resolução completa da dúvida

### Capacidades

O suporte seguirá esta ordem:

1. Identificar a intenção do cliente.
2. Ler somente o contexto autorizado: perfil, plano, módulos, fazenda e tela atual.
3. Buscar o procedimento mais específico na base de conhecimento.
4. Responder com passos curtos e link direto para a tela correta.
5. Confirmar se a orientação resolveu.
6. Se não resolveu, fazer uma pergunta objetiva e tentar novamente.
7. Escalar somente quando faltar capacidade, segurança ou informação confiável.

Além de responder perguntas, o suporte deverá diagnosticar situações como:

- módulo bloqueado pelo plano;
- falta de permissão;
- fazenda não selecionada;
- cadastro incompleto;
- fluxo interrompido por pré-requisito;
- erro conhecido com procedimento de correção;
- indisponibilidade do provedor de IA.

Ações que alteram dados não serão executadas automaticamente nesta fase. O suporte poderá abrir a tela correta e preparar a orientação. A execução de ações reversíveis poderá ser planejada depois, com confirmação explícita do cliente e trilha de auditoria.

### Qualidade da resposta

- linguagem simples;
- no máximo uma pergunta por vez;
- passo a passo curto;
- caminho e botão com nomes reais;
- sem inventar funcionalidade;
- sem prometer prazo;
- sem solicitar senha;
- tom cordial e positivo;
- empatia antes da orientação quando houver frustração;
- sugestão comercial somente quando fizer sentido para a necessidade apresentada.

### Confiança

O detector atual baseado em tamanho da resposta e palavras como “não sei” é insuficiente. A resposta deverá ter uma saída estruturada com:

- intenção identificada;
- tópico consultado;
- versão do conhecimento;
- confiança;
- link recomendado;
- motivo de eventual escalada.

Baixa confiança nunca será escondida. Ela acionará nova tentativa controlada, busca de outro tópico ou encaminhamento.

## Fase 4 — Experiência do cliente e operação do HQ

### Cliente

- aumentar o limite de 150 caracteres ou usar campo de texto com múltiplas linhas;
- mostrar erro de carregamento e opção de tentar novamente;
- indicar claramente quando a resposta é automática ou da Equipe EIXO;
- oferecer avaliação simples: resolveu ou não resolveu;
- quando não resolver, coletar um motivo curto;
- manter histórico por fazenda sem misturar conversas;
- reduzir consultas a cada quatro segundos usando pausa, backoff ou atualização por evento;
- permitir atendimento humano sem transformar sua remoção em mecanismo para atingir a meta.

### HQ

- fila separada para aguardando equipe, baixa confiança, erro técnico e revisão;
- filtros por organização, fazenda, assunto, período e motivo;
- paginação real, sem depender apenas dos 500 logs mais recentes;
- visão do contexto autorizado usado pela IA;
- resposta, encerramento e motivo da intervenção;
- painel com taxa humana, fallback, satisfação, repetição e assuntos sem cobertura;
- botão para transformar uma dúvida recorrente em proposta de atualização da base.

### Persistência

No curto prazo, adicionar índices e preencher corretamente o `farmId` de `ActivityLog`.

Antes de crescer o volume, avaliar modelos próprios para conversa e mensagem. Isso evita consultas caras, limites silenciosos e mistura entre auditoria geral e atendimento.

## Fase 5 — Avaliação e melhoria contínua

### Base inicial de avaliação

Criar perguntas de referência cobrindo:

- cadastro, login e recuperação de acesso;
- fazendas e pastos;
- animais, lotes, importação e pesagens;
- financeiro e diferença entre caixa e resultado;
- nutrição;
- reprodução e acasalamento;
- planos, permissões e módulos bloqueados;
- EIXO Campo;
- erros conhecidos;
- perguntas ambíguas;
- tentativas de obter dados de outro cliente;
- pedidos de senha ou ações perigosas.

Cada caso terá intenção, contexto, elementos obrigatórios, elementos proibidos e links aceitos. A base começará com pelo menos 100 casos e crescerá com as dúvidas reais não resolvidas.

### Ciclo semanal

1. Agrupar dúvidas sem solução e respostas mal avaliadas.
2. Identificar falta de conhecimento, problema de produto ou falha da IA.
3. Corrigir o tópico, o fluxo do sistema ou a regra de resposta.
4. Adicionar o caso à avaliação para impedir regressão.
5. Publicar somente após os testes passarem.

## Implantação gradual

1. **Modo de comparação:** nova resposta é avaliada sem aparecer para o cliente.
2. **Piloto:** liberar para uma pequena parte dos usuários internos ou selecionados.
3. **Expansão:** aumentar gradualmente quando segurança, precisão e satisfação estiverem dentro das metas.
4. **Produção completa:** liberar para todos e acompanhar diariamente na primeira semana.
5. **Otimização:** trabalhar os assuntos que mais geram atendimento humano até atingir 1% de forma sustentável.

O avanço entre etapas será interrompido se houver vazamento de dados, aumento de respostas incorretas, links quebrados ou queda relevante de satisfação.

## Arquivos existentes com impacto previsto

- `frontend/App.tsx`
- `frontend/components/AssistantChat.tsx`
- `frontend/components/HQPage.tsx`
- `server/index.js`
- `server/modules/chat/chatService.js`
- `server/modules/hq/hqRoutes.js`
- `server/modules/config/env.js`
- `server/modules/middlewares/rateLimiter.js`
- `server/modules/middlewares/farmScope.js`
- `server/modules/middlewares/requireAuth.js`
- `server/modules/utils/saasContext.js`
- `server/prisma/schema.prisma`
- `server/.env.example`
- `server/.env.production.example`
- `server/package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

Novos arquivos serão necessários para conhecimento, métricas e testes. Os nomes e a localização devem ser definidos somente depois de atualizar a branch e confirmar a estrutura mais recente.

## Ordem recomendada de execução

### Pacote 1 — Fundação

- sincronização da branch;
- configuração dos provedores;
- propriedade e escopo das conversas;
- persistência confiável;
- definição do fluxo humano;
- testes essenciais.

### Pacote 2 — Autoatualização

- catálogo canônico;
- gerador da base versionada;
- verificação de links e permissões;
- trava no CI e teste pós-deploy.

### Pacote 3 — Inteligência e experiência

- busca de conhecimento;
- confiança estruturada;
- diagnóstico contextual;
- confirmação de resolução;
- painel de métricas no HQ;
- implantação gradual até a meta de 1%.

## Definição de conclusão

O projeto estará concluído quando:

- o suporte usar conhecimento da mesma versão publicada do sistema;
- mudanças relevantes forem bloqueadas no CI quando o conhecimento estiver desatualizado;
- segurança de usuário, organização e fazenda estiver coberta por testes;
- respostas tiverem evidência do tópico consultado e confiança rastreável;
- o cliente puder informar se resolveu;
- o HQ medir resolução, fallback, repetição, satisfação e atendimento humano;
- a taxa humana elegível permanecer em até 1% durante 30 dias e pelo menos 500 conversas;
- as metas de precisão, links, satisfação e isolamento de dados também forem atendidas.
