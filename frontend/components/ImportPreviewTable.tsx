import React, { useMemo, useState } from 'react';

// =============================================
// PRÉVIA EDITÁVEL DA IMPORTAÇÃO
// Mostra todas as linhas da planilha antes de gravar. As linhas com problema
// aparecem primeiro e podem ser corrigidas aqui mesmo.
//
// Quem decide se a correção ficou boa é o servidor (/herd/import/confirmar).
// Este componente NÃO revalida nada: ao editar, a linha passa para "em revisão"
// e a resposta definitiva vem do servidor. Assim a regra de validação existe
// num lugar só e não diverge entre o back e o front.
// =============================================

export interface PreviewColuna {
    key: string;
    label: string;
    tier: 'required' | 'conditional' | 'recommended' | 'optional';
    type: 'text' | 'list' | 'date' | 'number' | 'destination';
    options: string[] | null;
}

export interface PreviewCatalogos {
    colunas: PreviewColuna[];
    pastos: { id: string; name: string }[];
    lotes: { id: string; name: string }[];
    /** raças puras + composições mestiças, na mesma lista */
    racas?: string[];
    /** raça escolhida na tela para o rebanho todo */
    racaPadrao?: string | null;
}

export interface PreviewLinha {
    line: number;
    identificacao?: string | null;
    motivos: string[];
    /** avisos não bloqueiam a linha — informam algo que o sistema assumiu (ex.: dia da pesagem). */
    avisos?: string[];
    dados: Record<string, unknown>;
    /** marcada localmente quando o usuário edita alguma célula */
    editada?: boolean;
}

interface ImportPreviewTableProps {
    linhas: PreviewLinha[];
    catalogos: PreviewCatalogos;
    onChange: (linhas: PreviewLinha[]) => void;
    disabled?: boolean;
}

type StatusLinha = 'pronto' | 'revisao' | 'erro';

// Liga o texto do erro à coluna que o causou, para destacar a célula certa.
// Os motivos são gerados pelo nosso próprio servidor, então o mapa é estável.
// A ordem importa: o primeiro padrão que casar é o que vale.
const MOTIVO_PARA_COLUNA: { padrao: RegExp; key: string }[] = [
    { padrao: /identifica/i, key: 'identificacao' },
    { padrao: /j[áa] existe/i, key: 'identificacao' },
    { padrao: /sexo/i, key: 'sexo' },
    { padrao: /nascimento|safra/i, key: 'data_nascimento' },
    { padrao: /data da pesagem/i, key: 'data_pesagem' },
    { padrao: /peso/i, key: 'ultimo_peso_kg' },
    { padrao: /previs[ãa]o de parto/i, key: 'previsao_parto' },
    { padrao: /status reprodutivo/i, key: 'status_reprodutivo' },
    { padrao: /pasto de destino/i, key: 'pasto_destino' },
    { padrao: /lote de destino/i, key: 'lote_destino' },
];

function colunasComProblema(motivos: string[]): Set<string> {
    const chaves = new Set<string>();
    motivos.forEach((motivo) => {
        const achado = MOTIVO_PARA_COLUNA.find((item) => item.padrao.test(motivo));
        if (achado) chaves.add(achado.key);
    });
    return chaves;
}

export function statusDaLinha(linha: PreviewLinha): StatusLinha {
    if (linha.motivos.length === 0) return 'pronto';
    return linha.editada ? 'revisao' : 'erro';
}

/** Contagem usada pelo modal para montar o texto do botão de confirmar. */
export function contarLinhas(linhas: PreviewLinha[]) {
    let prontos = 0;
    let revisao = 0;
    let erro = 0;
    linhas.forEach((linha) => {
        const status = statusDaLinha(linha);
        if (status === 'pronto') prontos += 1;
        else if (status === 'revisao') revisao += 1;
        else erro += 1;
    });
    return { prontos, revisao, erro, total: linhas.length };
}

