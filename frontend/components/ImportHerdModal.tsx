import React, { useRef, useState } from 'react';
import { buildApiUrl } from '../api';

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
    };
}

interface ImportHerdModalProps {
    open: boolean;
    onClose: () => void;
    onDownloadTemplate: () => void | Promise<void>;
    farmId?: string | null;
    onSuccess?: () => void;
}

const ImportHerdModal: React.FC<ImportHerdModalProps> = ({
    open,
    onClose,
    onDownloadTemplate,
    farmId,
    onSuccess,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [status, setStatus] = useState<Status>('idle');
    const [fileName, setFileName] = useState<string>('');
    const [result, setResult] = useState<UploadResult | null>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');

    if (!open) return null;

    const reset = () => {
        setStatus('idle');
        setFileName('');
        setResult(null);
        setErrorMessage('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        reset();
        onClose();
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
        setFileName(file.name);
        setStatus('uploading');
        setErrorMessage('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('farmId', farmId);
            const res = await fetch(buildApiUrl('/herd/import/upload'), {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
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
        try {
            const res = await fetch(buildApiUrl('/herd/import/erros-xlsx'), {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ erros }),
            });
            if (!res.ok) throw new Error('Erro ao gerar planilha de erros');
            const blob = await res.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'EIXO - Linhas com erro.xlsx';
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={handleClose}
        >
            <div
                className="relative w-full max-w-xl rounded-3xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--eixo-border)] px-6 py-4">
                    <div>
                        <h3 className="text-base font-bold text-[var(--eixo-text)]">Importar Rebanho</h3>
                        <p className="mt-0.5 text-xs text-[var(--eixo-text-muted)]">
                            {status === 'done'
                                ? 'Importação concluída.'
                                : status === 'uploading'
                                ? 'Processando planilha…'
                                : 'Baixe o modelo, preencha e envie a planilha.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-lg p-1 text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-green)]"
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
                                    Selecione o arquivo .xlsx, .xls ou .csv preenchido.
                                </p>
                            </div>
                        </button>
                    </div>
                )}

                {/* UPLOADING */}
                {status === 'uploading' && (
                    <div className="px-6 py-12 text-center">
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
                    <div className="px-6 py-10 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--eixo-danger)]/10 text-[var(--eixo-danger)]">
                            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <p className="mt-4 text-sm font-semibold text-[var(--eixo-text)]">Não foi possível importar</p>
                        <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">{errorMessage}</p>
                        <button
                            type="button"
                            onClick={reset}
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
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--eixo-green)]/10 text-[var(--eixo-green)]">
                                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <p className="mt-3 text-base font-semibold text-[var(--eixo-text)]">Importação concluída</p>
                            <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                {fileName} · {result.total} linhas processadas
                            </p>
                        </div>

                        <div className="mt-5 grid grid-cols-3 gap-2">
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Transferidos</p>
                                <p className="mt-1 text-2xl font-bold text-[var(--eixo-green)]">{result.criados}</p>
                            </div>
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Já existiam</p>
                                <p className="mt-1 text-2xl font-bold text-[var(--eixo-text-muted)]">{result.ignorados}</p>
                            </div>
                            <div className="rounded-xl bg-[var(--eixo-surface-soft)] p-3 text-center">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--eixo-text-muted)]">Erros</p>
                                <p className="mt-1 text-2xl font-bold text-[var(--eixo-danger)]">{result.erros}</p>
                            </div>
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
                    </div>
                )}

                {/* Footer */}
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--eixo-border)] px-6 py-4">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm font-medium text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                    >
                        Fechar
                    </button>
                    {status === 'done' && result && result.erros > 0 && (
                        <button
                            type="button"
                            onClick={handleDownloadErrors}
                            className="flex items-center gap-2 rounded-xl border border-[var(--eixo-danger)]/40 bg-[var(--eixo-danger)]/10 px-4 py-2 text-sm font-semibold text-[var(--eixo-danger)] transition-colors hover:bg-[var(--eixo-danger)]/20"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                            </svg>
                            Baixar planilha com erros
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
