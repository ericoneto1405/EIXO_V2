# Fluxo de Importação — Status Atualizado

## Concluído

1. **`dataPesagem` agora cria pesagem real**
- Após criar o animal, o sistema registra pesagem em `/animals/:id/pesagens` quando há `dataPesagem` + `pesoAtual`.
- Isso corrige o problema de entrada sem histórico e libera cálculo de GMD desde o início.

2. **Prévia da importação em mini-tabela**
- A prévia deixou de mostrar apenas IDs.
- Agora exibe os primeiros animais com campos mapeados (ex.: ID, raça, sexo, peso, categoria).

3. **Aviso de colunas não mapeadas**
- O cabeçalho do modal mostra quantas colunas foram mapeadas e quantas serão ignoradas.
- Isso reduz perda silenciosa de dados.

4. **Ação de reimportar no resultado com erro**
- No final da importação, quando há erro, existe botão **Reimportar arquivo**.
- O usuário não precisa refazer todo o caminho manualmente.

5. **Download das linhas com erro**
- O resultado de erro permite baixar `.xlsx` com as linhas que falharam.
- Facilita correção e reenvio.

---

## Pendente (alta prioridade)

1. **Template com múltiplas pesagens sem processamento completo**
- O template ainda pode conter colunas como `Data Pesagem 1`, `Peso Pesagem 1`, `Data Pesagem 2`.
- Se essas colunas não forem processadas no importador, o usuário entende que importou histórico, mas parte dos dados não entra.

2. **Normalização de categoria na importação**
- Entradas livres (ex.: `boi gordo`, `vaca prenhe`) podem ficar fora do padrão oficial.
- Falta normalizar para categorias válidas do sistema.

3. **Validação prévia de pasto e lote por nome**
- Importar referências que não existem no cadastro pode gerar animais sem vínculo operacional.
- Falta checagem explícita antes da confirmação final.

---

## Pendente (média prioridade)

1. **Barra visual de progresso mais forte**
- Hoje o progresso numérico existe, mas pode evoluir para barra/feedback visual mais claro.

2. **Melhoria semântica da detecção de arroba**
- Trocar tom de alerta por tom informativo positivo (ex.: 💡 ou ✓).

3. **Template com exemplos mais didáticos de categorias**
- Incluir linhas de exemplo que representem melhor o ciclo pecuário (bezerro, novilho, boi, vaca de cria).

4. **Largura/ergonomia do modal para planilhas grandes**
- Melhorar leitura de colunas longas e evitar truncamento excessivo.

---

## Próxima fase sugerida

### Fase A — Integridade de dados (recomendada primeiro)
1. Fechar suporte real para múltiplas pesagens do template (ou remover colunas do template até implementar).
2. Implementar normalização de categoria com mapa controlado.
3. Validar pasto/lote por nome com relatório de inconsistências antes de importar.

### Fase B — Usabilidade operacional
1. Evoluir progresso visual da importação.
2. Refinar linguagem e ícones de apoio no modal.
3. Melhorar modelo de planilha com exemplos mais realistas de campo.

---

## Resumo executivo

O fluxo de importação evoluiu bem e os principais gargalos de confiança foram corrigidos:
- pesagem inicial,
- prévia útil,
- transparência de colunas ignoradas,
- reimportação rápida,
- exportação de erros.

O próximo ganho de qualidade está na **integridade de dados de entrada** (múltiplas pesagens, categoria e vínculos de pasto/lote), que traz impacto direto no dia a dia do produtor.
