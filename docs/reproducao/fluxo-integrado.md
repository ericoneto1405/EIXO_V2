# Reprodução: fluxo integrado

## Operação

- **Animais:** cadastro único em Manejo do Rebanho → Animais. Liberação para reprodução continua disponível em Rebanho → Prontas para o touro.
- **Estação:** opcional; seleciona participantes por identificação, lote e pasto. Os vínculos usam o animal, não a localização atual. Participante sem cobertura registrada não conta como exposta.
- **Protocolos:** em Ajustes → Cobertura / IATF. Cada etapa admite vários procedimentos e produtos da Farmácia. Edições valem somente para novas rodadas.
- **Curral:** iniciar rodada, registrar etapas nas fêmeas efetivamente manejadas, ajustar dose por grupo, retirar com motivo ou inseminar. Quem não foi selecionado continua pendente. O consumo previsto e o estoque válido são mostrados; há acesso direto à Farmácia preservando o rascunho. A retirada não é descarte.
- **Inseminação:** uma dose por fêmea, partida comum com exceções individuais. Touros e partidas ficam registrados no evento de cobertura.
- **Monta/repasse:** touros existentes em Animais, fêmeas selecionadas, entrada e saída. Exposição a vários touros não atribui paternidade.
- **Diagnóstico:** vinculado a tentativa existente, incluindo coberturas históricas. Confirmação exige diagnóstico anterior. Resultado final de estação somente após o fim das exposições.
- **Parto:** cadastrar cria viva primeiro em Animais e depois vinculá-la à mãe. Natimorto não exige animal vivo cadastrado. Os endpoints antigos de parto do Campo permanecem no formato original.
- **Desmama:** usa a cria existente. Reutiliza pesagem do mesmo dia quando o peso coincide; divergência bloqueia o lançamento. Grupo de manejo/safra permite comparar as crias.

## Estoque, rascunhos e correção

Execução e baixa são confirmadas juntas, em transação serializável. Faltas de medicamento/sêmen e seleção inválida impedem a confirmação integral. Medicamento vencido não é consumido. A conversão entre unidade de aplicação e estoque vem da Farmácia.

Cada envio tem uma identificação estável. Reenvio do mesmo conteúdo devolve o resultado anterior; reutilização da identificação com outros dados é recusada. As baixas condicionais também protegem contra mudanças concorrentes de saldo.

Rascunhos são locais, separados por usuário e fazenda. Não alteram estoque nem situação oficial, não são enviados automaticamente e podem ser revisados ou descartados. Dados em cache mostram a data da consulta; a confirmação sempre passa pelo servidor.

A reversão de aplicação mantém o original e registra a entrada compensatória na Farmácia. É bloqueada se houver manejos posteriores dependentes. Eventos integrados não podem ser apagados pelas ações legadas da ficha; o cadastro das crias vinculadas não é excluído pelo parto. Correções de diagnóstico são novos registros vinculados à mesma tentativa; não uma nova falha.

## Farol

Disponível no Performance, preservando acesso do Gestão aos manejos. Modelos Comercial e P.O. começam inativos. O responsável revisa e ativa os limites. Para manejo contínuo, desmarcar avaliação por estação.

O farol separa reprodução, produção das crias, avaliação racial/funcional e evolução. Não há nota única. Revisão de permanência prevalece sobre dados insuficientes; verde exige os dados dos critérios ativos. Ausência de registro genealógico não penaliza o Comercial.

Estações vazias contam apenas com exposição e diagnóstico final comprovados. Confirmações da mesma tentativa não multiplicam falhas. Peso à desmama só é comparado entre registros com o mesmo grupo informado. Avaliações manuais registram data, motivo e avaliador. As revisões dos critérios ficam na auditoria.

Manter exige justificativa e nova avaliação após o próximo diagnóstico. Descarte exige motivo e data e registra o usuário responsável, mantendo o cadastro do animal; não lança venda.

## API e persistência

Endpoints adicionais sob os middlewares existentes de organização/fazenda, módulo e plano:

- `GET /farms/:farmId/reproducao/fluxo`: animais, participantes, protocolos, rodadas, Farmácia, Botijão e histórico; avaliações/farol restritos ao Performance.
- `GET /farms/:farmId/reproducao/fluxo/animais/:animalId/historico`: procedimentos, aplicações individuais, retiradas e reversões da matriz.
- `POST /farms/:farmId/reproducao/fluxo/:action`: protocolo, estação, fechamento, rodada, etapa, retirada, inseminação, monta, diagnóstico, parto, desmama, avaliação, regras, manutenção, descarte e reversão. `clientId` obrigatório.

A tabela `ReproWorkflowRecord` guarda versão das regras, auditoria, detalhes de execução e identificações de reenvio. Rodadas utilizam `IatfSession`; o protocolo é copiado em `resumo.protocolSnapshot`. Estações utilizam `BreedingSeason` e participantes `Exposure`. Eventos continuam em `ReproEvent`, com marca de fluxo integrado e vínculo à tentativa.

Rodadas antigas continuam acessíveis no formato original. Não são convertidas em provas de aplicação individual. Estações antigas sem participantes não recebem vínculos inferidos a partir dos lotes atuais.

## Ativação e validação

A migração `20261008120000_repro_integrated_workflow` foi aplicada em 08/10/2026 no banco local de desenvolvimento `eixo_dev`, após backup. Foram conferidos o registro de conclusão, os índices e a chave estrangeira para Fazenda. A migração de Sanidade permaneceu pendente. Em outros ambientes, a aplicação depende do fluxo aprovado; não deve ocorrer automaticamente. Não houve deploy, commit ou publicação nesta tarefa.

Testes de regras e handlers usam persistência simulada para verificar seleção, estoque, rollback, reenvio, sêmen por fêmea, reversão e parto sem duplicar animal. A fixture `/tests/reproWorkflow.html` usa somente dados simulados e intercepta as chamadas; não consulta APIs reais.

Antes de publicação, validar com PostgreSQL e sessão autenticada: migração, concorrência real entre operações, permissões por perfil/plano, jornada completa, saída/retorno a Animais e compatibilidade do EIXO Campo. Esses cenários não são comprovados pela fixture nem pelos testes com persistência simulada.

A base textual do EIXO Suporte foi revisada em 08/10/2026 para o fluxo integrado: cadastro único de animais, protocolos e manejos, estoque, rascunhos com confirmação online, diagnósticos por tentativa, parto vinculado, desmama e farol. A revisão editorial não substitui a validação autenticada nem confirma publicação em produção.
