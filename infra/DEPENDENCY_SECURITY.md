# Dependências fixadas por segurança

As versões abaixo são fixadas no `package.json` raiz porque as dependências
diretas ainda declaram faixas vulneráveis ou desatualizadas.

| Pacote | Versão | Motivo | Remover o override quando |
| --- | --- | --- | --- |
| `browserslist` | `4.28.8` | Corrige crescimento de memória e escrita em protótipo durante o build. | Vite, Babel e Autoprefixer resolverem naturalmente para uma versão superior a `4.28.6`. |
| `deepmerge-ts` | `8.0.2` | Corrige exaustão de pilha na configuração do Prisma. | `@prisma/config` depender de `deepmerge-ts` 8 ou superior. |
| `qs` | `6.16.0` | Corrige bypass de limite de arrays e negação de serviço no parser usado pelo Express. | Express e `body-parser` aceitarem `qs` 6.16 ou superior. |
| `uuid` | `11.1.1` | Corrige escrita parcial fora dos limites; o ExcelJS usa apenas `v4()`. | ExcelJS depender de `uuid` 11.1.1 ou superior. |

O SheetJS `0.20.3` está armazenado em `vendor/xlsx-0.20.3.tgz`, com SHA-256
`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`.
Os workspaces usam o arquivo local porque o registro público npm mantém a versão
antiga `0.18.5`. Ao atualizar o tarball, conferir a origem oficial, registrar o
novo hash e repetir os testes de importação e exportação de planilhas.
