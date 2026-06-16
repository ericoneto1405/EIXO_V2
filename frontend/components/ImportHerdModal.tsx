import React from 'react';

interface ImportHerdModalProps {
    open: boolean;
    onClose: () => void;
    onDownloadTemplate: () => void | Promise<void>;
}

const ImportHerdModal: React.FC<ImportHerdModalProps> = ({ open, onClose, onDownloadTemplate }) => {
    if (!open) return null;

    const handleDownload = async () => {
        try {
            await onDownloadTemplate();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={onClose}
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
                            Baixe o modelo, preencha e envie a planilha.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)] hover:text-[var(--eixo-green)]"
                        aria-label="Fechar"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Cards */}
                <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
                    {/* Card 1 — Baixar modelo */}
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

                    {/* Card 2 — Enviar planilha (em breve) */}
                    <div
                        className="relative flex cursor-not-allowed flex-col items-start gap-3 rounded-2xl border border-dashed border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)]/50 p-4 text-left opacity-70"
                        aria-disabled="true"
                    >
                        <span className="absolute right-3 top-3 rounded-full bg-[var(--eixo-green)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--eixo-green)]">
                            Em breve
                        </span>
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--eixo-surface)] text-[var(--eixo-text-muted)]">
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M17 8l-5-5-5 5M12 3v12" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-[var(--eixo-text)]">Enviar planilha preenchida</p>
                            <p className="mt-1 text-xs text-[var(--eixo-text-muted)]">
                                Envie o modelo preenchido. Disponível em breve.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end border-t border-[var(--eixo-border)] px-6 py-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-4 py-2 text-sm font-medium text-[var(--eixo-text-muted)] transition-colors hover:bg-[var(--eixo-surface-soft)]"
                    >
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportHerdModal;
