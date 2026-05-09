# Eixo Acasalamento (EIXO V2)

Este diretório contém um **protótipo local** de interface do módulo de acasalamento.

## Importante

No sistema EIXO V2 em produção/desenvolvimento principal, o módulo oficial de acasalamento é:

- `frontend/components/EixoAcasalamento.tsx`

Ele é carregado pela rota:

- `/genetics/acasalamento` (definida em `frontend/App.tsx`)

E consome a API oficial via adapter:

- `frontend/adapters/acasalamentoApi.ts`

Com backend em:

- `server/acasalamentoModule.js`

## Sobre esta pasta (`frontend/components/eixo-acasalamento`)

Esta pasta funciona como um projeto isolado (Vite/React) para experimentação visual e técnica.

Arquivos deste protótipo incluem:

- `src/App.tsx`
- `src/main.tsx`
- `server.ts`
- `package.json`

## Quando usar esta pasta

Use esta pasta apenas se você quiser:

- testar ideias de interface sem impactar o app principal;
- validar fluxos de forma isolada;
- fazer experimentos locais.

## Quando **não** usar esta pasta

Não use esta pasta como referência única para:

- regras finais de negócio do EIXO;
- integração oficial com frontend principal;
- documentação de deploy do produto principal.

## Referência rápida do fluxo oficial

1. Usuário acessa `/genetics/acasalamento` no app principal.
2. Componente `frontend/components/EixoAcasalamento.tsx` é renderizado.
3. Adapter `frontend/adapters/acasalamentoApi.ts` chama endpoints `/genetics/acasalamento/*`.
4. Rotas são atendidas por `server/acasalamentoModule.js`.

## Observação

Se este protótipo evoluir para virar fonte oficial, este README deve ser atualizado junto com a arquitetura.
