import React from 'react';

interface UpgradeScreenProps {
    moduleName: string;
    icon: React.ReactNode;
    tagline: string;
    benefits: string[];
    requiredPlan: string;
    previewItems: string[];
    onUpgrade: () => void;
}

const UpgradeScreen: React.FC<UpgradeScreenProps> = ({
    moduleName,
    icon,
    tagline,
    benefits,
    requiredPlan,
    previewItems,
    onUpgrade,
}) => {
    return (
        <div className="grid h-full gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <section className="rounded-[24px] border border-[#d7cab3] bg-[#fffaf1] p-6 lg:p-8">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#f0d5ca] bg-[#faeee8] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a2a14]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#a8442a]" />
                    Desbloqueie no plano {requiredPlan}
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#d7cab3] bg-white text-[#6d6558]">
                        {icon}
                    </div>
                    <div>
                        <h1 className="font-brand text-2xl font-extrabold text-[#2f3a2d]">{moduleName}</h1>
                        <p className="mt-1 text-sm text-[#6d6558]">{tagline}</p>
                    </div>
                </div>

                <div className="mt-8 space-y-3">
                    {benefits.map((benefit) => (
                        <div
                            key={benefit}
                            className="flex items-start gap-3 rounded-2xl border border-[#d7cab3] bg-white px-4 py-3"
                        >
                            <span className="mt-1 h-2 w-2 rounded-full bg-[#a8442a]" />
                            <p className="text-sm leading-relaxed text-[#6d6558]">{benefit}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={onUpgrade}
                        className="inline-flex items-center rounded-2xl bg-[#a8442a] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#8f7144]"
                    >
                        Fazer upgrade
                    </button>
                    <p className="text-sm text-[#6d6558]">Libere esse módulo sem sair da operação da fazenda.</p>
                </div>
            </section>

            <aside className="rounded-[24px] border border-[#d7cab3] bg-white p-6">
                <div className="rounded-[20px] border border-[#e7e5e4] bg-[#f1e7d8] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#74644e]">Prévia do módulo</p>
                    <div className="mt-4 space-y-3">
                        {previewItems.map((item, index) => (
                            <div
                                key={`${moduleName}-${item}`}
                                className={`rounded-2xl border border-white/80 bg-white/80 px-4 py-3 backdrop-blur-sm ${
                                    index === 0 ? 'blur-[0.2px]' : 'blur-[0.6px]'
                                }`}
                            >
                                <div className="mb-2 h-2.5 w-24 rounded-full bg-[#d7cab3]" />
                                <div className="h-3 w-full rounded-full bg-[#ede3d0]" />
                                <div className="mt-2 h-3 w-4/5 rounded-full bg-[#ede3d0]" />
                                <p className="mt-3 text-sm font-medium text-[#6d6558]">{item}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>
        </div>
    );
};

export default UpgradeScreen;
