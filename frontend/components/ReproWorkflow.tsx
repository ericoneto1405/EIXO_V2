import { CoberturaAba } from './ReproCobertura';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    fetchWorkflow,
    saveWorkflow,
    WorkflowData,
    WorkflowDraft,
    WorkflowAnimal,
    Step,
    Rules,
    Round,
} from '../adapters/reproWorkflowApi';
import FinanceDialog from './finance/FinanceDialog';

const card = 'rounded-2xl border border-(--eixo-border) bg-(--eixo-surface) p-4 space-y-3';
const input =
    'mt-1 w-full rounded-xl border border-(--eixo-border) bg-(--eixo-surface) px-3 py-2 text-sm text-(--eixo-text)';
const button = 'rounded-xl border border-(--eixo-border) px-3 py-2 text-sm font-semibold disabled:opacity-50';
const primary = `${button} bg-(--eixo-green) text-white`;
const today = () => new Date().toLocaleDateString('en-CA');
const fmt = (v: string) => new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
const names: Record<string, string> = {
    PROTOCOLO: 'Cadastrar protocolo',
    ESTACAO: 'Nova estação',
    RODADA: 'Iniciar IATF',
    ETAPA: 'Registrar manejo',
    RETIRAR: 'Retirar do protocolo',
    INSEMINAR: 'Registrar inseminação',
    MONTA: 'Registrar monta natural / repasse',
    DIAGNOSTICO: 'Registrar diagnóstico',
    PARTO: 'Vincular parto e crias',
    DESMAMA: 'Registrar desmama',
    AVALIACAO: 'Avaliar matriz',
    REGRAS: 'Critérios do farol',
    MANTER: 'Manter matriz',
    DESCARTE: 'Registrar descarte reprodutivo',
    REVERTER: 'Reverter aplicação',
    ENCERRAR: 'Fechar estação',
};
const trafficColors: Record<string, string> = {
    VERDE: 'text-emerald-700',
    AMARELO: 'text-amber-700',
    VERMELHO: 'text-red-700',
    CINZA: 'text-(--eixo-text-muted)',
    DESCARTE: 'text-(--eixo-text-muted)',
};
function read<T>(key: string, fallback: T): T {
    try {
        return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
    } catch {
        return fallback;
    }
}
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
    return (
        <label className="block text-sm font-semibold">
            {label}
            {children}
        </label>
    );
};
function AnimalPicker({
    animals,
    selected,
    onChange,
    data,
    blocked = false,
}: {
    animals: WorkflowAnimal[];
    selected: string[];
    onChange: (ids: string[]) => void;
    data: WorkflowData;
    blocked?: boolean;
}) {
    const [search, setSearch] = useState(''),
        [lot, setLot] = useState(''),
        [paddock, setPaddock] = useState('');
    const filtered = useMemo(
        () =>
            animals.filter(
                (a) =>
                    (!search || a.brinco.toLowerCase().includes(search.toLowerCase())) &&
                    (!lot || a.lotId === lot) &&
                    (!paddock || a.currentPaddockId === paddock),
            ),
        [animals, search, lot, paddock],
    );
    const available = filtered.filter((a) => !blocked || !a.impedimento);
    return (
        <div className={card}>
            <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Buscar identificação">
                    <input className={input} value={search} onChange={(e) => setSearch(e.target.value)} />
                </Field>
                <Field label="Lote">
                    <select className={input} value={lot} onChange={(e) => setLot(e.target.value)}>
                        <option value="">Todos</option>
                        {data.lots.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.name}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Pasto">
                    <select className={input} value={paddock} onChange={(e) => setPaddock(e.target.value)}>
                        <option value="">Todos</option>
                        {data.paddocks.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <strong>{selected.length} selecionada(s)</strong>
                <button
                    type="button"
                    className={button}
                    onClick={() => onChange([...new Set([...selected, ...available.map((a) => a.id)])])}
                >
                    Selecionar resultados filtrados ({available.length})
                </button>
                <button type="button" className={button} onClick={() => onChange([])}>
                    Limpar seleção
                </button>
            </div>
            <ul className="max-h-72 overflow-y-auto divide-y divide-(--eixo-border)">
                {filtered.map((a) => (
                    <li key={a.id}>
                        <label className="flex items-start gap-3 py-3">
                            <input
                                type="checkbox"
                                className="mt-1"
                                disabled={blocked && Boolean(a.impedimento)}
                                checked={selected.includes(a.id)}
                                onChange={(e) =>
                                    onChange(
                                        e.target.checked ? [...selected, a.id] : selected.filter((id) => id !== a.id),
                                    )
                                }
                            />
                            <span>
                                <b>{a.brinco}</b> · {a.statusReprodutivo || 'Não liberada'}
                                {a.impedimento && <span className="block text-xs text-amber-700">{a.impedimento}</span>}
                            </span>
                        </label>
                    </li>
                ))}
            </ul>
            {!filtered.length && <p>Nenhum animal neste filtro. O cadastro é feito em Manejo do Rebanho → Animais.</p>}
        </div>
    );
}
function ProtocolEditor({
    steps,
    change,
    data,
}: {
    steps: Step[];
    change: (steps: Step[]) => void;
    data: WorkflowData;
}) {
    const update = (i: number, patch: Partial<Step>) => change(steps.map((s, n) => (n === i ? { ...s, ...patch } : s)));
    return (
        <div className="space-y-3">
            <p className="text-sm">Transcreva o protocolo definido pelo veterinário. Os produtos vêm da Farmácia.</p>
            {steps.map((s, i) => (
                <div className={card} key={i}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Dia a partir do D0">
                            <input
                                type="number"
                                min={0}
                                max={120}
                                required
                                className={input}
                                value={s.dia}
                                onChange={(e) => update(i, { dia: Number(e.target.value) })}
                            />
                        </Field>
                        <Field label="Nome da etapa">
                            <input
                                required
                                className={input}
                                value={s.titulo}
                                onChange={(e) => update(i, { titulo: e.target.value })}
                            />
                        </Field>
                    </div>
                    {s.procedimentos.map((p, j) => (
                        <div className="grid gap-3 border-t border-(--eixo-border) pt-3 sm:grid-cols-2" key={j}>
                            <Field label="Procedimento">
                                <input
                                    required
                                    className={input}
                                    value={p.titulo}
                                    placeholder="Ex.: colocação de dispositivo"
                                    onChange={(e) =>
                                        update(i, {
                                            procedimentos: s.procedimentos.map((x, k) =>
                                                k === j
                                                    ? {
                                                          ...x,
                                                          titulo: e.target.value,
                                                      }
                                                    : x,
                                            ),
                                        })
                                    }
                                />
                            </Field>
                            <Field label="Produto da Farmácia">
                                <select
                                    className={input}
                                    value={p.produtoId || ''}
                                    onChange={(e) => {
                                        const product = data.products.find((x) => x.id === e.target.value);
                                        update(i, {
                                            procedimentos: s.procedimentos.map((x, k) =>
                                                k === j
                                                    ? {
                                                          ...x,
                                                          produtoId: product?.id || null,
                                                          unidade: product?.applicationUnit || product?.unit || null,
                                                          dose: null,
                                                      }
                                                    : x,
                                            ),
                                        });
                                    }}
                                >
                                    <option value="">Procedimento sem consumo</option>
                                    {data.products.map((x) => (
                                        <option key={x.id} value={x.id}>
                                            {x.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            {p.produtoId && (
                                <>
                                    <Field label={`Dose por fêmea (${p.unidade})`}>
                                        <input
                                            required
                                            type="number"
                                            min={0.001}
                                            step="any"
                                            className={input}
                                            value={p.dose ?? ''}
                                            onChange={(e) =>
                                                update(i, {
                                                    procedimentos: s.procedimentos.map((x, k) =>
                                                        k === j
                                                            ? {
                                                                  ...x,
                                                                  dose: Number(e.target.value),
                                                              }
                                                            : x,
                                                    ),
                                                })
                                            }
                                        />
                                    </Field>
                                    <p className="self-center text-xs">
                                        Confira a unidade e a conversão cadastradas na Farmácia.
                                    </p>
                                </>
                            )}
                            {s.procedimentos.length > 1 && (
                                <button
                                    type="button"
                                    className={button}
                                    onClick={() =>
                                        update(i, {
                                            procedimentos: s.procedimentos.filter((_, k) => k !== j),
                                        })
                                    }
                                >
                                    Remover procedimento do rascunho
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        type="button"
                        className={button}
                        onClick={() =>
                            update(i, {
                                procedimentos: [
                                    ...s.procedimentos,
                                    {
                                        titulo: '',
                                        produtoId: null,
                                        dose: null,
                                        unidade: null,
                                    },
                                ],
                            })
                        }
                    >
                        Adicionar procedimento / aplicação
                    </button>
                    {steps.length > 1 && (
                        <button
                            type="button"
                            className={button}
                            onClick={() => change(steps.filter((_, n) => n !== i))}
                        >
                            Remover etapa do rascunho
                        </button>
                    )}
                </div>
            ))}
            <button
                type="button"
                className={button}
                onClick={() =>
                    change([
                        ...steps,
                        {
                            id: '',
                            dia: steps.at(-1)!.dia + 1,
                            titulo: '',
                            procedimentos: [
                                {
                                    titulo: '',
                                    produtoId: null,
                                    dose: null,
                                    unidade: null,
                                },
                            ],
                        },
                    ])
                }
            >
                Adicionar etapa
            </button>
        </div>
    );
}
function RulesEditor({ value, change }: { value: Rules; change: (value: Rules) => void }) {
    return (
        <div className={card}>
            <Field label="Objetivo da fazenda">
                <select
                    className={input}
                    value={value.modelo}
                    onChange={(e) =>
                        change({
                            ...value,
                            modelo: e.target.value as Rules['modelo'],
                            racial: e.target.value === 'PO',
                            ativo: false,
                        })
                    }
                >
                    <option value="COMERCIAL">Comercial</option>
                    <option value="PO">P.O.</option>
                </select>
            </Field>
            <p className="text-sm">
                Sugestões do produto, desativadas até sua revisão. Não substituem avaliação veterinária. Falta de
                registro genealógico não reduz a avaliação comercial.
            </p>
            {(['estacoesVazias', 'perdas', 'iepMeses', 'desmamaKg'] as const).map((k) => (
                <Field
                    key={k}
                    label={
                        {
                            estacoesVazias: 'Revisar após quantas estações consecutivas vazia',
                            perdas: 'Revisar após quantas perdas no histórico',
                            iepMeses: 'Intervalo máximo entre partos (meses; opcional)',
                            desmamaKg: 'Peso mínimo à desmama ajustado aos 205 dias (kg; opcional)',
                        }[k]
                    }
                >
                    <input
                        className={input}
                        type="number"
                        min={1}
                        max={k === 'perdas' || k === 'estacoesVazias' ? 20 : 2000}
                        step={k === 'desmamaKg' ? 'any' : 1}
                        value={value[k] ?? ''}
                        onChange={(e) =>
                            change({
                                ...value,
                                [k]: e.target.value ? Number(e.target.value) : null,
                            })
                        }
                        required={k === 'estacoesVazias' || k === 'perdas'}
                    />
                </Field>
            ))}
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={value.usarEstacoes !== false}
                    onChange={(e) => change({ ...value, usarEstacoes: e.target.checked })}
                />
                Avaliar falhas por estação (desmarque para manejo contínuo)
            </label>
            {(['funcional', 'racial'] as const).map((k) => (
                <label className="flex items-center gap-2" key={k}>
                    <input
                        type="checkbox"
                        checked={value[k]}
                        onChange={(e) => change({ ...value, [k]: e.target.checked })}
                    />
                    Exigir avaliação {k}
                </label>
            ))}
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={value.ativo}
                    onChange={(e) => change({ ...value, ativo: e.target.checked })}
                />
                Revisei os critérios e desejo ativar este modelo
            </label>
        </div>
    );
}

function OperationForm({
    draft,
    change,
    data,
    onAnimals,
    onPharmacy,
}: {
    draft: WorkflowDraft;
    change: (body: Record<string, any>) => void;
    data: WorkflowData;
    onAnimals?: () => void;
    onPharmacy?: () => void;
}) {
    const b = draft.body,
        action = draft.action;
    const set = (key: string, value: any) => change({ ...b, [key]: value });
    const females = data.animals.filter((a) => a.sexo === 'FEMEA' && a.status === 'VIVO');
    const r = data.rounds.find((s) => s.id === b.sessionId);
    const activeRecords = data.records.filter(
        (x) => !data.records.some((v) => v.kind === 'REVERTER' && v.data.body.recordId === x.id),
    );
    const already = r
        ? activeRecords
              .filter(
                  (x) =>
                      x.sessionId === r.id &&
                      (x.kind === 'INSEMINAR' ||
                          (action === 'ETAPA' && x.kind === 'ETAPA' && x.data.body.stepId === b.stepId)),
              )
              .flatMap((x) => x.data.body.animalIds)
        : [];
    let candidates = females;
    if (r)
        candidates = females.filter(
            (a) => r.vacas.some((v) => v.animalId === a.id && !v.retirada) && !already.includes(a.id),
        );
    if (b.seasonId && ['RODADA', 'MONTA'].includes(action))
        candidates = candidates.filter((a) =>
            data.seasons.find((s) => s.id === b.seasonId)?.exposures.some((e) => e.animalId === a.id),
        );
    if (action === 'DIAGNOSTICO')
        candidates = candidates.filter((a) => a.reproEvents.some((e) => (e.type === 'COBERTURA') === b.tentativaId));
    const group = ['ESTACAO', 'RODADA', 'ETAPA', 'RETIRAR', 'INSEMINAR', 'MONTA', 'DIAGNOSTICO'].includes(action);
    const individual = ['PARTO', 'DESMAMA', 'AVALIACAO', 'MANTER', 'DESCARTE'].includes(action);
    const dated = ['ETAPA', 'INSEMINAR', 'DIAGNOSTICO', 'PARTO', 'DESMAMA', 'AVALIACAO', 'MANTER', 'DESCARTE'].includes(
        action,
    );
    const attempts = [
        ...new Map(
            females.flatMap((a) =>
                a.reproEvents
                    .filter((e) => e.type === 'COBERTURA')
                    .map((e) => [e.payload.tentativaId || e.id, e] as const),
            ),
        ).entries(),
    ];
    return (
        <div className="space-y-4">
            {['ESTACAO', 'PROTOCOLO'].includes(action) && (
                <Field label="Nome">
                    <input
                        className={input}
                        required
                        value={b.nome || ''}
                        onChange={(e) => set('nome', e.target.value)}
                    />
                </Field>
            )}
            {action === 'ESTACAO' && (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Início">
                            <input
                                required
                                type="date"
                                className={input}
                                value={b.inicio || ''}
                                onChange={(e) => set('inicio', e.target.value)}
                            />
                        </Field>
                        <Field label="Fim">
                            <input
                                required
                                type="date"
                                className={input}
                                value={b.fim || ''}
                                onChange={(e) => set('fim', e.target.value)}
                            />
                        </Field>
                    </div>
                    <Field label="Modalidade">
                        <select
                            className={input}
                            value={b.tipo || 'MISTA'}
                            onChange={(e) => set('tipo', e.target.value)}
                        >
                            <option value="MISTA">IATF e monta natural</option>
                            <option value="IATF">IATF</option>
                            <option value="MONTA_NATURAL">Monta natural</option>
                        </select>
                    </Field>
                </>
            )}
            {['RODADA', 'MONTA'].includes(action) && (
                <Field label="Estação de monta (opcional)">
                    <select
                        className={input}
                        value={b.seasonId || ''}
                        onChange={(e) =>
                            change({
                                ...b,
                                seasonId: e.target.value || null,
                                animalIds: [],
                            })
                        }
                    >
                        <option value="">Manejo contínuo, sem estação</option>
                        {data.seasons
                            .filter((s) => !s.notes?.startsWith('[ENCERRADA]'))
                            .map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name} · {fmt(s.startAt)} a {fmt(s.endAt)}
                                </option>
                            ))}
                    </select>
                </Field>
            )}
            {action === 'RODADA' && (
                <>
                    <Field label="Protocolo do veterinário">
                        <select
                            required
                            className={input}
                            value={b.protocolId || ''}
                            onChange={(e) => set('protocolId', e.target.value)}
                        >
                            <option value="">Escolha</option>
                            {data.protocols
                                .filter((p) => p.passos.every((x) => x.procedimentos))
                                .map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.nome}
                                    </option>
                                ))}
                        </select>
                    </Field>
                    <Field label="D0">
                        <input
                            required
                            type="date"
                            className={input}
                            value={b.dia0 || ''}
                            onChange={(e) => set('dia0', e.target.value)}
                        />
                    </Field>
                </>
            )}
            {r && (
                <div className={card}>
                    <b>{r.resumo.protocolSnapshot.nome}</b>
                    <p>
                        D0: {fmt(r.dia0)} · {r.responsavel}
                    </p>
                    {action === 'ETAPA' &&
                        r.resumo.protocolSnapshot.passos
                            .find((p) => p.id === b.stepId)
                            ?.procedimentos.map((p, i) => (
                                <p key={i}>
                                    {p.titulo}
                                    {p.produtoId
                                        ? ` · ${data.products.find((x) => x.id === p.produtoId)?.name || 'Produto'} · ${p.dose} ${p.unidade} por fêmea · total ${(p.dose || 0) * (b.animalIds?.length || 0)} ${p.unidade}`
                                        : ' · sem consumo'}
                                </p>
                            ))}
                </div>
            )}
            {action === 'ETAPA' && b.procedimentos && (
                <div className={card}>
                    <h4 className="font-bold">Aplicação efetiva nas selecionadas</h4>
                    <p className="text-xs">
                        Para doses diferentes, selecione um grupo por lançamento. O previsto no protocolo permanece no
                        histórico.
                    </p>
                    {b.procedimentos.map(
                        (p: Record<string, any>, i: number) =>
                            p.produtoId && (
                                <div key={p.id} className="grid gap-3 sm:grid-cols-2">
                                    <Field label={`Dose efetiva: ${p.titulo} (${p.unidade})`}>
                                        <input
                                            required
                                            className={input}
                                            type="number"
                                            min={0.001}
                                            step="any"
                                            value={p.dose ?? ''}
                                            onChange={(e) =>
                                                set(
                                                    'procedimentos',
                                                    b.procedimentos.map((x: Record<string, any>, j: number) =>
                                                        j === i
                                                            ? {
                                                                  ...x,
                                                                  dose: Number(e.target.value),
                                                              }
                                                            : x,
                                                    ),
                                                )
                                            }
                                        />
                                    </Field>
                                    <p className="self-center text-sm">
                                        Consumo efetivo: {(p.dose || 0) * (b.animalIds?.length || 0)} {p.unidade}
                                    </p>
                                </div>
                            ),
                    )}
                </div>
            )}
            {['ETAPA', 'PROTOCOLO'].includes(action) && (
                <div className={card}>
                    {action === 'ETAPA' &&
                        data.products
                            .filter((product) =>
                                b.procedimentos?.some((p: Record<string, any>) => p.produtoId === product.id),
                            )
                            .map((product) => {
                                const procedures = b.procedimentos.filter(
                                    (p: Record<string, any>) => p.produtoId === product.id,
                                );
                                const available = product.batches
                                    .filter((batch) => !batch.expiresAt || new Date(batch.expiresAt) > new Date())
                                    .reduce((total, batch) => total + batch.quantity, 0);
                                const required = procedures.reduce(
                                    (total: number, p: Record<string, any>) =>
                                        total +
                                        (p.unidade === product.unit
                                            ? p.dose
                                            : product.applicationPerUnit
                                              ? p.dose / product.applicationPerUnit
                                              : NaN) *
                                            (b.animalIds?.length || 0),
                                    0,
                                );
                                return (
                                    <p key={product.id} className={required > available ? 'text-amber-700' : ''}>
                                        {product.name} ·{' '}
                                        {Number.isFinite(required)
                                            ? `Necessário: ${required.toLocaleString('pt-BR')} ${product.unit} · disponível válido: ${available.toLocaleString('pt-BR')} ${product.unit}`
                                            : 'Defina a conversão de unidade na Farmácia.'}
                                    </p>
                                );
                            })}
                    <button type="button" className={button} disabled={!onPharmacy} onClick={onPharmacy}>
                        Abrir Farmácia (preservar rascunho)
                    </button>
                </div>
            )}
            {action === 'DIAGNOSTICO' && (
                <>
                    <Field label="Tentativa avaliada">
                        <select
                            required
                            className={input}
                            value={b.tentativaId || ''}
                            onChange={(e) =>
                                change({
                                    ...b,
                                    tentativaId: e.target.value,
                                    animalIds: [],
                                })
                            }
                        >
                            <option value="">Escolha</option>
                            {attempts.map(([id, e]) => (
                                <option key={id} value={id}>
                                    {e.payload.tipo === 'IATF' ? 'IATF' : 'Monta natural'} · {fmt(e.date)} ·{' '}
                                    {data.rounds.find((r) => r.id === id)?.resumo.protocolSnapshot.nome ||
                                        e.payload.touros?.map((x: { brinco: string }) => x.brinco).join(', ') ||
                                        'Tentativa'}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Resultado comum às selecionadas">
                            <select
                                className={input}
                                value={b.resultado || 'VAZIA'}
                                onChange={(e) => set('resultado', e.target.value)}
                            >
                                <option value="VAZIA">Vazia</option>
                                <option value="PRENHE">Prenhe</option>
                            </select>
                        </Field>
                        <Field label="Método">
                            <select
                                className={input}
                                value={b.metodo || 'TOQUE'}
                                onChange={(e) => set('metodo', e.target.value)}
                            >
                                <option value="TOQUE">Toque</option>
                                <option value="ULTRASSOM">Ultrassom</option>
                            </select>
                        </Field>
                    </div>
                    {b.resultado === 'PRENHE' && (
                        <Field label="Dias de gestação">
                            <input
                                required
                                className={input}
                                type="number"
                                min={1}
                                max={300}
                                value={b.diasGestacao || ''}
                                onChange={(e) => set('diasGestacao', Number(e.target.value))}
                            />
                        </Field>
                    )}
                    <label className="flex gap-2">
                        <input
                            type="checkbox"
                            checked={Boolean(b.confirmacao)}
                            onChange={(e) => set('confirmacao', e.target.checked)}
                        />
                        Diagnóstico de confirmação
                    </label>
                    <label className="flex gap-2">
                        <input
                            type="checkbox"
                            checked={Boolean(b.finalEstacao)}
                            onChange={(e) => set('finalEstacao', e.target.checked)}
                        />
                        Resultado final da estação (após fim das exposições)
                    </label>
                    <p className="text-sm">
                        Selecione animais com o mesmo resultado. Repita o lançamento para os demais; quem não foi
                        avaliado continua pendente.
                    </p>
                </>
            )}
            {dated && (
                <Field label={['ETAPA', 'INSEMINAR'].includes(action) ? 'Data e hora efetivas' : 'Data'}>
                    <input
                        required
                        className={input}
                        type={['ETAPA', 'INSEMINAR'].includes(action) ? 'datetime-local' : 'date'}
                        value={b.date || ''}
                        onChange={(e) => set('date', e.target.value)}
                    />
                </Field>
            )}
            {['RODADA', 'ETAPA', 'INSEMINAR', 'DIAGNOSTICO', 'AVALIACAO'].includes(action) && (
                <Field
                    label={
                        action === 'DIAGNOSTICO'
                            ? 'Veterinário responsável'
                            : action === 'INSEMINAR'
                              ? 'Inseminador'
                              : 'Responsável'
                    }
                >
                    <input
                        required
                        className={input}
                        value={b.responsavel || ''}
                        onChange={(e) => set('responsavel', e.target.value)}
                    />
                </Field>
            )}
            {individual && (
                <Field label={action === 'DESMAMA' ? 'Cria' : 'Matriz'}>
                    <select
                        required
                        className={input}
                        value={b.animalId || ''}
                        onChange={(e) => set('animalId', e.target.value)}
                    >
                        <option value="">Escolha</option>
                        {(action === 'DESMAMA'
                            ? data.animals.filter((a) => a.status === 'VIVO' && !a.desmamadoEm)
                            : females
                        ).map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.brinco} · {a.statusReprodutivo || 'Não liberada'}
                            </option>
                        ))}
                    </select>
                </Field>
            )}
            {group && (
                <AnimalPicker
                    data={data}
                    animals={candidates}
                    selected={b.animalIds || []}
                    blocked={['RODADA', 'MONTA'].includes(action)}
                    onChange={(animalIds) =>
                        change({
                            ...b,
                            animalIds,
                            ...(action === 'INSEMINAR'
                                ? {
                                      semen: animalIds.map((animalId) => ({
                                          animalId,
                                          batchId:
                                              b.semen?.find((x: { animalId: string }) => x.animalId === animalId)
                                                  ?.batchId ||
                                              b.batchId ||
                                              '',
                                      })),
                                  }
                                : {}),
                        })
                    }
                />
            )}
            {action === 'INSEMINAR' && (
                <>
                    <Field label="Sêmen comum às selecionadas">
                        <select
                            className={input}
                            value={b.batchId || ''}
                            onChange={(e) =>
                                change({
                                    ...b,
                                    batchId: e.target.value,
                                    semen: (b.animalIds || []).map((animalId: string) => ({
                                        animalId,
                                        batchId: e.target.value,
                                    })),
                                })
                            }
                        >
                            <option value="">Escolha</option>
                            {data.semen.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.bullName || 'Touro sem nome'} · {s.lote} · {s.dosesDisponiveis} doses
                                </option>
                            ))}
                        </select>
                    </Field>
                    {(b.animalIds || []).map((id: string) => (
                        <Field key={id} label={`Sêmen da fêmea ${data.animals.find((a) => a.id === id)?.brinco}`}>
                            <select
                                required
                                className={input}
                                value={b.semen?.find((x: { animalId: string }) => x.animalId === id)?.batchId || ''}
                                onChange={(e) =>
                                    set(
                                        'semen',
                                        b.semen.map((x: { animalId: string; batchId: string }) =>
                                            x.animalId === id
                                                ? {
                                                      ...x,
                                                      batchId: e.target.value,
                                                  }
                                                : x,
                                        ),
                                    )
                                }
                            >
                                <option value="">Escolha</option>
                                {data.semen.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.bullName || 'Touro'} · {s.lote}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    ))}
                    <p>Consumo: 1 dose por fêmea selecionada. As demais continuam aguardando inseminação.</p>
                </>
            )}
            {action === 'MONTA' && (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Entrada dos touros">
                            <input
                                required
                                type="date"
                                className={input}
                                value={b.inicio || ''}
                                onChange={(e) => set('inicio', e.target.value)}
                            />
                        </Field>
                        <Field label="Saída (opcional)">
                            <input
                                type="date"
                                className={input}
                                value={b.fim || ''}
                                onChange={(e) => set('fim', e.target.value)}
                            />
                        </Field>
                    </div>
                    <p>
                        Touros existentes em Animais. Vários touros representam exposição, sem atribuição automática de
                        paternidade.
                    </p>
                    {data.animals
                        .filter((a) => a.sexo === 'MACHO' && a.status === 'VIVO')
                        .map((a) => (
                            <label key={a.id} className="flex gap-2">
                                <input
                                    type="checkbox"
                                    checked={(b.bullIds || []).includes(a.id)}
                                    onChange={(e) =>
                                        set(
                                            'bullIds',
                                            e.target.checked
                                                ? [...b.bullIds, a.id]
                                                : b.bullIds.filter((id: string) => id !== a.id),
                                        )
                                    }
                                />
                                {a.brinco}
                            </label>
                        ))}
                    <label className="flex gap-2">
                        <input
                            type="checkbox"
                            checked={Boolean(b.repasse)}
                            onChange={(e) => set('repasse', e.target.checked)}
                        />
                        Repasse
                    </label>
                </>
            )}
            {action === 'PARTO' && (
                <>
                    <p>
                        Cadastre as crias vivas em Manejo do Rebanho → Animais e vincule aqui. Este lançamento não cria
                        animais.
                    </p>
                    <button type="button" className={button} onClick={onAnimals} disabled={!onAnimals}>
                        Ir para Animais (preservar rascunho)
                    </button>
                    <Field label="Tipo de parto">
                        <select
                            className={input}
                            value={b.tipoParto || 'NORMAL'}
                            onChange={(e) => set('tipoParto', e.target.value)}
                        >
                            <option value="NORMAL">Normal</option>
                            <option value="ASSISTIDO">Assistido</option>
                            <option value="CESAREA">Cesárea</option>
                        </select>
                    </Field>
                    {b.crias.map((c: Record<string, any>, i: number) => (
                        <div key={i} className={card}>
                            <label className="flex gap-2">
                                <input
                                    type="checkbox"
                                    checked={c.vivo}
                                    onChange={(e) =>
                                        set(
                                            'crias',
                                            b.crias.map((x: Record<string, any>, j: number) =>
                                                j === i
                                                    ? {
                                                          ...x,
                                                          vivo: e.target.checked,
                                                          animalId: null,
                                                      }
                                                    : x,
                                            ),
                                        )
                                    }
                                />
                                Cria viva
                            </label>
                            <Field label="Sexo">
                                <select
                                    className={input}
                                    value={c.sexo}
                                    onChange={(e) =>
                                        set(
                                            'crias',
                                            b.crias.map((x: Record<string, any>, j: number) =>
                                                j === i
                                                    ? {
                                                          ...x,
                                                          sexo: e.target.value,
                                                          animalId: null,
                                                      }
                                                    : x,
                                            ),
                                        )
                                    }
                                >
                                    <option value="FEMEA">Fêmea</option>
                                    <option value="MACHO">Macho</option>
                                </select>
                            </Field>
                            {c.vivo && (
                                <Field label="Cria já cadastrada">
                                    <select
                                        required
                                        className={input}
                                        value={c.animalId || ''}
                                        onChange={(e) =>
                                            set(
                                                'crias',
                                                b.crias.map((x: Record<string, any>, j: number) =>
                                                    j === i
                                                        ? {
                                                              ...x,
                                                              animalId: e.target.value,
                                                          }
                                                        : x,
                                                ),
                                            )
                                        }
                                    >
                                        <option value="">Escolha</option>
                                        {data.animals
                                            .filter(
                                                (a) =>
                                                    a.status === 'VIVO' &&
                                                    a.sexo === c.sexo &&
                                                    a.dataNascimento?.slice(0, 10) === b.date &&
                                                    (!a.maeId || a.maeId === b.animalId),
                                            )
                                            .map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.brinco}
                                                </option>
                                            ))}
                                    </select>
                                </Field>
                            )}
                            <Field label="Peso ao nascer (kg; opcional)">
                                <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    step="any"
                                    className={input}
                                    value={c.peso ?? ''}
                                    onChange={(e) =>
                                        set(
                                            'crias',
                                            b.crias.map((x: Record<string, any>, j: number) =>
                                                j === i
                                                    ? {
                                                          ...x,
                                                          peso: e.target.value ? Number(e.target.value) : null,
                                                      }
                                                    : x,
                                            ),
                                        )
                                    }
                                />
                            </Field>
                        </div>
                    ))}
                    <button
                        type="button"
                        className={button}
                        onClick={() =>
                            set(
                                'crias',
                                b.crias.length === 1
                                    ? [
                                          ...b.crias,
                                          {
                                              vivo: true,
                                              sexo: 'FEMEA',
                                              animalId: null,
                                              peso: null,
                                          },
                                      ]
                                    : b.crias.slice(0, 1),
                            )
                        }
                    >
                        {b.crias.length === 1 ? 'Adicionar segunda cria (gêmeos)' : 'Remover segunda cria do rascunho'}
                    </button>
                </>
            )}
            {action === 'DESMAMA' && (
                <>
                    <Field label="Peso de desmama (kg)">
                        <input
                            required
                            type="number"
                            min={1}
                            max={1999}
                            step="any"
                            className={input}
                            value={b.peso || ''}
                            onChange={(e) => set('peso', Number(e.target.value))}
                        />
                    </Field>
                    <Field label="Grupo de comparação (mesmo manejo e safra)">
                        <input
                            required
                            maxLength={120}
                            className={input}
                            value={b.grupoComparacao || ''}
                            placeholder="Ex.: Safra 2026 · pasto · machos Nelore"
                            onChange={(e) => set('grupoComparacao', e.target.value)}
                        />
                    </Field>
                    <p>
                        Uma pesagem existente na mesma data e com o mesmo peso será reutilizada. Divergências precisam
                        ser corrigidas antes de confirmar.
                    </p>
                </>
            )}
            {action === 'PROTOCOLO' && (
                <ProtocolEditor data={data} steps={b.passos} change={(steps) => set('passos', steps)} />
            )}
            {action === 'AVALIACAO' && (
                <>
                    <Field label="Dimensão">
                        <select
                            className={input}
                            value={b.dimensao || 'funcional'}
                            onChange={(e) => set('dimensao', e.target.value)}
                        >
                            <option value="funcional">Funcional (aprumos, úbere e aptidão)</option>
                            <option value="racial">Racial (objetivo da fazenda)</option>
                        </select>
                    </Field>
                    <Field label="Resultado">
                        <select
                            className={input}
                            value={b.resultado || 'DENTRO'}
                            onChange={(e) => set('resultado', e.target.value)}
                        >
                            <option value="DENTRO">Dentro dos critérios</option>
                            <option value="ATENCAO">Atenção</option>
                            <option value="REVISAR">Revisar permanência</option>
                        </select>
                    </Field>
                </>
            )}
            {['ETAPA', 'INSEMINAR', 'DIAGNOSTICO', 'MONTA'].includes(action) && (
                <Field label="Observação / ocorrência (opcional)">
                    <textarea
                        className={input}
                        maxLength={500}
                        value={b.ocorrencia || ''}
                        onChange={(e) => set('ocorrencia', e.target.value)}
                    />
                </Field>
            )}
            {['RETIRAR', 'AVALIACAO', 'MANTER', 'DESCARTE', 'REVERTER'].includes(action) && (
                <Field label="Motivo / justificativa">
                    <textarea
                        required
                        className={input}
                        maxLength={500}
                        value={b.motivo || ''}
                        onChange={(e) => set('motivo', e.target.value)}
                    />
                </Field>
            )}
            {action === 'MANTER' && (
                <p>O motivo ficará no histórico. Reavaliar após o próximo diagnóstico concluído.</p>
            )}
            {action === 'DESCARTE' && (
                <p className="text-amber-700">
                    A matriz sai das listas de reprodução. O cadastro permanece em Animais; venda não será registrada.
                </p>
            )}
            {action === 'REVERTER' && (
                <p>
                    Aplicação de{' '}
                    {fmt(data.records.find((r) => r.id === b.recordId)?.data.body.date || new Date().toISOString())} ·{' '}
                    {data.records
                        .find((r) => r.id === b.recordId)
                        ?.data.body.animalIds?.map(
                            (id: string) =>
                                data.animals.find((a) => a.id === id)?.brinco || 'Animal fora do rebanho ativo',
                        )
                        .join(', ')}
                </p>
            )}
            {action === 'REGRAS' && <RulesEditor value={b as Rules} change={(rules) => change({ ...b, ...rules })} />}
            {action === 'ENCERRAR' && (
                <p>
                    <b>{data.seasons.find((s) => s.id === b.seasonId)?.name}</b> · Fechar não transforma diagnósticos
                    pendentes em resultados vazios. Resultados posteriores continuam permitidos.
                </p>
            )}
        </div>
    );
}

