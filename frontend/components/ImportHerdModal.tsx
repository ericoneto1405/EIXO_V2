import React, { useMemo, useRef, useState } from 'react';
import { buildApiUrl } from '../api';
import type { HerdType } from '../adapters/herdApi';
import type { Lot, Paddock } from '../types';
import ImportPreviewTable, { contarLinhas } from './ImportPreviewTable';
import type { PreviewCatalogos, PreviewLinha } from './ImportPreviewTable';

// preview = arquivo conferido e mostrado na tela, ainda SEM gravar nada.
// saving  = o produtor confirmou e o servidor está criando os animais.
type Status = 'idle' | 'uploading' | 'preview' | 'saving' | 'done' | 'error';

// De onde vieram os animais. Nascimento não entra por aqui: o bezerro é
// lançado no parto da mãe, em Reprodução.
type Origem = 'PROPRIO' | 'COMPRA';
type CondicaoPagamento = 'PAGO' | 'ENTRADA_PARCELADO' | 'PARCELADO';

interface DadosCompra {
    fornecedor: string;
    gta: string;
    dataCompra: string;
    valorTotal: string;
    finalidade: 'PRODUCTION' | 'BREEDING';
    condicaoPagamento: CondicaoPagamento;
    vencimento: string;
    parcelas: string;
    valorEntrada: string;
}

const compraVazia = (): DadosCompra => ({
    fornecedor: '',
    gta: '',
    dataCompra: new Date().toISOString().slice(0, 10),
    valorTotal: '',
    finalidade: 'PRODUCTION',
    condicaoPagamento: 'PAGO',
    vencimento: '',
    parcelas: '1',
    valorEntrada: '',
});

// "592.000,50" ou "592000.50" → 592000.5
const lerValor = (raw: string): number | null => {
    const limpo = String(raw || '').trim().replace(/[^\d,.]/g, '');
    if (!limpo) return null;
    // Sem vírgula, "1.000" e "592.000" são milhar (jeito brasileiro); "592000.50" é decimal.
    const soMilhar = !limpo.includes(',') && /^\d{1,3}(\.\d{3})+$/.test(limpo);
    const normalizado = limpo.includes(',') || soMilhar ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : null;
};

const formatarReais = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Confere só o básico para avisar cedo; quem decide é o servidor.
const problemaNaCompra = (compra: DadosCompra): string | null => {
    if (!compra.fornecedor.trim()) return 'Informe o fornecedor da compra.';
    if (!compra.dataCompra) return 'Informe a data da compra.';
    if (!((lerValor(compra.valorTotal) ?? 0) > 0)) return 'Informe o valor total da compra.';
    if (compra.condicaoPagamento === 'ENTRADA_PARCELADO') {
        const entrada = lerValor(compra.valorEntrada) ?? 0;
        if (!(entrada > 0)) return 'Informe o valor da entrada.';
        if (entrada >= (lerValor(compra.valorTotal) ?? 0)) return 'Informe uma entrada menor que o valor total.';
    }
    if (compra.condicaoPagamento !== 'PAGO' && !compra.vencimento) return 'Informe a data do primeiro vencimento.';
    const parcelas = Number(compra.parcelas);
    if (compra.condicaoPagamento !== 'PAGO' && (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 60)) {
        return 'Informe de 1 a 60 parcelas.';
    }
    return null;
};

interface ValidacaoResposta {
    total: number;
    prontos: number;
    comErro: number;
    linhas: PreviewLinha[];
    catalogos: PreviewCatalogos;
}

interface ErrorRow {
    line: number;
    identificacao?: string | null;
    motivos?: string[];
    dados?: Record<string, unknown>;
}
interface SkippedRow {
    line: number;
    identificacao?: string | null;
    motivo?: string;
}
interface UploadResult {
    total: number;
    criados: number;
    ignorados: number;
    erros: number;
    detalhes?: {
        criados?: Array<{ line: number; id: string; identificacao: string }>;
        ignorados?: SkippedRow[];
        erros?: ErrorRow[];
        linhasCorrecao?: ErrorRow[];
    };
}

