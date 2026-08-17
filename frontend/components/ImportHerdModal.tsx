import React, { useRef, useState } from 'react';
import { buildApiUrl } from '../api';
import type { HerdType } from '../adapters/herdApi';
import type { Lot, Paddock } from '../types';

type Status = 'idle' | 'uploading' | 'done' | 'error';

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

    if (!open) return null;

    const reset = () => {
        setStatus('idle');
        setFileName('');
        setResult(null);
        setErrorMessage('');
        setPaddockId('');
        setLotId('');
        setIsDownloadingErrors(false);
        setDownloadMessage('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        if (status === 'uploading') return;
        reset();
        onClose();
    };

    const handleTryAgain = () => {
        setStatus('idle');
        setFileName('');
        setResult(null);
        setErrorMessage('');
        setDownloadMessage('');
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
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !farmId) return;
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
            setErrorMessage('Use a planilha modelo oficial no formato .xlsx.');
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
            const uploadPath = herdType === 'PO' ? '/po/herd/import/upload' : '/herd/import/upload';
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
            setResult(data as UploadResult);
            setStatus('done');
        } catch (err) {
            console.error(err);
            setErrorMessage('Erro de rede ao enviar planilha.');
            setStatus('error');
        }
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
            const errorsPath = herdType === 'PO' ? '/po/herd/import/erros-xlsx' : '/herd/import/erros-xlsx';
            const res = await fetch(buildApiUrl(errorsPath), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ erros, linhasCorrecao: result?.detalhes?.linhasCorrecao }),
            });
            if (!res.ok) throw new Error('Erro ao gerar planilha de erros');
            const blob = await res.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `[EIXO] ${farmName || 'Fazenda'} - Planilha completa para correção.xlsx`;
            link.click();
            URL.revokeObjectURL(link.href);
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
                className="relative max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-4">
                    <div>
                        <h3 id="import-herd-title" className="text-base font-bold text-[var(--eixo-text)]">Importar planilha</h3>
                        <p className="mt-0.5 text-xs text-[var(--eixo-text-muted)]">
                            {status === 'done'
                                ? result?.erros ? 'Arquivo validado com erros. Nenhum animal foi criado.' : 'Importação concluída.'
                                : status === 'uploading'
                                ? 'Processando planilha…'
                                : 'Baixe o modelo, preencha e envie a planilha.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={status === 'uploading'}
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
                    accept=".xlsx"
                    className="hidden"
                    onChange={handleFileChange}
                />

                {/* IDLE — 2 cards */}
                {status === 'idle' && (
                    <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
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
                                {paddocks.length === 0 && (
                                    <p className="mt-2 text-xs font-semibold text-[var(--eixo-text-muted)]">
                                        Nenhum pasto cadastrado nesta fazenda. No Plantel P.O., o pasto é obrigatório para concluir a importação.
                                    </p>
                                )}
                        </div>
                        <button
                            type="button"
                            onClick={handleDownload}
                            className="group flex flex-col items-start gap-3 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4 text-left transition-all hover:border-[var(--eixo-green)] hover:bg-[var(--eixo-surface)]"
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--eixo-green)]/10 text-[var(--eixo-green)] transition-colors group-hover:bg-[var(--eixo-green)]/20">
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
                            className="group flex flex-col items-start gap-3 rounded-2xl border-2 border-[var(--eixo-green)] bg-[var(--eixo-surface)] p-4 text-left transition-all hover:bg-[var(--eixo-green)]/5"
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--eixo-green)]/10 text-[var(--eixo-green)]">
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5-5 5M12 3v12" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-[var(--eixo-text)]">Enviar planilha preenchida</p>
                                <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                    Selecione a planilha modelo preenchida no formato .xlsx.
                                </p>
                            </div>
                        </button>
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
                        <p className="mt-4 text-sm font-semibold text-[var(--eixo-text)]">Processando planilha…</p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{fileName}</p>
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
                {status === 'done' && result && (
                    <div className="px-6 py-5">
                        <div className="text-center">
                            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${result.erros > 0 ? 'bg-[var(--eixo-danger)]/10 text-[var(--eixo-danger)]' : 'bg-[var(--eixo-green)]/10 text-[var(--eixo-green)]'}`}>
                                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={result.erros > 0 ? 'M6 18L18 6M6 6l12 12' : 'M5 13l4 4L19 7'} />
                                </svg>
                            </div>
                            <p className="mt-3 text-base font-semibold text-[var(--eixo-text)]">
                                {result.erros > 0 ? 'Importação não realizada' : 'Importação concluída'}
                            </p>
                            <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                {fileName} · {result.total} linhas validadas
                            </p>
                            {result.erros > 0 && (
                                <p className="mt-2 text-xs font-semibold text-[var(--eixo-danger)]">Nenhum animal foi criado. Corrija todas as linhas e envie novamente.</p>
                            )}
                        </div>

                        <div className={`mt-5 grid gap-2 ${result.erros > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">{result.erros > 0 ? 'Linhas validadas' : 'Cadastrados'}</p>
                                <p className="mt-1 text-2xl font-bold text-[var(--eixo-green)]">{result.erros > 0 ? result.total : result.criados}</p>
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
                )}

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--eixo-border)] px-6 py-4">
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={status === 'uploading'}
                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm font-medium text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Fechar
                    </button>
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
                            Enviar planilha corrigida
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