const ReproWorkflow: React.FC<{
    farmId: string;
    userId: string | null;
    mode: string;
    onAnimals?: () => void;
    onPharmacy?: () => void;
    onFicha: (id: string) => void;
    onNavigate: (tab: string) => void;
}> = ({ farmId, userId, mode, onAnimals, onPharmacy, onFicha, onNavigate }) => {
    const key = `eixo:repro:fluxo:v1:${userId || 'none'}:${farmId}`;
    const [data, setData] = useState<WorkflowData | null>(() => read(`${key}:cache`, null));
    const [drafts, setDrafts] = useState<WorkflowDraft[]>(() => read(`${key}:drafts`, []));
    const [draft, setDraft] = useState<WorkflowDraft | null>(null),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [notice, setNotice] = useState(''),
        [confirm, setConfirm] = useState(false);
    const [search, setSearch] = useState('');
    const [discardId, setDiscardId] = useState<string | null>(null);
    const [cacheAt, setCacheAt] = useState<string | null>(() => read(`${key}:updated`, null));
    const persist = (items: WorkflowDraft[]) => {
        try {
            localStorage.setItem(`${key}:drafts`, JSON.stringify(items));
            setDrafts(items);
            return true;
        } catch {
            setError('Não foi possível salvar no aparelho. Mantenha esta tela aberta e copie os dados antes de sair.');
            return false;
        }
    };
    const load = useCallback(async () => {
        try {
            const next = await fetchWorkflow(farmId);
            setData(next);
            const updated = new Date().toISOString();
            setCacheAt(updated);
            try {
                localStorage.setItem(`${key}:updated`, JSON.stringify(updated));
                localStorage.setItem(`${key}:cache`, JSON.stringify(next));
            } catch {
                /* A operação online continua disponível. */
            }
        } catch (e) {
            setError((e as Error).message);
        }
    }, [farmId, key]);
    useEffect(() => {
        void load();
    }, [load]);
    useEffect(() => {
        setDraft(null);
        setConfirm(false);
    }, [mode]);
    const update = (body: Record<string, any>) => {
        if (!draft) return;
        const next = {
            ...draft,
            body,
            savedAt: new Date().toISOString(),
            error: undefined,
        };
        setDraft(next);
        persist([...drafts.filter((d) => d.body.clientId !== body.clientId), next]);
    };
    const open = (action: string, body: Record<string, any> = {}) => {
        const defaults: Record<string, any> = {
            clientId: crypto.randomUUID(),
            date: ['ETAPA', 'INSEMINAR'].includes(action)
                ? new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                : today(),
            animalIds: [],
            bullIds: [],
            tipo: 'MISTA',
            dia0: today(),
            inicio: today(),
            resultado: action === 'AVALIACAO' ? 'DENTRO' : 'VAZIA',
            metodo: 'TOQUE',
            dimensao: 'funcional',
            tipoParto: 'NORMAL',
            crias: [{ vivo: true, sexo: 'FEMEA', animalId: null, peso: null }],
            passos: [
                {
                    id: '',
                    dia: 0,
                    titulo: '',
                    procedimentos: [
                        {
                            titulo: '',
                            produtoId: null,
                            dose: null,
                            unidade: null,
                        },
                    ],
                },
            ],
        };
        const next: WorkflowDraft = {
            action,
            body:
                action === 'REGRAS'
                    ? {
                          clientId: defaults.clientId,
                          ...(data?.rules || {
                              modelo: 'COMERCIAL',
                              ativo: false,
                              usarEstacoes: true,
                              estacoesVazias: 2,
                              perdas: 2,
                              iepMeses: null,
                              desmamaKg: null,
                              funcional: true,
                              racial: false,
                          }),
                      }
                    : { ...defaults, ...body },
            savedAt: new Date().toISOString(),
        };
        setDraft(next);
        persist([...drafts, next]);
        setError('');
        setNotice('');
    };
    const submit = async () => {
        if (!draft || busy || data?.records.some((r) => r.data.body.clientId === draft.body.clientId)) return;
        setBusy(true);
        setError('');
        try {
            await saveWorkflow(farmId, draft);
            if (!persist(drafts.filter((d) => d.body.clientId !== draft.body.clientId))) {
                setNotice(
                    'Confirmado no servidor; o rascunho local não pôde ser removido. Reenvios com a mesma identificação não duplicam o manejo.',
                );
            } else setNotice('Registro confirmado. Histórico e estoque atualizados quando aplicável.');
            setDraft(null);
            setConfirm(false);
            await load();
        } catch (e) {
            const message = (e as Error).message;
            setError(message);
            const failed = { ...draft, error: message };
            setDraft(failed);
            persist([...drafts.filter((d) => d.body.clientId !== draft.body.clientId), failed]);
        } finally {
            setBusy(false);
        }
    };
    const active =
        data?.records.filter(
            (r) => !data.records.some((x) => x.kind === 'REVERTER' && x.data.body.recordId === r.id),
        ) || [];
    const progress = (r: Round, stepId?: string) =>
        active
            .filter(
                (x) =>
                    x.sessionId === r.id &&
                    x.kind === (stepId ? 'ETAPA' : 'INSEMINAR') &&
                    (!stepId || x.data.body.stepId === stepId),
            )
            .flatMap((x) => x.data.body.animalIds || []);
    const rounds = data?.rounds || [];
    const femaleList =
        data?.animals.filter(
            (a) =>
                a.sexo === 'FEMEA' &&
                a.status === 'VIVO' &&
                (!search || a.brinco.toLowerCase().includes(search.toLowerCase())),
        ) || [];
    const pending = rounds.filter((r) => r.status === 'ABERTO');
    return (
        <div className="space-y-4">
            {error && (
                <div role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
                    {error}
                </div>
            )}
            {notice && (
                <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">
                    {notice}
                </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    className={button}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        setError('');
                        void load();
                    }}
                >
                    Atualizar dados
                </button>
                <span className="text-xs">
                    Rascunhos não confirmam manejos nem movimentam estoque.
                    {cacheAt ? ` Dados consultados em ${new Date(cacheAt).toLocaleString('pt-BR')}.` : ''}
                </span>
            </div>
            {drafts.length > 0 && (
                <section className={card}>
                    <h3 className="font-bold">Rascunhos e lançamentos não confirmados ({drafts.length})</h3>
                    {drafts.map((d) => (
                        <div key={d.body.clientId} className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                                {names[d.action]}
                                {d.error && <span className="block text-xs text-red-700">{d.error}</span>}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className={button}
                                    disabled={busy}
                                    onClick={() => {
                                        setDraft(d);
                                        setError('');
                                    }}
                                >
                                    Revisar rascunho
                                </button>
                                <button
                                    type="button"
                                    className={button}
                                    disabled={busy}
                                    onClick={() => setDiscardId(d.body.clientId)}
                                >
                                    Descartar rascunho
                                </button>
                            </div>
                        </div>
                    ))}
                </section>
            )}
            {!data && !error && <p>Carregando animais, Farmácia e reprodução…</p>}
            {data && !draft && (
                <>
                    {mode === 'HOJE' && (
                        <section className={card}>
                            <h3 className="font-bold">Manejos da reprodução</h3>
                            <p>{pending.length} rodada(s) de IATF em andamento.</p>
                            {pending.map((r) => {
                                const next = r.resumo.protocolSnapshot.passos.find((p) =>
                                    r.vacas.some((v) => !v.retirada && !progress(r, p.id).includes(v.animalId)),
                                );
                                const planned = next
                                    ? new Date(new Date(r.dia0).getTime() + next.dia * 86400000)
                                    : null;
                                return (
                                    <div key={r.id} className="flex flex-wrap gap-2 items-center justify-between">
                                        <span>
                                            {r.resumo.protocolSnapshot.nome} ·{' '}
                                            {next
                                                ? `${next.titulo} · ${fmt(planned!.toISOString())}${planned! < new Date(today()) ? ' · atrasado' : ''}`
                                                : 'Etapas concluídas; aguardando inseminação'}
                                        </span>
                                        <button type="button" className={button} onClick={() => onNavigate('CURRAL')}>
                                            Abrir manejo
                                        </button>
                                    </div>
                                );
                            })}
                            <button type="button" className={button} onClick={() => onNavigate('TOQUE')}>
                                Diagnósticos e resultados
                            </button>
                        </section>
                    )}
                    {['COBERTURA', 'CURRAL'].includes(mode) && (
                        <>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={primary} onClick={() => open('RODADA')}>
                                    Iniciar IATF
                                </button>
                                <button type="button" className={button} onClick={() => open('MONTA')}>
                                    Monta natural / repasse
                                </button>
                                {mode === 'COBERTURA' && (
                                    <button type="button" className={button} onClick={() => open('PROTOCOLO')}>
                                        Cadastrar protocolo
                                    </button>
                                )}
                                <button type="button" className={button} onClick={() => onNavigate('CANDIDATAS')}>
                                    Liberar fêmeas
                                </button>
                            </div>
                            {mode === 'COBERTURA' && (
                                <details className={card}>
                                    <summary>Protocolos cadastrados</summary>
                                    <p>Alterações valem para novas rodadas. Rodadas iniciadas mantêm sua cópia.</p>
                                    {data.protocols
                                        .filter((p) => p.passos.every((x) => x.procedimentos))
                                        .map((p) => (
                                            <div
                                                key={p.id}
                                                className="flex flex-wrap items-center justify-between gap-2"
                                            >
                                                <span>{p.nome}</span>
                                                <button
                                                    type="button"
                                                    className={button}
                                                    onClick={() =>
                                                        open('PROTOCOLO', {
                                                            id: p.id,
                                                            nome: p.nome,
                                                            passos: p.passos,
                                                        })
                                                    }
                                                >
                                                    Editar protocolo
                                                </button>
                                            </div>
                                        ))}
                                </details>
                            )}
                            {!rounds.length && (
                                <p>
                                    Nenhuma rodada integrada. Libere as matrizes, cadastre o protocolo em Ajustes e
                                    inicie a IATF.
                                </p>
                            )}
                            {rounds.map((r) => (
                                <section className={card} key={r.id}>
                                    <h3 className="font-bold">
                                        {r.resumo.protocolSnapshot.nome} · D0 {fmt(r.dia0)}
                                    </h3>
                                    <p>
                                        {r.vacas.length} participantes · {progress(r).length} inseminadas ·{' '}
                                        {r.vacas.filter((v) => v.retirada).length} retiradas ·{' '}
                                        {r.status === 'ABERTO' ? 'Em andamento' : 'Inseminação concluída'}
                                    </p>
                                    {r.resumo.protocolSnapshot.passos.map((p) => (
                                        <div
                                            key={p.id}
                                            className="flex flex-wrap justify-between items-center gap-2 border-t border-(--eixo-border) pt-2"
                                        >
                                            <span>
                                                D{p.dia} · {p.titulo} ·{' '}
                                                {fmt(
                                                    new Date(
                                                        new Date(r.dia0).getTime() + p.dia * 86400000,
                                                    ).toISOString(),
                                                )}
                                                <span className="block text-xs">
                                                    {progress(r, p.id).length} manejadas;{' '}
                                                    {
                                                        r.vacas.filter(
                                                            (v) =>
                                                                !v.retirada && !progress(r, p.id).includes(v.animalId),
                                                        ).length
                                                    }{' '}
                                                    pendentes
                                                </span>
                                            </span>
                                            {r.status === 'ABERTO' && (
                                                <button
                                                    type="button"
                                                    className={button}
                                                    onClick={() =>
                                                        open('ETAPA', {
                                                            sessionId: r.id,
                                                            stepId: p.id,
                                                            responsavel: r.responsavel,
                                                            procedimentos: p.procedimentos,
                                                        })
                                                    }
                                                >
                                                    Registrar selecionadas
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {r.status === 'ABERTO' && (
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className={primary}
                                                onClick={() =>
                                                    open('INSEMINAR', {
                                                        sessionId: r.id,
                                                        responsavel: r.responsavel,
                                                    })
                                                }
                                            >
                                                Inseminar
                                            </button>
                                            <button
                                                type="button"
                                                className={button}
                                                onClick={() =>
                                                    open('RETIRAR', {
                                                        sessionId: r.id,
                                                    })
                                                }
                                            >
                                                Retirar fêmeas
                                            </button>
                                        </div>
                                    )}
                                    <details>
                                        <summary className="cursor-pointer">Participantes e histórico</summary>
                                        {r.vacas.map((v) => (
                                            <p key={v.animalId}>
                                                <button
                                                    className="underline"
                                                    type="button"
                                                    onClick={() => onFicha(v.animalId)}
                                                >
                                                    {v.brinco}
                                                </button>
                                                {v.retirada
                                                    ? ` · retirada: ${v.retirada.motivo}`
                                                    : progress(r).includes(v.animalId)
                                                      ? ' · inseminada'
                                                      : ' · aguardando'}
                                            </p>
                                        ))}
                                        {data.records
                                            .filter((x) => x.sessionId === r.id)
                                            .map((x) => (
                                                <div key={x.id} className="border-t border-(--eixo-border) py-2">
                                                    <p>
                                                        {names[x.kind]} · {fmt(x.createdAt)} ·{' '}
                                                        {x.data.body.animalIds?.length || 0} fêmea(s) ·{' '}
                                                        {x.data.body.responsavel || 'Responsável registrado'}
                                                    </p>
                                                    {x.data.result.procedimentos?.map(
                                                        (
                                                            p: {
                                                                titulo: string;
                                                                produto?: string;
                                                                dose?: number;
                                                                unidade?: string;
                                                            },
                                                            i: number,
                                                        ) => (
                                                            <p className="text-xs" key={i}>
                                                                {p.titulo} {p.produto} {p.dose} {p.unidade}
                                                            </p>
                                                        ),
                                                    )}
                                                    {x.kind === 'ETAPA' && active.some((a) => a.id === x.id) && (
                                                        <button
                                                            type="button"
                                                            className={button}
                                                            onClick={() =>
                                                                open('REVERTER', {
                                                                    recordId: x.id,
                                                                })
                                                            }
                                                        >
                                                            Corrigir: reverter aplicação
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                    </details>
                                </section>
                            ))}
                            {data.legacyRounds > 0 && (
                                <details className={card}>
                                    <summary>Rodadas anteriores ({data.legacyRounds})</summary>
                                    <p className="text-xs">
                                        Preservadas no formato original. Registros agregados não comprovam aplicações
                                        individuais.
                                    </p>
                                    <CoberturaAba
                                        farmId={farmId}
                                        lotes={data.lots}
                                        legacySessionIds={data.legacyRoundIds}
                                        onErro={(message) => setError(message || '')}
                                        onAviso={(message) => {
                                            setNotice(message || '');
                                            void load();
                                        }}
                                    />
                                </details>
                            )}
                        </>
                    )}
                    {mode === 'ESTACAO' && (
                        <>
                            <p>
                                Opcional: quem reproduz o ano todo pode trabalhar sem estação. Participantes são
                                preservadas mesmo após mudança de lote.
                            </p>
                            <button type="button" className={primary} onClick={() => open('ESTACAO')}>
                                Nova estação
                            </button>
                            {data.seasons.map((s) => {
                                const covered = s.exposures.filter((v) =>
                                    data.animals
                                        .find((a) => a.id === v.animalId)
                                        ?.reproEvents.some((e) => e.seasonId === s.id && e.type === 'COBERTURA'),
                                );
                                const diagnosed = covered.filter((v) =>
                                    data.animals
                                        .find((a) => a.id === v.animalId)
                                        ?.reproEvents.some(
                                            (e) =>
                                                e.seasonId === s.id &&
                                                e.type === 'DIAGNOSTICO_PRENHEZ' &&
                                                e.payload.finalEstacao,
                                        ),
                                );
                                const pregnant = diagnosed.filter(
                                    (v) =>
                                        data.animals
                                            .find((a) => a.id === v.animalId)
                                            ?.reproEvents.filter(
                                                (e) =>
                                                    e.seasonId === s.id &&
                                                    e.type === 'DIAGNOSTICO_PRENHEZ' &&
                                                    e.payload.finalEstacao,
                                            )
                                            .at(-1)?.payload.resultado === 'PRENHE',
                                );
                                return (
                                    <section className={card} key={s.id}>
                                        <h3 className="font-bold">{s.name}</h3>
                                        <p>
                                            {fmt(s.startAt)} a {fmt(s.endAt)} · {s.tipo}
                                        </p>
                                        <p>
                                            {s.exposures.length} participantes · {covered.length} expostas ·{' '}
                                            {diagnosed.length} com diagnóstico final · {pregnant.length} prenhes ·{' '}
                                            {covered.length - diagnosed.length} diagnósticos finais pendentes
                                        </p>
                                        <p>
                                            Prenhez entre diagnosticadas:{' '}
                                            {diagnosed.length
                                                ? `${Math.round((pregnant.length / diagnosed.length) * 100)}% (${pregnant.length}/${diagnosed.length})`
                                                : 'Dados insuficientes'}
                                        </p>
                                        <p>
                                            {s.notes?.startsWith('[ENCERRADA]')
                                                ? 'Fechada para novas exposições; aceita resultados posteriores.'
                                                : new Date(s.endAt) < new Date()
                                                  ? 'Período de exposição encerrado'
                                                  : 'Período de exposição aberto'}
                                        </p>
                                        {new Date(s.endAt) < new Date() && !s.notes?.startsWith('[ENCERRADA]') && (
                                            <button
                                                type="button"
                                                className={button}
                                                onClick={() =>
                                                    open('ENCERRAR', {
                                                        seasonId: s.id,
                                                    })
                                                }
                                            >
                                                Revisar e fechar
                                            </button>
                                        )}
                                        <details>
                                            <summary>Ver participantes</summary>
                                            {s.exposures.map((v) => (
                                                <p key={v.animalId}>
                                                    {data.animals.find((a) => a.id === v.animalId)?.brinco ||
                                                        'Animal fora do rebanho ativo'}
                                                </p>
                                            ))}
                                        </details>
                                        {!s.exposures.length && (
                                            <p className="text-amber-700">
                                                Estação antiga sem participantes históricos: não inferimos participação
                                                pelo lote atual.
                                            </p>
                                        )}
                                    </section>
                                );
                            })}
                        </>
                    )}
                    {mode === 'TOQUE' && (
                        <>
                            <button type="button" className={primary} onClick={() => open('DIAGNOSTICO')}>
                                Registrar diagnóstico
                            </button>
                            <p>Diagnósticos são vinculados à tentativa. Confirmações não contam como novas falhas.</p>
                            {data.animals
                                .filter((a) => a.sexo === 'FEMEA' && a.status === 'VIVO')
                                .map((a) => {
                                    const attempt = a.reproEvents.filter((e) => e.type === 'COBERTURA').at(-1);
                                    if (!attempt) return null;
                                    const diagnostic = a.reproEvents
                                        .filter(
                                            (e) =>
                                                e.type === 'DIAGNOSTICO_PRENHEZ' &&
                                                e.payload?.tentativaId === (attempt.payload.tentativaId || attempt.id),
                                        )
                                        .at(-1);
                                    return (
                                        <div className={card} key={a.id}>
                                            <b>{a.brinco}</b>
                                            <p>
                                                {diagnostic
                                                    ? `${diagnostic.payload.resultado === 'PRENHE' ? 'Prenhe' : 'Vazia'} · ${fmt(diagnostic.date)}`
                                                    : 'Aguardando diagnóstico'}
                                            </p>
                                            <button
                                                type="button"
                                                className={button}
                                                onClick={() =>
                                                    open('DIAGNOSTICO', {
                                                        tentativaId: attempt.payload.tentativaId || attempt.id,
                                                        animalIds: [a.id],
                                                    })
                                                }
                                            >
                                                Registrar / confirmar
                                            </button>
                                            {diagnostic?.payload.resultado === 'VAZIA' && (
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        className={button}
                                                        onClick={() => onNavigate('CURRAL')}
                                                    >
                                                        Nova tentativa / repasse
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={button}
                                                        onClick={() => onNavigate('DECIDIR')}
                                                    >
                                                        Avaliar permanência
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </>
                    )}
                    {mode === 'DESMAMA' && (
                        <>
                            <button type="button" className={primary} onClick={() => open('DESMAMA')}>
                                Registrar desmama
                            </button>
                            {data.animals
                                .filter((a) => a.desmamadoEm)
                                .map((a) => (
                                    <p key={a.id}>
                                        {a.brinco} · desmamada em {fmt(a.desmamadoEm!)}
                                    </p>
                                ))}
                        </>
                    )}
                    {mode === 'PARTOS' && (
                        <>
                            <button type="button" className={primary} onClick={() => open('PARTO')}>
                                Registrar parto com crias cadastradas
                            </button>
                            <p>
                                Previsões e histórico continuam na ficha das matrizes. Cria viva entra primeiro em
                                Animais.
                            </p>
                            {femaleList
                                .filter(
                                    (a) =>
                                        a.statusReprodutivo === 'PRENHE' ||
                                        a.reproEvents.some((e) => e.type === 'PARTO'),
                                )
                                .map((a) => (
                                    <div key={a.id} className={card}>
                                        <button
                                            type="button"
                                            className="font-bold underline"
                                            onClick={() => onFicha(a.id)}
                                        >
                                            {a.brinco}
                                        </button>
                                        <p>
                                            {a.statusReprodutivo}
                                            {a.previsaoParto
                                                ? ` · previsão: ${fmt(a.previsaoParto)}${new Date(a.previsaoParto) < new Date() ? ' · confira possível atraso' : ''}`
                                                : ' · previsão não disponível'}
                                        </p>
                                        {a.reproEvents
                                            .filter((e) => e.type === 'PARTO')
                                            .map((e) => (
                                                <p key={e.id}>
                                                    {fmt(e.date)} ·{' '}
                                                    {e.payload.crias
                                                        ?.map((c: { brinco?: string; vivo: boolean }) =>
                                                            c.vivo ? c.brinco : 'Natimorto',
                                                        )
                                                        .join(', ')}
                                                </p>
                                            ))}
                                        <button
                                            type="button"
                                            className={button}
                                            onClick={() =>
                                                open('PARTO', {
                                                    animalId: a.id,
                                                })
                                            }
                                        >
                                            Registrar parto
                                        </button>
                                    </div>
                                ))}
                        </>
                    )}
                    {['DECIDIR', 'NUMEROS'].includes(mode) && (
                        <>
                            <h3 className="font-bold">Farol e permanência das matrizes</h3>
                            {!data.performance ? (
                                <p>
                                    Farol e avaliações disponíveis no EIXO Performance. Os manejos continuam disponíveis
                                    no Gestão.
                                </p>
                            ) : (
                                <>
                                    <Field label="Buscar matriz">
                                        <input
                                            className={input}
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                        />
                                    </Field>
                                    {femaleList.map((a) => (
                                        <section key={a.id} className={card}>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <button
                                                    type="button"
                                                    className="font-bold underline"
                                                    onClick={() => onFicha(a.id)}
                                                >
                                                    {a.brinco}
                                                </button>
                                                <strong className={trafficColors[a.farol?.cor || 'CINZA']}>
                                                    {a.farol?.label}
                                                </strong>
                                            </div>
                                            {a.farol?.motivos.map((m) => (
                                                <p className="text-sm" key={m}>
                                                    {m}
                                                </p>
                                            ))}
                                            {a.farol?.dimensoes.map((d) => (
                                                <p className="text-sm" key={d.nome}>
                                                    {d.nome}: {d.resultado}
                                                    {d.evolucao ? ` · evolução: ${d.evolucao}` : ''}
                                                </p>
                                            ))}
                                            {a.reproEvents
                                                .filter((e) => e.type === 'OBSERVACAO' && e.payload?.manter)
                                                .slice(-1)
                                                .map((e) => (
                                                    <p key={e.id} className="text-xs">
                                                        Manutenção justificada: {e.payload.motivo}.{' '}
                                                        {a.reproEvents.some(
                                                            (x) =>
                                                                x.type === 'DIAGNOSTICO_PRENHEZ' &&
                                                                new Date(x.createdAt) > new Date(e.createdAt),
                                                        )
                                                            ? 'Novo diagnóstico registrado: reavaliar.'
                                                            : 'Reavaliar após o próximo diagnóstico.'}
                                                    </p>
                                                ))}
                                            {a.farol?.cor !== 'DESCARTE' && (
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        className={button}
                                                        onClick={() =>
                                                            open('AVALIACAO', {
                                                                animalId: a.id,
                                                            })
                                                        }
                                                    >
                                                        Avaliar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={button}
                                                        onClick={() =>
                                                            open('MANTER', {
                                                                animalId: a.id,
                                                            })
                                                        }
                                                    >
                                                        Manter com justificativa
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={button}
                                                        onClick={() =>
                                                            open('DESCARTE', {
                                                                animalId: a.id,
                                                            })
                                                        }
                                                    >
                                                        Registrar descarte
                                                    </button>
                                                </div>
                                            )}
                                            <details>
                                                <summary>Histórico de avaliações</summary>
                                                {data.records
                                                    .filter((r) => r.kind === 'AVALIACAO' && r.animalId === a.id)
                                                    .map((r) => (
                                                        <p key={r.id}>
                                                            {fmt(r.data.body.date)} · {r.data.body.dimensao} ·{' '}
                                                            {r.data.body.resultado} · {r.data.body.motivo} ·{' '}
                                                            {r.data.body.responsavel}
                                                        </p>
                                                    ))}
                                            </details>
                                        </section>
                                    ))}
                                </>
                            )}
                        </>
                    )}
                    {mode === 'CRITERIOS' && (
                        <section className={card}>
                            <h3 className="font-bold">Modelo de avaliação das matrizes</h3>
                            {data.performance ? (
                                <>
                                    <p>
                                        {data.rules
                                            ? `${data.rules.modelo === 'PO' ? 'P.O.' : 'Comercial'} · ${data.rules.ativo ? 'Ativo' : 'Desativado'}`
                                            : 'Nenhum modelo ativado'}
                                    </p>
                                    <button type="button" className={button} onClick={() => open('REGRAS')}>
                                        Revisar modelo e limites
                                    </button>
                                    <p className="text-xs">
                                        Cada revisão fica registrada. Verde exige dados suficientes; vermelho sempre
                                        mostra o motivo.
                                    </p>
                                </>
                            ) : (
                                <p>Disponível no EIXO Performance.</p>
                            )}
                        </section>
                    )}
                </>
            )}
            {data && draft && (
                <form
                    className={card}
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (['DESCARTE', 'REVERTER', 'ENCERRAR'].includes(draft.action)) setConfirm(true);
                        else void submit();
                    }}
                >
                    <h3 className="text-lg font-bold">{names[draft.action]}</h3>
                    {data.records.some((r) => r.data.body.clientId === draft.body.clientId) && (
                        <p role="status">
                            Este lançamento já foi confirmado no servidor. Confira o histórico e descarte somente o
                            rascunho local.
                        </p>
                    )}
                    <fieldset
                        disabled={busy || data.records.some((r) => r.data.body.clientId === draft.body.clientId)}
                        className="space-y-4"
                    >
                        <OperationForm
                            draft={draft}
                            data={data}
                            change={update}
                            onAnimals={onAnimals}
                            onPharmacy={onPharmacy}
                        />
                        <p className="text-sm">
                            Confira os animais e dados antes de confirmar. Estoque insuficiente impede a confirmação e
                            mantém este rascunho.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button type="submit" className={primary}>
                                {busy ? 'Confirmando…' : 'Confirmar registro'}
                            </button>
                            <button
                                type="button"
                                className={button}
                                onClick={() => {
                                    persist([...drafts.filter((d) => d.body.clientId !== draft.body.clientId), draft]);
                                    setDraft(null);
                                }}
                            >
                                Salvar rascunho e fechar
                            </button>
                        </div>
                    </fieldset>
                </form>
            )}
            {discardId && (
                <FinanceDialog titleId="repro-discard-draft" onClose={() => setDiscardId(null)}>
                    <div className="p-5 space-y-4">
                        <h3 id="repro-discard-draft" className="font-bold">
                            Descartar rascunho deste aparelho?
                        </h3>
                        <p>O preenchimento local será removido. Registros já confirmados no servidor permanecem.</p>
                        <div className="flex gap-2">
                            <button type="button" className={button} onClick={() => setDiscardId(null)}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className={primary}
                                onClick={() => {
                                    if (persist(drafts.filter((d) => d.body.clientId !== discardId))) {
                                        if (draft?.body.clientId === discardId) setDraft(null);
                                        setDiscardId(null);
                                    }
                                }}
                            >
                                Descartar rascunho
                            </button>
                        </div>
                    </div>
                </FinanceDialog>
            )}
            {confirm && draft && (
                <FinanceDialog titleId="repro-workflow-confirm" busy={busy} onClose={() => setConfirm(false)}>
                    <div className="p-5 space-y-4">
                        <h3 id="repro-workflow-confirm" className="font-bold">
                            {names[draft.action]}?
                        </h3>
                        <p>
                            {draft.action === 'DESCARTE'
                                ? 'A matriz sai da reprodução. Seu cadastro e histórico permanecem; nenhuma venda será registrada.'
                                : draft.action === 'REVERTER'
                                  ? 'O consumo desta aplicação será devolvido ao estoque, mantendo a trilha de auditoria.'
                                  : 'A estação será fechada para novas exposições. Diagnósticos pendentes continuam pendentes.'}
                        </p>
                        <p>
                            <b>
                                {data?.animals.find((a) => a.id === draft.body.animalId)?.brinco ||
                                    data?.seasons.find((s) => s.id === draft.body.seasonId)?.name}
                            </b>
                        </p>
                        <p>{draft.body.motivo}</p>
                        <div className="flex gap-2">
                            <button type="button" className={button} disabled={busy} onClick={() => setConfirm(false)}>
                                Cancelar
                            </button>
                            <button type="button" className={primary} disabled={busy} onClick={() => void submit()}>
                                {busy ? 'Confirmando…' : names[draft.action]}
                            </button>
                        </div>
                    </div>
                </FinanceDialog>
            )}
        </div>
    );
};

export default ReproWorkflow;
