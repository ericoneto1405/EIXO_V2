// Abra /tests/firstSteps.html no servidor de desenvolvimento. Nenhuma API real é chamada.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ModuleProgressCard from '../components/ModuleProgressCard';
import OnboardingChecklist from '../components/OnboardingChecklist';
import FinanceModule from '../components/FinanceModule';
import DreTab from '../components/finance/DreTab';
import { financialResultKey, initialDoneKey } from '../components/progressGuideState';
import type { Farm } from '../types';
import '../src/index.css';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const container = document.getElementById('fixture')!;
const output = document.getElementById('results')!;
let root = createRoot(container);
const userId = 'progress-regression-user';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let intercept: (url: URL, init?: RequestInit) => Response | Promise<Response>;
let calls: { url: URL; init?: RequestInit }[] = [];
window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    calls.push({ url, init });
    return intercept(url, init);
};
const report = { consolidated: { operatingRevenue: 1, productionCost: 0, grossMargin: 1, operatingExpense: 0, operatingResult: 1, financialResult: 0, otherResult: 0, managementResult: 1 }, byFarm: [], reliableSince: null };
const defaults = (url: URL) => {
    if (url.pathname.endsWith('/animals')) return response({ animals: [] });
    if (url.pathname.endsWith('/weighings')) return response({ total: 0, weighings: [] });
    if (url.pathname.endsWith('/field-occurrences')) return response({ occurrences: [], total: 0 });
    if (url.pathname.endsWith('/transactions')) return response({ transactions: [] });
    if (url.pathname.endsWith('/income-statement')) return response(report);
    return response({ categories: [], report, ok: true });
};
const text = () => container.innerText || '';
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const render = async (element: React.ReactNode, expand = true) => {
    await act(async () => root.render(element));
    await flush();
    if (expand && button('Abrir guia')) await click('Abrir guia');
};
const button = (label: string) => Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.trim() === label && node.getClientRects().length > 0)!;
const click = async (label: string) => { assert(button(label), `Botão ausente: ${label}`); await act(async () => button(label).click()); await flush(); };
const moduleProps = { userId, activeView: 'Nutrição', farmId: 'farm-a', farmName: 'Fazenda A', canViewFinancialResult: true, canEditAnimals: true, canNavigateHerd: true, onNavigate: () => {}, onFinanceAction: () => {} };
const farms = [{ id: 'farm-a', name: 'Fazenda A', paddocks: [{ id: 'pasto-a' }] }, { id: 'farm-b', name: 'Fazenda B', paddocks: [] }] as Farm[];
const initialProps = { userId, farmId: 'farm-a', farms, onNavigate: () => {}, canEditAnimals: true, canNavigateHerd: true, canManageFarms: true };
const dreProps = { userId, farmId: 'farm-a', selectedAnoAnual: 2026, setSelectedAnoAnual: () => {}, anos: [2026] };
const complete = (url: URL) => {
    if (url.pathname.endsWith('/animals')) return response({ animals: [{ id: 'animal-a', farmId: 'farm-a', tipoCadastro: 'COMERCIAL' }] });
    if (url.pathname.endsWith('/weighings')) return response({ total: 1, weighings: [{}] });
    return defaults(url);
};
let passed = 0;
const failures: string[] = [];
async function test(name: string, run: () => Promise<void>) {
    await act(async () => root.unmount());
    root = createRoot(container);
    // Limpa somente preferências de fixtures, nunca dados de usuários reais.
    for (const key of Object.keys(localStorage)) if (key.includes(userId) || key === 'eixo_module_done_farm-a_Nutrição') localStorage.removeItem(key);
    intercept = defaults;
    calls = [];
    try { await run(); passed++; output.textContent += `\n✓ ${name}`; }
    catch (error) { failures.push(`${name}: ${(error as Error).message}`); output.textContent += `\n✗ ${failures.at(-1)}`; }
}