interface ImportHerdModalProps {
    open: boolean;
    onClose: () => void;
    onDownloadTemplate: () => void | Promise<void>;
    farmId?: string | null;
    farmName?: string | null;
    onSuccess?: () => void;
    herdType: HerdType;
    paddocks?: Paddock[];
    lots?: Lot[];
}

const ImportHerdModal: React.FC<ImportHerdModalProps> = ({
    open,
    onClose,
    onDownloadTemplate,
    farmId,
    farmName,
    onSuccess,
    herdType,
    paddocks = [],
    lots = [],
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState<string>('');
    const [result, setResult] = useState<UploadResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [paddockId, setPaddockId] = useState('');
    const [lotId, setLotId] = useState('');
    const [isDownloadingErrors, setIsDownloadingErrors] = useState(false);
    const [downloadMessage, setDownloadMessage] = useState('');
    const [racaPadrao, setRacaPadrao] = useState('');
    const [previewLinhas, setPreviewLinhas] = useState<PreviewLinha[]>([]);
    const [catalogos, setCatalogos] = useState<PreviewCatalogos | null>(null);
    const [origem, setOrigem] = useState<Origem | null>(null);
    const [compra, setCompra] = useState<DadosCompra>(compraVazia);
    const [avisoCompra, setAvisoCompra] = useState('');

    const contagem = useMemo(() => contarLinhas(previewLinhas), [previewLinhas]);

    if (!open) return null;

    const reset = () => {
        setStatus('idle');
        setFileName('');
        setResult(null);
        setErrorMessage('');
        setPaddockId('');
        setLotId('');
        setRacaPadrao('');
        setIsDownloadingErrors(false);
        setDownloadMessage('');
        setPreviewLinhas([]);
        setCatalogos(null);
        setOrigem(null);
        setCompra(compraVazia());
        setAvisoCompra('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // Uma fase por vez: destino e planilha só liberam depois que a origem
    // foi escolhida e, na compra, os dados da compra estão completos.
    const faltaNaCompra = origem === 'COMPRA' ? problemaNaCompra(compra) : null;
    const faseLiberada = origem !== null && !faltaNaCompra;

    const atualizarCompra = <K extends keyof DadosCompra>(campo: K, valor: DadosCompra[K]) => {
        setCompra((atual) => ({ ...atual, [campo]: valor }));
        setAvisoCompra('');
    };

    const handleClose = () => {
        if (status === 'uploading' || status === 'saving') return;
        reset();
        onClose();
    };

    const handleTryAgain = () => {
        setStatus('idle');
        setFileName('');
        setResult(null);
        setErrorMessage('');
        setDownloadMessage('');
        setPreviewLinhas([]);
        setCatalogos(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePickCorrectedFile = () => {
        if (fileInputRef.current) fileInputRef.current.value = '';
        fileInputRef.current?.click();
    };

    const handleDownload = async () => {
        try {
            await onDownloadTemplate();
        } catch (err) {
            console.error(err);
        }
    };

    const handlePickFile = () => {
        if (!farmId) {
            setErrorMessage('Selecione uma fazenda antes de importar.');
            setStatus('error');
            return;
        }
        if (origem === 'COMPRA') {
            const problema = problemaNaCompra(compra);
            if (problema) {
                setAvisoCompra(problema);
                return;
            }
        }
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !farmId) return;
        const fileNameLower = file.name.toLowerCase();
        const isSupportedFormat = fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls') || fileNameLower.endsWith('.csv');
        if (!isSupportedFormat) {
            setErrorMessage('Use a planilha modelo oficial nos formatos .xlsx, .xls ou .csv.');
            setStatus('error');
            e.target.value = '';
            return;
        }
        setFileName(file.name);
        setStatus('uploading');
        setErrorMessage('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('farmId', farmId);
            if (paddockId) formData.append('paddockId', paddockId);
            if (lotId) formData.append('lotId', lotId);
            if (racaPadrao) formData.append('racaPadrao', racaPadrao);

            // A importação só confere. Nada é gravado até confirmar a prévia.
            const uploadPath = '/herd/import/validar';
            const res = await fetch(buildApiUrl(uploadPath), {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (Array.isArray(data?.detalhes?.erros) && data.detalhes.erros.length > 0) {
                    setResult(data as UploadResult);
                    setStatus('done');
                    return;
                }
                setErrorMessage(data?.message || 'Erro ao processar planilha.');
                setStatus('error');
                return;
            }
            {
                const validacao = data as ValidacaoResposta;
                setPreviewLinhas(validacao.linhas || []);
                setCatalogos(validacao.catalogos || null);
                setStatus('preview');
                return;
            }
            setResult(data as UploadResult);
            setStatus('done');
        } catch (err) {
            console.error(err);
            setErrorMessage('Erro de rede ao enviar planilha.');
            setStatus('error');
        }
    };

    // Manda as linhas corrigidas para gravar. O servidor confere tudo de novo —
    // o que volta do navegador nunca é tratado como confiável.
    const handleConfirmarImportacao = async () => {
        if (!farmId || previewLinhas.length === 0) return;
        setStatus('saving');
        setErrorMessage('');
        try {
            // A prévia preserva a célula vazia quando a linha usa o destino
            // padrão. Ao confirmar, deixa os destinos explícitos em cada linha
            // para que eles não dependam apenas dos campos separados do modal.
            const defaultPaddockName = paddocks.find((paddock) => paddock.id === paddockId)?.name || '';
            const defaultLotName = lots.find((lot) => lot.id === lotId)?.name || '';
            const linhasParaConfirmar = previewLinhas.map((linha) => {
                const dados = { ...linha.dados };
                if (!String(dados.pasto_destino || '').trim() && defaultPaddockName) {
                    dados.pasto_destino = defaultPaddockName;
                }
                if (!String(dados.lote_destino || '').trim() && defaultLotName) {
                    dados.lote_destino = defaultLotName;
                }
                return { line: linha.line, dados };
            });
            const res = await fetch(buildApiUrl('/herd/import/confirmar'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    farmId,
                    paddockId: paddockId || undefined,
                    lotId: lotId || undefined,
                    racaPadrao: racaPadrao || undefined,
                    linhas: linhasParaConfirmar,
                    origem: origem ?? 'PROPRIO',
                    compra: origem === 'COMPRA'
                        ? {
                            fornecedor: compra.fornecedor.trim(),
                            gta: compra.gta.trim() || undefined,
                            dataCompra: compra.dataCompra,
                            valorTotal: lerValor(compra.valorTotal),
                            finalidade: compra.finalidade,
                            condicaoPagamento: compra.condicaoPagamento,
                            vencimento: compra.condicaoPagamento === 'PAGO' ? undefined : compra.vencimento,
                            parcelas: compra.condicaoPagamento === 'PAGO' ? undefined : Number(compra.parcelas),
                            valorEntrada: compra.condicaoPagamento === 'ENTRADA_PARCELADO' ? lerValor(compra.valorEntrada) : undefined,
                        }
                        : undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setErrorMessage(data?.message || 'Erro ao gravar os animais.');
                setStatus('error');
                return;
            }
            setResult(data as UploadResult);
            setStatus('done');
        } catch (err) {
            console.error(err);
            setErrorMessage('Erro de rede ao gravar os animais.');
            setStatus('error');
        }
    };

    // Volta da prévia para escolher outro arquivo, sem perder pasto/lote/raça.
    // Se já tem linha carregada (inclusive corrigida na tela), confirma antes de descartar.
    const handleVoltarParaArquivo = () => {
        if (contagem.total > 0) {
            const confirmar = window.confirm(
                `Isso vai descartar as ${contagem.total} linhas desta planilha, incluindo o que já foi corrigido aqui. Trocar de arquivo mesmo assim?`
            );
            if (!confirmar) return;
        }
        setPreviewLinhas([]);
        setCatalogos(null);
        setFileName('');
        setStatus('idle');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSeeAnimals = () => {
        onSuccess?.();
        handleClose();
    };

    const handleDownloadErrors = async () => {
        const erros = result?.detalhes?.erros;
        if (!erros || erros.length === 0) return;
        setIsDownloadingErrors(true);
        setDownloadMessage('');
        try {
            const errorsPath = '/herd/import/erros-xlsx';
            const res = await fetch(buildApiUrl(errorsPath), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ erros, linhasCorrecao: result?.detalhes?.linhasCorrecao }),
            });
            if (!res.ok) throw new Error('Erro ao gerar planilha de erros');
            const contentType = res.headers.get('content-type') || '';
            if (!contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
                throw new Error('Resposta inválida ao gerar planilha de erros');
            }
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = `[EIXO] ${farmName || 'Fazenda'} - Planilha completa para correção.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
            setDownloadMessage('Planilha completa baixada. Corrija as linhas indicadas e envie novamente.');
        } catch (err) {
            console.error(err);
            setDownloadMessage('Não foi possível baixar a planilha para correção. Tente novamente.');
        } finally {
            setIsDownloadingErrors(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => { if (status !== 'uploading') handleClose(); }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-herd-title"
                aria-busy={status === 'uploading'}
                className={`relative max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl ${
                    status === 'preview' || status === 'saving' ? 'max-w-6xl' : 'max-w-xl'
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-4">
                    <div>
                        <h3 id="import-herd-title" className="text-base font-bold text-[var(--eixo-text)]">
                            {status === 'preview' || status === 'saving' ? 'Conferir antes de importar' : 'Importar planilha'}
                        </h3>
                        <p className="mt-0.5 text-xs text-[var(--eixo-text-muted)]">
                            {status === 'done'
                                ? !result?.erros
                                    ? 'Importação concluída.'
                                    : result?.criados
                                    ? `${result.criados} animais criados · ${result.erros} linhas ficaram de fora.`
                                    : 'Nenhum animal foi criado. Corrija as linhas indicadas.'
                                : status === 'preview'
                                ? `${fileName} · ${contagem.total} linhas · nada foi gravado ainda`
                                : status === 'saving'
                                ? 'Gravando os animais…'
                                : status === 'uploading'
                                ? 'Conferindo a planilha…'
                                : 'Baixe o modelo, preencha e envie a planilha.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={status === 'uploading' || status === 'saving'}
                        className="rounded-lg p-1 text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-green)] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Fechar"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Input file (oculto) */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileChange}
                />

                {/* IDLE — 2 cards */}
                {status === 'idle' && (
                    <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
                        <div className="sm:col-span-2 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                            <p className="text-sm font-semibold text-[var(--eixo-text)]">De onde vieram esses animais?</p>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Origem dos animais">
                                {([
                                    { valor: 'PROPRIO', titulo: 'Rebanho que já era meu', texto: 'Animais que você já tinha e está trazendo de outro sistema ou caderno.' },
                                    { valor: 'COMPRA', titulo: 'Compra', texto: 'Animais comprados de outro produtor ou leilão. O valor vai para o Financeiro.' },
                                ] as const).map((opcao) => (
                                    <button
                                        key={opcao.valor}
                                        type="button"
                                        role="radio"
                                        aria-checked={origem === opcao.valor}
                                        onClick={() => { setOrigem(opcao.valor); setAvisoCompra(''); }}
                                        className={`rounded-xl border-2 p-3 text-left transition-colors ${origem === opcao.valor ? 'border-[var(--eixo-green)] bg-[var(--eixo-green)]/10' : 'border-[var(--eixo-border)] bg-[var(--eixo-surface)] hover:border-[var(--eixo-green)]/60'}`}
                                    >
                                        <span className="block text-sm font-semibold text-[var(--eixo-text)]">{opcao.titulo}</span>
                                        <span className="mt-1 block text-xs text-[var(--eixo-text-muted)]">{opcao.texto}</span>
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-xs text-[var(--eixo-text-soft)]">
                                Bezerro nascido na fazenda não entra por aqui: é lançado no parto da mãe, em Reprodução.
                            </p>

                            {origem === 'COMPRA' && (
                                <div className="mt-4 border-t border-[var(--eixo-border)] pt-4">
                                    <p className="text-sm font-semibold text-[var(--eixo-text)]">Dados da compra</p>
                                    <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">Valem para todos os animais da planilha.</p>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                            Fornecedor
                                            <input id="import-compra-fornecedor" type="text" value={compra.fornecedor} onChange={(e) => atualizarCompra('fornecedor', e.target.value)} placeholder="Nome do vendedor ou leilão" className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]" />
                                        </label>
                                        <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                            Nº da GTA (opcional)
                                            <input id="import-compra-gta" type="text" value={compra.gta} onChange={(e) => atualizarCompra('gta', e.target.value)} placeholder="Ex.: BA-123456" className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]" />
                                        </label>
                                        <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                            Data da compra
                                            <input id="import-compra-data" type="date" max={new Date().toISOString().slice(0, 10)} value={compra.dataCompra} onChange={(e) => atualizarCompra('dataCompra', e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]" />
                                        </label>
                                        <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                            Valor total da compra (R$)
                                            <input id="import-compra-valor" type="text" inputMode="decimal" value={compra.valorTotal} onChange={(e) => atualizarCompra('valorTotal', e.target.value)} placeholder="0,00" className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]" />
                                        </label>
                                        <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                            Finalidade
                                            <select id="import-compra-finalidade" value={compra.finalidade} onChange={(e) => atualizarCompra('finalidade', e.target.value as DadosCompra['finalidade'])} className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]">
                                                <option value="PRODUCTION">Engorda / produção</option>
                                                <option value="BREEDING">Reprodução (matrizes e touros)</option>
                                            </select>
                                        </label>
                                        <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                            Pagamento
                                            <select id="import-compra-pagamento" value={compra.condicaoPagamento} onChange={(e) => atualizarCompra('condicaoPagamento', e.target.value as CondicaoPagamento)} className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]">
                                                <option value="PAGO">À vista</option>
                                                <option value="ENTRADA_PARCELADO">Entrada + parcelado</option>
                                                <option value="PARCELADO">Parcelado</option>
                                            </select>
                                        </label>
                                        {compra.condicaoPagamento === 'ENTRADA_PARCELADO' && (
                                            <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                                Valor da entrada (R$)
                                                <input id="import-compra-entrada" type="text" inputMode="decimal" value={compra.valorEntrada} onChange={(e) => atualizarCompra('valorEntrada', e.target.value)} placeholder="0,00" className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]" />
                                                <span className="mt-1 block font-normal text-[var(--eixo-text-soft)]">Entra como paga na data da compra.</span>
                                            </label>
                                        )}
                                        {compra.condicaoPagamento !== 'PAGO' && (
                                            <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                                Primeiro vencimento
                                                <input id="import-compra-vencimento" type="date" value={compra.vencimento} onChange={(e) => atualizarCompra('vencimento', e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]" />
                                            </label>
                                        )}
                                        {compra.condicaoPagamento !== 'PAGO' && (
                                            <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                                Parcelas
                                                <input id="import-compra-parcelas" type="number" min={1} max={60} value={compra.parcelas} onChange={(e) => atualizarCompra('parcelas', e.target.value)} className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]" />
                                                <span className="mt-1 block font-normal text-[var(--eixo-text-soft)]">1 parcela = pagamento único com prazo.</span>
                                            </label>
                                        )}
                                    </div>
                                    {avisoCompra && (
                                        <p className="mt-3 text-xs font-semibold text-[var(--eixo-danger)]" role="alert">{avisoCompra}</p>
                                    )}
                                </div>
                            )}
                        </div>
                        {!faseLiberada && (
                            <p className="sm:col-span-2 rounded-xl border border-dashed border-[var(--eixo-border)] px-4 py-3 text-xs font-semibold text-[var(--eixo-text-muted)]" role="status" aria-live="polite">
                                {origem === null
                                    ? 'Escolha de onde vieram os animais para liberar os próximos passos.'
                                    : `Para continuar: ${faltaNaCompra?.replace(/^Informe /, 'informe ')}`}
                            </p>
                        )}
                        <fieldset
                            disabled={!faseLiberada}
                            aria-disabled={!faseLiberada}
                            className={`sm:col-span-2 m-0 grid min-w-0 gap-3 border-0 p-0 transition-opacity sm:grid-cols-2 ${faseLiberada ? '' : 'cursor-not-allowed opacity-40'}`}
                        >
                        <div className="sm:col-span-2 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">Destino no EIXO</p>
                                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                    Use como padrão nas linhas sem destino. Cada linha da planilha pode escolher outro pasto ou lote.
                                </p>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                        Pasto padrão (opcional)
                                        <select
                                            value={paddockId}
                                            onChange={(event) => setPaddockId(event.target.value)}
                                            className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]"
                                        >
                                            <option value="">Selecione o pasto</option>
                                            {paddocks.map((paddock) => (
                                                <option key={paddock.id} value={paddock.id}>{paddock.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="text-xs font-semibold text-[var(--eixo-text-muted)]">
                                        Lote padrão (opcional)
                                        <select
                                            value={lotId}
                                            onChange={(event) => setLotId(event.target.value)}
                                            className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]"
                                        >
                                            <option value="">Sem lote</option>
                                            {lots.map((lot) => (
                                                <option key={lot.id} value={lot.id}>{lot.name}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                                <label className="mt-3 block text-xs font-semibold text-[var(--eixo-text-muted)]">
                                    Raça padrão do rebanho (opcional)
                                    <input
                                        type="text"
                                        value={racaPadrao}
                                        onChange={(event) => setRacaPadrao(event.target.value)}
                                        placeholder="Nelore, Anelorado, Angus…"
                                        className="mt-1 w-full rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-2 text-sm font-normal text-[var(--eixo-text)]"
                                    />
                                    <span className="mt-1 block font-normal text-[var(--eixo-text-soft)]">
                                        Em fazenda comercial a raça costuma ser a mesma do lote inteiro. Preencha aqui
                                        e deixe a coluna da planilha em branco — só as exceções precisam ser digitadas.
                                    </span>
                                </label>
                                {paddocks.length === 0 && (
                                    <p className="mt-2 text-xs font-semibold text-[var(--eixo-text-muted)]">
                                        Nenhum pasto cadastrado nesta fazenda.
                                    </p>
                                )}
                        </div>
                        <button
                            type="button"
                            onClick={handleDownload}
                            className="group relative flex flex-col items-start gap-3 rounded-2xl border-2 border-[var(--eixo-green)] bg-[var(--eixo-surface)] p-4 text-left transition-all hover:bg-[var(--eixo-green)]/5"
                        >
                            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--eixo-green)] text-[10px] font-bold text-white">1</span>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--eixo-green)]/10 text-[var(--eixo-green)]">
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">Baixar modelo</p>
                                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                    Planilha pronta para você preencher com os dados do rebanho.
                                </p>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={handlePickFile}
                            className="group relative flex flex-col items-start gap-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4 text-left transition-all hover:border-[var(--eixo-green)] hover:bg-[var(--eixo-surface)]"
                        >
                            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--eixo-border)] text-[10px] font-bold text-[var(--eixo-text-muted)]">2</span>
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--eixo-green)]/10 text-[var(--eixo-green)] transition-colors group-hover:bg-[var(--eixo-green)]/20">
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5-5 5M12 3v12" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">Enviar planilha preenchida</p>
                                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                    Selecione a planilha modelo preenchida (.xlsx, .xls ou .csv).
                                </p>
                            </div>
                        </button>
                        </fieldset>
                    </div>
                )}

                {/* PREVIEW — tabela editável, nada gravado ainda */}
                {(status === 'preview' || status === 'saving') && catalogos && (
                    <div className="px-6 py-5">
                        {origem === 'COMPRA' && (
                            <div className="mb-3 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-xs text-[var(--eixo-text-muted)]">
                                <span className="font-semibold text-[var(--eixo-text)]">Compra de {compra.fornecedor.trim()}</span>
                                {compra.gta.trim() && <> · GTA {compra.gta.trim()}</>}
                                {' · '}{formatarReais(lerValor(compra.valorTotal) ?? 0)}
                                {contagem.total > 0 && <> · {formatarReais((lerValor(compra.valorTotal) ?? 0) / contagem.total)} por animal</>}
                                <span className="mt-1 block">Na compra, todas as linhas precisam estar certas: o valor vai inteiro para o Financeiro.</span>
                            </div>
                        )}
                        <ImportPreviewTable
                            linhas={previewLinhas}
                            catalogos={catalogos}
                            onChange={setPreviewLinhas}
                            disabled={status === 'saving'}
                        />
                    </div>
                )}

                {/* UPLOADING */}
                {status === 'uploading' && (
                    <div className="px-6 py-12 text-center" role="status" aria-live="polite">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--eixo-green)]/10 text-[var(--eixo-green)]">
                            <svg className="h-7 w-7 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                        </div>
                        <p className="mt-4 text-sm font-semibold text-[var(--eixo-text)]">
                            {'Conferindo a planilha…'}
                        </p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{fileName}</p>
                        {(
                            <p className="mt-1 text-xs text-[var(--eixo-text-soft)]">Nenhum animal é criado nesta etapa.</p>
                        )}
                    </div>
                )}

                {/* ERROR (antes mesmo de processar) */}
                {status === 'error' && (
                    <div className="px-6 py-10 text-center" role="alert">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--eixo-danger)]/10 text-[var(--eixo-danger)]">
                            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="mt-4 text-sm font-semibold text-[var(--eixo-text)]">Não foi possível importar</p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{errorMessage}</p>
                        <button
                            type="button"
                            onClick={handleTryAgain}
                            className="mt-4 rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm font-medium text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                        >
                            Tentar novamente
                        </button>
                    </div>
                )}

                {/* DONE — Resumo */}
                {status === 'done' && result && (() => {
                    const isFullFailure = result.criados === 0 && result.erros > 0;
                    const isPartial = result.criados > 0 && result.erros > 0;
                    const toneClass = isFullFailure
                        ? 'bg-[var(--eixo-danger)]/10 text-[var(--eixo-danger)]'
                        : isPartial
                        ? 'bg-[var(--eixo-warning)]/10 text-[var(--eixo-warning)]'
                        : 'bg-[var(--eixo-green)]/10 text-[var(--eixo-green)]';
                    const title = isFullFailure
                        ? 'Importação não realizada'
                        : isPartial
                        ? 'Importação concluída com erros'
                        : 'Importação concluída';
                    return (
                    <div className="px-6 py-5">
                        <div className="text-center">
                            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${toneClass}`}>
                                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isFullFailure ? 'M6 18L18 6M6 6l12 12' : 'M5 13l4 4L19 7'} />
                                </svg>
                            </div>
                            <p className="mt-3 text-base font-semibold text-[var(--eixo-text)]">
                                {title}
                            </p>
                            <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                {fileName} · {result.total} linhas validadas
                            </p>
                            {isFullFailure && (
                                <p className="mt-2 text-xs font-semibold text-[var(--eixo-danger)]">
                                    {origem === 'COMPRA'
                                        ? 'Nenhum animal nem lançamento da compra foi gravado. Na compra, todas as linhas precisam estar certas. Corrija as indicadas e envie novamente.'
                                        : 'Nenhum animal foi criado. Corrija as linhas indicadas e envie novamente.'}
                                </p>
                            )}
                            {isPartial && (
                                <p className="mt-2 text-xs font-semibold text-[var(--eixo-warning)]">As linhas sem erro já foram cadastradas. Corrija as linhas indicadas para completar o restante.</p>
                            )}
                        </div>

                        <div className={`mt-5 grid gap-2 ${result.erros > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Cadastrados</p>
                                <p className="mt-1 text-2xl font-bold text-[var(--eixo-green)]">{result.criados}</p>
                            </div>
                            {result.erros > 0 && (
                                <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3 text-center">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Linhas com erro</p>
                                    <p className="mt-1 text-2xl font-bold text-[var(--eixo-danger)]">{result.erros}</p>
                                </div>
                            )}
                        </div>

                        {result.detalhes?.erros && result.detalhes.erros.length > 0 && (
                            <div className="mt-5">
                                <p className="mb-2 text-xs font-semibold text-[var(--eixo-text-muted)]">Linhas com erro</p>
                                <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--eixo-border)]">
                                    {result.detalhes.erros.map((row, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-start justify-between gap-3 border-b border-[var(--eixo-border)] px-3 py-2 last:border-b-0"
                                        >
                                            <div className="text-xs">
                                                <span className="text-[var(--eixo-text-muted)]">Linha {row.line}</span>
                                                {row.identificacao && (
                                                    <span className="text-[var(--eixo-text)]"> · {row.identificacao}</span>
                                                )}
                                            </div>
                                            <span className="text-right text-xs text-[var(--eixo-danger)]">
                                                {(row.motivos || []).join(' · ')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {downloadMessage && (
                            <p className={`mt-3 text-center text-xs font-semibold ${downloadMessage.startsWith('Não') ? 'text-[var(--eixo-danger)]' : 'text-[var(--eixo-text-muted)]'}`} role="status" aria-live="polite">
                                {downloadMessage}
                            </p>
                        )}
                    </div>
                    );
                })()}

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--eixo-border)] px-6 py-4">
                    {status === 'preview' && contagem.erro > 0 && (
                        <p className={`mr-auto text-xs ${origem === 'COMPRA' ? 'font-semibold text-[var(--eixo-danger)]' : 'text-[var(--eixo-text-muted)]'}`}>
                            {origem === 'COMPRA'
                                ? `Corrija ${contagem.erro === 1 ? 'a linha com erro' : `as ${contagem.erro} linhas com erro`} para gravar a compra.`
                                : contagem.erro === 1
                                ? '1 linha com erro fica de fora.'
                                : `${contagem.erro} linhas com erro ficam de fora.`}
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={status === 'preview' ? handleVoltarParaArquivo : handleClose}
                        disabled={status === 'uploading' || status === 'saving'}
                        className="flex flex-col items-center rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm font-medium text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <span>{status === 'preview' ? 'Trocar arquivo' : 'Fechar'}</span>
                        {status === 'preview' && (
                            <span className="text-[10px] font-normal leading-tight text-[var(--eixo-text-muted)]/70">
                                descarta esta planilha
                            </span>
                        )}
                    </button>
                    {(status === 'preview' || status === 'saving') && (
                        <button
                            type="button"
                            onClick={handleConfirmarImportacao}
                            disabled={status === 'saving' || contagem.prontos + contagem.revisao === 0 || (origem === 'COMPRA' && contagem.erro > 0)}
                            className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {status === 'saving'
                                ? 'Gravando…'
                                : contagem.prontos + contagem.revisao === 1
                                ? 'Importar 1 animal'
                                : `Importar ${contagem.prontos + contagem.revisao} animais`}
                        </button>
                    )}
                    {status === 'done' && result && result.erros > 0 && (
                        <button
                            type="button"
                            onClick={handleDownloadErrors}
                            disabled={isDownloadingErrors}
                            className="flex items-center gap-2 rounded-xl border border-[var(--eixo-danger)]/40 bg-[var(--eixo-danger)]/10 px-4 py-2 text-sm font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[var(--eixo-danger)]/20 disabled:cursor-wait disabled:opacity-60"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            {isDownloadingErrors ? 'Gerando planilha…' : 'Baixar planilha completa para correção'}
                        </button>
                    )}
                    {status === 'done' && result && result.erros > 0 && (
                        <button
                            type="button"
                            onClick={handlePickCorrectedFile}
                            className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                        >
                            Selecionar planilha corrigida
                        </button>
                    )}
                    {status === 'done' && result && result.criados > 0 && (
                        <button
                            type="button"
                            onClick={handleSeeAnimals}
                            className="rounded-xl bg-[var(--eixo-green)] px-4 py-2 text-sm font-bold text-[#1a1a1a] transition-colors hover:bg-[var(--eixo-green-dark)]"
                        >
                            Ver animais cadastrados
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportHerdModal;