function textoDoValor(valor: unknown): string {
    if (valor === null || valor === undefined) return '';
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    return String(valor);
}

/** Converte o que veio da planilha para o formato do <input type="date">. */
function paraInputDate(valor: unknown): string | null {
    const texto = textoDoValor(valor).trim();
    if (!texto) return '';
    const iso = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
        return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    }
    const br = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (br) {
        let ano = Number(br[3]);
        if (ano < 100) ano += ano < 50 ? 2000 : 1900;
        const mes = br[2].padStart(2, '0');
        const dia = br[1].padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    }
    // Valor que não vira data: devolve null para o campo virar texto livre e o
    // usuário continuar enxergando exatamente o que estava na planilha.
    return null;
}

const ESTILO_STATUS: Record<StatusLinha, { rotulo: string; classe: string; ponto: string }> = {
    pronto: {
        rotulo: 'Pronto',
        classe: 'bg-[var(--eixo-green)]/10 text-[var(--eixo-green-dark)]',
        ponto: 'bg-[var(--eixo-green)]',
    },
    revisao: {
        rotulo: 'Em revisão',
        classe: 'bg-[var(--eixo-warning)]/10 text-[var(--eixo-warning)]',
        ponto: 'bg-[var(--eixo-warning)]',
    },
    erro: {
        rotulo: 'Com erro',
        classe: 'bg-[var(--eixo-danger)]/10 text-[var(--eixo-danger)]',
        ponto: 'bg-[var(--eixo-danger)]',
    },
};

const CLASSE_CELULA =
    'w-full rounded-lg border bg-[var(--eixo-surface)] px-2 py-1.5 text-xs text-[var(--eixo-text)] focus:border-[var(--eixo-green)] focus:outline-none focus:ring-1 focus:ring-[var(--eixo-green)]/20 disabled:cursor-not-allowed disabled:opacity-50';

