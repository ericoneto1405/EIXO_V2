import React from 'react';

type CoverageStatus = 'Conectado' | 'Parcial' | 'Backend only';

type DomainItem = {
    name: string;
    routes: string[];
    status: CoverageStatus;
    notes: string;
};

type DomainGroup = {
    title: string;
    items: DomainItem[];
};

const groups: DomainGroup[] = [
    {
        title: 'Base',
        items: [
            { name: 'Autenticação e sessão', routes: ['/auth/login', '/auth/me', '/auth/logout'], status: 'Conectado', notes: 'Login e sessão já usados pelo frontend.' },
            { name: 'Usuários', routes: ['/users'], status: 'Conectado', notes: 'Cadastro administrativo já existe no shell atual.' },
            { name: 'Fazendas e pastos', routes: ['/farms', '/pastos'], status: 'Conectado', notes: 'Fluxo principal já consome esses domínios.' },
        ],
    },
    {
        title: 'Rebanho e genética',
        items: [
            { name: 'Rebanho comercial', routes: ['/animals', '/lots', '/animals/:id/pesagens', '/animals/:id/paddock-moves'], status: 'Conectado', notes: 'Casca antiga já consome esse domínio.' },
            { name: 'Plantel P.O.', routes: ['/po/animals', '/po/lots', '/po/semen', '/po/embryos'], status: 'Conectado', notes: 'Tela de plantel P.O. já conversa com animais, sêmen e embriões.' },
            { name: 'Reprodução e estações', routes: ['/seasons', '/repro-events', '/animals/:id/repro-kpis'], status: 'Conectado', notes: 'Módulo de reprodução já usa as rotas centrais.' },
            { name: 'Seleção e relatórios genéticos', routes: ['/genetics/selection', '/genetics/selection/decisions', '/genetics/reports/summary'], status: 'Conectado', notes: 'Seleção e relatórios já estão na navegação.' },
        ],
    },
    {
        title: 'Nutrição e operação',
        items: [
            { name: 'Nutrição modular', routes: ['/nutrition/module/*'], status: 'Conectado', notes: 'Backend estava pronto e a casca antiga agora expõe o módulo.' },
            { name: 'Plano nutricional atual', routes: ['/nutrition/assignments/current'], status: 'Parcial', notes: 'Backend exposto; usado por telas pontuais e passível de expansão.' },
            { name: 'Movimentações de pasto', routes: ['/animals/:id/move-pasto', '/po/animals/:id/move-pasto'], status: 'Parcial', notes: 'Backoffice já usa parte disso dentro dos módulos de rebanho.' },
        ],
    },
    {
        title: 'Financeiro e áreas pendentes',
        items: [
            { name: 'Financeiro estrutural', routes: ['schema financeiro + endpoints do domínio'], status: 'Parcial', notes: 'Casca antiga ainda mostra telas simples; precisa aprofundar a UI final.' },
            { name: 'Operações externas / feedlot / integrações', routes: ['ExternalOperation*', 'Feedlot*', 'ScaleIntegrationConfig', 'ScaleWeighingSession'], status: 'Backend only', notes: 'Há sinais dessas estruturas no backend/schema, sem navegação dedicada nesta casca.' },
            { name: 'Logs, auditoria complementar e onboarding', routes: ['ActivityLog', 'BillingEvent', 'SignupOtpChallenge'], status: 'Backend only', notes: 'Estrutura viva no backend, sem tela operacional nesta casca.' },
        ],
    },
];

const statusClasses: Record<CoverageStatus, string> = {
    Conectado: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Parcial: 'bg-amber-100 text-amber-700 border-amber-200',
    'Backend only': 'bg-slate-100 text-slate-700 border-slate-200',
};

const SystemCoverage: React.FC = () => (
    <div className="space-y-6">
        <div className="rounded-2xl border border-[#d8d2c7] bg-[#fffdf8] p-6 shadow-sm">
            <h1 className="text-2xl font-semibold text-[#28352c]">Mapa do sistema atual</h1>
            <p className="mt-2 text-sm text-[#6b7280]">
                Esta tela usa a casca antiga para mostrar o que o backend atual do EIXO já possui, o que já está
                conectado ao frontend e o que ainda existe apenas no servidor.
            </p>
        </div>

        {groups.map((group) => (
            <section key={group.title} className="rounded-2xl border border-[#d8d2c7] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-[#28352c]">{group.title}</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((item) => (
                        <article key={item.name} className="rounded-2xl border border-[#e7e0d5] bg-[#fffdf8] p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <h3 className="text-base font-semibold text-[#28352c]">{item.name}</h3>
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[item.status]}`}>
                                    {item.status}
                                </span>
                            </div>
                            <p className="mt-2 text-sm text-[#6b7280]">{item.notes}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {item.routes.map((route) => (
                                    <code key={route} className="rounded-lg bg-[#f3efe7] px-2 py-1 text-[11px] text-[#4b5563]">
                                        {route}
                                    </code>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        ))}
    </div>
);

export default SystemCoverage;