async function run() {
    output.textContent = '';
    await test('fazenda vazia e ações de cadastro', async () => {
        let navigation: unknown;
        await render(<ModuleProgressCard {...moduleProps} onNavigate={(...args) => { navigation = args; }} />);
        assert(text().includes('1 de 3 concluídos'), 'Contagem inicial incorreta');
        await click('Cadastrar animais');
        assert(JSON.stringify(navigation).includes('openAnimalForm'), 'Não abriu cadastro manual');
    });
    await test('sem fazenda não oferece lançamento financeiro', async () => {
        await render(<ModuleProgressCard {...moduleProps} activeView="Financeiro" farmId={null} farmName={null} />);
        assert(!button('Registrar despesa') && calls.length === 0, 'Ação/consulta sem fazenda');
    });
    await test('falha HTTP não vira zero e permite tentar novamente', async () => {
        intercept = () => response({}, 403);
        await render(<ModuleProgressCard {...moduleProps} />);
        assert(text().includes('Não foi possível verificar') && !text().includes('1 de 3'), 'Erro confundido com progresso');
        intercept = defaults;
        await click('Tentar novamente');
        assert(text().includes('1 de 3 concluídos'), 'Não recuperou');
    });
    await test('falha de rede preserva último progresso válido', async () => {
        intercept = complete;
        await render(<ModuleProgressCard {...moduleProps} />);
        intercept = () => Promise.reject(new Error('offline'));
        await act(async () => window.dispatchEvent(new Event('eixo:herd-onboarding-progress-changed')));
        await flush();
        assert(text().includes('3 de 3 concluídos') && text().includes('últimos dados verificados'), 'Último dado foi perdido');
    });
    await test('troca rápida de fazenda descarta resposta atrasada', async () => {
        let release!: (value: Response) => void;
        intercept = (url) => url.pathname.endsWith('/animals') && url.searchParams.get('farmId') === 'farm-a' ? new Promise((resolve) => { release = resolve; }) : defaults(url);
        await render(<ModuleProgressCard {...moduleProps} />);
        await render(<ModuleProgressCard {...moduleProps} farmId="farm-b" farmName="Fazenda B" />);
        await act(async () => release(response({ animals: [{ id: 'late' }] })));
        await flush();
        assert(text().includes('Fazenda B') && text().includes('1 de 3 concluídos'), 'Resposta da fazenda anterior apareceu');
    });
    await test('fechar, reabrir e remontar sem concluir módulo', async () => {
        await render(<ModuleProgressCard {...moduleProps} />);
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label^="Recolher"]')!.click());
        await flush();
        assert(document.activeElement === button('Abrir guia'), 'Foco perdido ao recolher');
        await render(null);
        await render(<ModuleProgressCard {...moduleProps} />, false);
        assert(button('Abrir guia'), 'Dispensa não persistiu');
        await click('Abrir guia');
        assert(text().includes('1 de 3 concluídos'), 'Reabrir concluiu o módulo');
        await render(<ModuleProgressCard {...moduleProps} farmId="farm-b" farmName="Fazenda B" />);
        assert(!button('Abrir guia'), 'Dispensa vazou para outra fazenda');
    });
    await test('marca antiga de conclusão do módulo é ignorada', async () => {
        localStorage.setItem('eixo_module_done_farm-a_Nutrição', '1');
        await render(<ModuleProgressCard {...moduleProps} />);
        assert(text().includes('1 de 3 concluídos'), 'Marca antiga impediu consulta');
    });
    await test('Genetics e Reprodução não exigem P.O.', async () => {
        intercept = complete;
        for (const activeView of ['Eixo Genetics', 'Reprodução', 'Eixo Acasalamento']) {
            await render(<ModuleProgressCard {...moduleProps} activeView={activeView} />);
            assert(container.querySelector('section')?.getAttribute('aria-label') === `Primeiros passos — ${activeView}` && text().includes('2 de 2 concluídos'), 'Título ou exigência incorretos');
        }
    });
    await test('primeira ocorrência conclui somente recebimento', async () => {
        intercept = (url) => url.pathname.endsWith('/field-occurrences') ? response({ occurrences: [{ farmId: 'farm-a', status: 'PENDENTE' }] }) : defaults(url);
        await render(<ModuleProgressCard {...moduleProps} activeView="Ocorrências do EIXO Campo" />);
        assert(text().includes('2 de 2 concluídos') && !text().includes('Iniciar rotina'), 'Análise fictícia permanece');
    });
    await test('financeiro atualiza após novo lançamento', async () => {
        await render(<ModuleProgressCard {...moduleProps} activeView="Financeiro" />);
        intercept = (url) => url.pathname.endsWith('/transactions') ? response({ transactions: [{ type: 'SAIDA' }, { type: 'ENTRADA' }] }) : defaults(url);
        await act(async () => window.dispatchEvent(new Event('eixo:financial-transactions-changed')));
        await flush();
        assert(text().includes('3 de 4 concluídos') && button('Ver resultado financeiro'), 'Lançamentos não atualizaram');
    });
    await test('DRE indisponível no plano não entra na contagem', async () => {
        intercept = (url) => url.pathname.endsWith('/transactions') ? response({ transactions: [{ type: 'SAIDA' }, { type: 'ENTRADA' }] }) : defaults(url);
        await render(<ModuleProgressCard {...moduleProps} activeView="Financeiro" canViewFinancialResult={false} />);
        await act(async () => container.querySelector<HTMLElement>('summary')!.click());
        await flush();
        assert(text().includes('3 de 3 concluídos') && text().includes('Recursos indisponíveis no plano') && container.querySelectorAll('ol li').length === 3 && !button('Ver resultado financeiro'), 'Etapa bloqueada continua obrigatória');
    });
    await test('clique no atalho não marca DRE consultado', async () => {
        intercept = (url) => url.pathname.endsWith('/transactions') ? response({ transactions: [{ type: 'SAIDA' }, { type: 'ENTRADA' }] }) : defaults(url);
        await render(<ModuleProgressCard {...moduleProps} activeView="Financeiro" />);
        await click('Ver resultado financeiro');
        assert(localStorage.getItem(financialResultKey(userId, 'farm-a')) !== '1', 'Clique marcou conclusão');
    });
    await test('DRE só marca após resposta bem-sucedida', async () => {
        intercept = () => response({}, 403);
        await render(<DreTab {...dreProps} />);
        assert(localStorage.getItem(financialResultKey(userId, 'farm-a')) !== '1', 'Erro marcou conclusão');
        await render(null);
        intercept = defaults;
        await render(<DreTab {...dreProps} />);
        assert(localStorage.getItem(financialResultKey(userId, 'farm-a')) === '1', 'Sucesso não marcou conclusão');
    });
    await test('DRE descarta resposta atrasada e consolidação não conclui fazenda', async () => {
        let release!: (value: Response) => void;
        intercept = (url) => url.searchParams.get('farmId') === 'farm-a' ? new Promise((resolve) => { release = resolve; }) : defaults(url);
        await render(<DreTab {...dreProps} />);
        await click('Consolidar organização');
        await act(async () => release(response(report)));
        await flush();
        assert(localStorage.getItem(financialResultKey(userId, 'farm-a')) !== '1', 'Resposta antiga/consolidada marcou fazenda');
    });
    await test('DRE pode ser consultado pela aba normal do Financeiro', async () => {
        await render(<FinanceModule userId={userId} farmId="farm-a" />);
        await click('Resultado da operação');
        assert(localStorage.getItem(financialResultKey(userId, 'farm-a')) === '1', 'Aba normal não concluiu');
    });
    await test('atalho do DRE respeita o plano no destino', async () => {
        let upgrades = 0;
        await render(<FinanceModule userId={userId} farmId="farm-a" isFreePlan onboardingAction={{ action: 'RESULTADO', nonce: 1 }} onUpgradeRequest={() => upgrades++} />);
        assert(upgrades > 0 && !calls.some(({ url }) => url.pathname.endsWith('/income-statement')), 'Atalho acessou DRE bloqueado');
    });
    await test('guia inicial permite cadastro manual e importação conforme acesso', async () => {
        await render(<OnboardingChecklist {...initialProps} />);
        assert(button('Cadastrar animais') && button('Importar animais'), 'Ações incompletas');
        await render(<OnboardingChecklist {...initialProps} canEditAnimals={false} />);
        assert(!button('Cadastrar animais') && !button('Importar animais'), 'Ação sem permissão');
    });
    await test('conclusão inicial é explícita e recupera falha de gravação', async () => {
        intercept = (url) => url.pathname.endsWith('/onboarding') ? response({}, 500) : complete(url);
        await render(<OnboardingChecklist {...initialProps} />);
        assert(button('Concluir primeiros passos') && !calls.some(({ init }) => init?.method === 'PATCH'), 'Concluiu automaticamente');
        await click('Concluir primeiros passos');
        assert(text().includes('passos foram preservados') && localStorage.getItem(initialDoneKey(userId)) !== '1', 'Falha gravou marca local');
        intercept = complete;
        await click('Tentar salvar conclusão novamente');
        assert(!text().includes('Primeiros passos') && localStorage.getItem(initialDoneKey(userId)) === '1', 'Confirmação não persistiu');
        await render(null);
        await render(<OnboardingChecklist {...initialProps} farmId="farm-b" />);
        assert(!text().includes('Primeiros passos'), 'Conclusão deixou de valer por usuário');
    });
    await test('guia inicial descarta resposta anterior após troca de fazenda', async () => {
        let release!: (value: Response) => void;
        intercept = (url) => url.pathname.endsWith('/animals') && url.searchParams.get('farmId') === 'farm-a' ? new Promise((resolve) => { release = resolve; }) : defaults(url);
        await render(<OnboardingChecklist {...initialProps} />);
        await render(<OnboardingChecklist {...initialProps} farmId="farm-b" />);
        await act(async () => release(response({ animals: [{ id: 'late' }] })));
        await flush();
        assert(text().includes('1 de 4 concluídos') && !button('Concluir primeiros passos'), 'Resposta anterior concluiu guia');
    });
    await test('troca de módulo não reutiliza métricas anteriores', async () => {
        let release!: (value: Response) => void;
        intercept = (url) => url.pathname.endsWith('/animals') ? new Promise((resolve) => { release = resolve; }) : defaults(url);
        await render(<ModuleProgressCard {...moduleProps} />);
        await render(<ModuleProgressCard {...moduleProps} activeView="Financeiro" />);
        await act(async () => release(response({ animals: [{ id: 'late' }] })));
        await flush();
        assert(container.querySelector('section')?.getAttribute('aria-label') === 'Primeiros passos — Financeiro' && text().includes('1 de 4 concluídos'), 'Métricas do módulo anterior apareceram');
    });
    await test('preferências e consulta ao DRE não vazam para outro usuário', async () => {
        localStorage.setItem(financialResultKey(userId, 'farm-a'), '1');
        intercept = (url) => url.pathname.endsWith('/transactions') ? response({ transactions: [{ type: 'SAIDA' }, { type: 'ENTRADA' }] }) : defaults(url);
        await render(<ModuleProgressCard {...moduleProps} activeView="Financeiro" />);
        assert(text().includes('4 de 4 concluídos'), 'Consulta do usuário não foi lida');
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label^="Recolher"]')!.click());
        await render(<ModuleProgressCard {...moduleProps} activeView="Financeiro" userId={`${userId}-other`} />);
        assert(text().includes('3 de 4 concluídos') && button('Ver resultado financeiro'), 'Estado vazou para outro usuário');
    });
    await test('DRE trocado de fazenda não confirma resposta antiga', async () => {
        let release!: (value: Response) => void;
        intercept = (url) => url.searchParams.get('farmId') === 'farm-a' ? new Promise((resolve) => { release = resolve; }) : defaults(url);
        await render(<DreTab {...dreProps} />);
        await render(<DreTab {...dreProps} farmId="farm-b" />);
        await act(async () => release(response(report)));
        await flush();
        assert(localStorage.getItem(financialResultKey(userId, 'farm-a')) !== '1' && localStorage.getItem(financialResultKey(userId, 'farm-b')) === '1', 'Conclusão vinculada à fazenda errada');
    });
    await test('conclusão inicial impede envio duplicado enquanto aguarda servidor', async () => {
        let release!: (value: Response) => void;
        intercept = (url) => url.pathname.endsWith('/onboarding') ? new Promise((resolve) => { release = resolve; }) : complete(url);
        await render(<OnboardingChecklist {...initialProps} />);
        await act(async () => { button('Concluir primeiros passos').click(); button('Concluir primeiros passos').click(); });
        assert(calls.filter(({ init }) => init?.method === 'PATCH').length === 1 && !localStorage.getItem(initialDoneKey(userId)), 'Envio duplicado ou confirmação prematura');
        await act(async () => release(response({ ok: true })));
        await flush();
        assert(localStorage.getItem(initialDoneKey(userId)) === '1', 'Confirmação final ausente');
    });
    await test('resumo inicial mantém fazenda e contagem, sem ações de tarefa', async () => {
        await render(<ModuleProgressCard {...moduleProps} />, false);
        assert(button('Abrir guia') && text().includes('Fazenda A') && text().includes('1 de 3 concluídos'), 'Resumo incompleto');
        assert(!button('Cadastrar animais') && !text().includes('Registrar a primeira pesagem'), 'Tarefas apareceram recolhidas');
        assert(calls.some(({ url }) => url.pathname.endsWith('/animals')), 'Resumo não consultou progresso');
    });
    await test('preferência explícita aberta e recolhida é preservada', async () => {
        const key = JSON.stringify(['eixo_guide_collapsed_v2', userId, 'farm-a', 'Nutrição']);
        localStorage.setItem(key, '0');
        await render(<ModuleProgressCard {...moduleProps} />, false);
        assert(button('Recolher guia') && button('Cadastrar animais'), 'Preferência aberta foi ignorada');
        await click('Recolher guia');
        await render(null);
        await render(<ModuleProgressCard {...moduleProps} />, false);
        assert(button('Abrir guia') && localStorage.getItem(key) === '1', 'Preferência recolhida foi ignorada');
    });
    await test('lista completa inicia fechada e destaca a etapa atual', async () => {
        await render(<ModuleProgressCard {...moduleProps} />);
        const details = container.querySelector('details')!;
        assert(!details.open && !text().includes('Registrar a primeira pesagem'), 'Lista completa não iniciou fechada');
        await act(async () => container.querySelector<HTMLElement>('summary')!.click());
        await flush();
        assert(text().includes('Registrar a primeira pesagem') && container.querySelector('[aria-current="step"]')?.textContent?.includes('Cadastrar animais'), 'Sequência ou destaque incorretos');
        await render(<ModuleProgressCard {...moduleProps} farmId="farm-b" farmName="Fazenda B" />);
        assert(!container.querySelector('details')!.open, 'Lista permaneceu aberta ao trocar fazenda');
        await act(async () => container.querySelector<HTMLElement>('summary')!.click());
        await render(<ModuleProgressCard {...moduleProps} activeView="Reprodução" />);
        assert(!container.querySelector('details')!.open, 'Lista permaneceu aberta ao trocar módulo');
        await act(async () => container.querySelector<HTMLElement>('summary')!.click());
        await render(<ModuleProgressCard {...moduleProps} userId={`${userId}-other`} />);
        assert(!container.querySelector('details')!.open, 'Lista permaneceu aberta ao trocar usuário');
    });
    await test('falha e carregamento são informados mesmo recolhidos', async () => {
        let release!: (value: Response) => void;
        intercept = () => new Promise((resolve) => { release = resolve; });
        // Nutrição consulta também pesagem; usar Genetics para controlar uma resposta.
        await render(<ModuleProgressCard {...moduleProps} activeView="Reprodução" />, false);
        assert(text().includes('Verificando…') && !text().includes('0 de'), 'Carregamento confundido com zero');
        await act(async () => release(response({}, 403)));
        await flush();
        assert(text().includes('Não foi possível verificar') && !text().includes('0 de'), 'Falha confundida com zero');
        await click('Abrir guia');
        assert(button('Tentar novamente'), 'Recuperação não ficou acessível');
    });
    await test('orientação de selecionar fazenda aparece uma única vez', async () => {
        await render(<ModuleProgressCard {...moduleProps} farmId={null} farmName={null} />);
        const occurrences = text().match(/Selecione uma fazenda no menu superior para continuar/g) || [];
        assert(occurrences.length === 1 && !button('Cadastrar animais'), 'Orientação repetida ou cadastro sem contexto');
    });
    await test('conclusão inicial recolhida informa confirmação pendente', async () => {
        intercept = complete;
        await render(<OnboardingChecklist {...initialProps} />, false);
        assert(text().includes('4 de 4 passos concluídos — confirme para finalizar') && !button('Concluir primeiros passos'), 'Resumo não explicou confirmação');
        await click('Abrir guia');
        assert(button('Concluir primeiros passos'), 'Confirmação não ficou acessível');
    });
    await test('módulo concluído oferece revisão sem lista exposta', async () => {
        intercept = complete;
        await render(<ModuleProgressCard {...moduleProps} />, false);
        assert(text().includes('Primeiros passos concluídos') && !text().includes('Registrar a primeira pesagem'), 'Conclusão não ficou compacta');
        await click('Abrir guia');
        assert(container.querySelector('summary')?.textContent?.includes('Revisar os passos') && !container.querySelector('details')!.open, 'Revisão indisponível ou já aberta');
    });
    await test('informação opcional fica nos detalhes', async () => {
        await render(<ModuleProgressCard {...moduleProps} activeView="Reprodução" />);
        assert(!text().includes('Opcional:'), 'Informação opcional ocupou a tarefa atual');
        await act(async () => container.querySelector<HTMLElement>('summary')!.click());
        await flush();
        assert(text().includes('Opcional:'), 'Informação opcional foi perdida');
    });
    document.getElementById('totals')!.textContent = `${passed} cenários passaram; ${failures.length} falharam.`;
    output.textContent += `\n\nResultado: ${passed} passaram; ${failures.length} falharam.`;
    document.documentElement.dataset.testStatus = failures.length ? 'failed' : 'passed';
    // Prévia visual dos componentes reais com fixtures, sem chamadas externas.
    intercept = defaults;
    await render(null);
    await render(<ModuleProgressCard {...moduleProps} />, false);
}
document.getElementById('text-scale')!.addEventListener('change', (event) => {
    document.documentElement.style.fontSize = (event.target as HTMLSelectElement).value;
});
document.getElementById('preview')!.addEventListener('change', async (event) => {
    const choice = (event.target as HTMLSelectElement).value;
    const previewUser = `${userId}-preview`;
    intercept = choice === 'ready' || choice === 'finance' ? complete : choice === 'error' ? () => response({}, 503) : defaults;
    await render(null);
    if (choice === 'initial' || choice === 'ready') {
        await render(<OnboardingChecklist {...initialProps} userId={previewUser} />, false);
    } else {
        const activeView = choice === 'finance' ? 'Financeiro' : choice === 'genetics' ? 'Reprodução' : 'Nutrição';
        await render(<ModuleProgressCard {...moduleProps} userId={previewUser} activeView={activeView} canViewFinancialResult={choice !== 'finance'} farmId={choice === 'no-farm' ? null : 'farm-a'} farmName={choice === 'no-farm' ? null : 'Fazenda A'} />, false);
    }
});
void run();