const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({
    linhas,
    catalogos,
    onChange,
    disabled = false,
}) => {
    const [soComProblema, setSoComProblema] = useState(false);

    const contagem = useMemo(() => contarLinhas(linhas), [linhas]);

    // Mostra as colunas obrigatórias sempre, e as demais só quando alguma linha
    // trouxe valor. Evita uma tabela de 19 colunas quase todas vazias.
    const colunasVisiveis = useMemo(() => {
        return catalogos.colunas.filter((coluna) => {
            if (coluna.tier === 'required' || coluna.tier === 'conditional') return true;
            return linhas.some((linha) => textoDoValor(linha.dados[coluna.key]).trim() !== '');
        });
    }, [catalogos.colunas, linhas]);

    // Linhas com problema primeiro, mantendo a ordem original dentro de cada grupo.
    const linhasOrdenadas = useMemo(() => {
        const comIndice = linhas.map((linha, indice) => ({ linha, indice }));
        comIndice.sort((a, b) => {
            const pesoA = a.linha.motivos.length > 0 ? 0 : 1;
            const pesoB = b.linha.motivos.length > 0 ? 0 : 1;
            if (pesoA !== pesoB) return pesoA - pesoB;
            return a.indice - b.indice;
        });
        if (!soComProblema) return comIndice;
        return comIndice.filter((item) => item.linha.motivos.length > 0);
    }, [linhas, soComProblema]);

    const editarCelula = (indice: number, key: string, valor: string) => {
        const proximas = linhas.map((linha, i) => {
            if (i !== indice) return linha;
            return {
                ...linha,
                editada: true,
                dados: { ...linha.dados, [key]: valor },
                identificacao: key === 'identificacao' ? valor : linha.identificacao,
            };
        });
        onChange(proximas);
    };

    // Numa linha com erro, só a célula apontada como culpada fica editável — as
    // demais já estão corretas e travar evita edição por engano. Se o motivo não
    // bateu com nenhuma coluna conhecida (`problemas` vazio), não trava nada: é
    // melhor deixar a linha toda editável do que prender o cliente sem solução.
    const renderCelula = (
        linha: PreviewLinha,
        indice: number,
        coluna: PreviewColuna,
        travada: boolean,
    ) => {
        const valor = linha.dados[coluna.key];
        const comum = {
            disabled: disabled || travada,
            className: CLASSE_CELULA,
        };

        if (coluna.type === 'list' && coluna.options) {
            return (
                <select
                    {...comum}
                    value={textoDoValor(valor)}
                    onChange={(event) => editarCelula(indice, coluna.key, event.target.value)}
                >
                    <option value="">—</option>
                    {/* Valor que veio da planilha mas não está na lista continua
                        visível, para o usuário ver o que precisa trocar. */}
                    {textoDoValor(valor) && !coluna.options.includes(textoDoValor(valor)) && (
                        <option value={textoDoValor(valor)}>{textoDoValor(valor)}</option>
                    )}
                    {coluna.options.map((opcao) => (
                        <option key={opcao} value={opcao}>{opcao}</option>
                    ))}
                </select>
            );
        }

        if (coluna.type === 'destination') {
            const catalogo = coluna.key === 'pasto_destino' ? catalogos.pastos : catalogos.lotes;
            const nomes = catalogo.map((item) => item.name);
            const atual = textoDoValor(valor);
            return (
                <select
                    {...comum}
                    value={atual}
                    onChange={(event) => editarCelula(indice, coluna.key, event.target.value)}
                >
                    <option value="">Usar o padrão da tela</option>
                    {atual && !nomes.includes(atual) && <option value={atual}>{atual}</option>}
                    {catalogo.map((item) => (
                        <option key={item.id} value={item.name}>{item.name}</option>
                    ))}
                </select>
            );
        }

        if (coluna.type === 'date') {
            const comoData = paraInputDate(valor);
            if (comoData === null) {
                // Não deu para entender como data: mantém texto livre.
                return (
                    <input
                        {...comum}
                        type="text"
                        value={textoDoValor(valor)}
                        placeholder="DD/MM/AAAA"
                        onChange={(event) => editarCelula(indice, coluna.key, event.target.value)}
                    />
                );
            }
            return (
                <input
                    {...comum}
                    type="date"
                    value={comoData}
                    onChange={(event) => editarCelula(indice, coluna.key, event.target.value)}
                />
            );
        }

        return (
            <input
                {...comum}
                type="text"
                inputMode={coluna.type === 'number' ? 'decimal' : undefined}
                value={textoDoValor(valor)}
                onChange={(event) => editarCelula(indice, coluna.key, event.target.value)}
            />
        );
    };

    return (
        <div className="space-y-3">
            {/* Contadores + filtro */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-[var(--eixo-green)]/10 px-3 py-1 text-[var(--eixo-green-dark)]">
                        {contagem.prontos} {contagem.prontos === 1 ? 'pronto' : 'prontos'}
                    </span>
                    {contagem.revisao > 0 && (
                        <span className="rounded-full bg-[var(--eixo-warning)]/10 px-3 py-1 text-[var(--eixo-warning)]">
                            {contagem.revisao} em revisão
                        </span>
                    )}
                    {contagem.erro > 0 && (
                        <span className="rounded-full bg-[var(--eixo-danger)]/10 px-3 py-1 text-[var(--eixo-danger)]">
                            {contagem.erro} com erro
                        </span>
                    )}
                </div>
                {contagem.erro + contagem.revisao > 0 && (
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--eixo-text-muted)]">
                        <input
                            type="checkbox"
                            checked={soComProblema}
                            onChange={(event) => setSoComProblema(event.target.checked)}
                            className="h-4 w-4 cursor-pointer rounded border-[var(--eixo-border)] accent-[#B6E23A]"
                        />
                        Mostrar só as linhas com problema
                    </label>
                )}
            </div>

            {contagem.revisao > 0 && (
                <p className="rounded-xl bg-[var(--eixo-surface-soft)] px-3 py-2 text-xs text-[var(--eixo-text-muted)]">
                    As linhas em revisão só são conferidas ao confirmar. Se algo continuar errado,
                    elas voltam para cá com o motivo atualizado.
                </p>
            )}

            {/* Tabela */}
            <div className="max-h-[55vh] overflow-auto rounded-2xl border border-[var(--eixo-border)]">
                <table className="min-w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10 bg-[var(--eixo-surface-soft)]">
                        <tr className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--eixo-text-muted)]">
                            <th scope="col" className="whitespace-nowrap px-3 py-2.5">Linha</th>
                            <th scope="col" className="whitespace-nowrap px-3 py-2.5">Situação</th>
                            {colunasVisiveis.map((coluna) => (
                                <th key={coluna.key} scope="col" className="whitespace-nowrap px-3 py-2.5">
                                    {coluna.label}
                                    {(coluna.tier === 'required' || coluna.tier === 'conditional') && (
                                        <span className="ml-1 text-[var(--eixo-danger)]">*</span>
                                    )}
                                </th>
                            ))}
                            <th scope="col" className="whitespace-nowrap px-3 py-2.5">O que está errado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {linhasOrdenadas.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={colunasVisiveis.length + 3}
                                    className="px-4 py-10 text-center text-sm text-[var(--eixo-text-muted)]"
                                >
                                    Nenhuma linha para mostrar.
                                </td>
                            </tr>
                        ) : (
                            linhasOrdenadas.map(({ linha, indice }) => {
                                const status = statusDaLinha(linha);
                                const estilo = ESTILO_STATUS[status];
                                const problemas = status === 'erro' ? colunasComProblema(linha.motivos) : new Set<string>();
                                return (
                                    <tr
                                        key={linha.line}
                                        className={`border-t border-[var(--eixo-border)] align-top ${
                                            status === 'erro' ? 'bg-[var(--eixo-danger)]/5' : 'bg-[var(--eixo-surface)]'
                                        }`}
                                    >
                                        <td className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-[var(--eixo-text-muted)]">
                                            {linha.line}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-2">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold ${estilo.classe}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${estilo.ponto}`} />
                                                {estilo.rotulo}
                                            </span>
                                        </td>
                                        {colunasVisiveis.map((coluna) => (
                                            <td
                                                key={coluna.key}
                                                className={`px-2 py-2 ${
                                                    problemas.has(coluna.key)
                                                        ? '[&_input]:border-[var(--eixo-danger)] [&_select]:border-[var(--eixo-danger)]'
                                                        : '[&_input]:border-[var(--eixo-border)] [&_select]:border-[var(--eixo-border)]'
                                                }`}
                                            >
                                                <div className="min-w-[9rem]">
                                                    {renderCelula(
                                                        linha,
                                                        indice,
                                                        coluna,
                                                        status === 'erro' && problemas.size > 0 && !problemas.has(coluna.key),
                                                    )}
                                                </div>
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-xs">
                                            {linha.motivos.length > 0 ? (
                                                <ul className={`min-w-[12rem] space-y-0.5 ${
                                                    status === 'revisao' ? 'text-[var(--eixo-text-muted)] line-through' : 'text-[var(--eixo-danger)]'
                                                }`}>
                                                    {linha.motivos.map((motivo, i) => (
                                                        <li key={i}>{motivo}</li>
                                                    ))}
                                                </ul>
                                            ) : linha.avisos && linha.avisos.length > 0 ? (
                                                <ul className="min-w-[12rem] space-y-0.5 text-[var(--eixo-text-muted)]">
                                                    {linha.avisos.map((aviso, i) => (
                                                        <li key={i}>{aviso}</li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <span className="text-[var(--eixo-text-soft)]">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ImportPreviewTable;
