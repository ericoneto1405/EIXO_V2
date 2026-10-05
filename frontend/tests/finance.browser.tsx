// Fixture isolada: usa os componentes reais com respostas simuladas; não grava dados reais.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FinanceModule from '../components/FinanceModule';
import FluxoTab from '../components/finance/FluxoTab';
import AnalyticsTab from '../components/finance/AnalyticsTab';
import DataQualityTab from '../components/finance/DataQualityTab';
import { formatDate, isVencida, localDateInput } from '../components/financeUtils';
import type { FinancialTransaction } from '../adapters/financialApi';
import '../src/index.css';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const fixture = document.getElementById('fixture')!;
const results = document.getElementById('results')!;
let root = createRoot(fixture);
const props = { userId: 'finance-fixture', farmId: 'farm-a', farmName: 'Fazenda de teste' };
const category = { id: 'cat-a', farmId: 'farm-a', name: 'Serviços', group: 'Operação', type: 'SAIDA', isActive: true, isConfigured: true, isSystem: false, deprecatedAt: null, cashFlowClass: 'OPERATING', resultClass: 'OPERATING_EXPENSE', recognitionRule: 'IMMEDIATE' };
const account = (overrides: Partial<FinancialTransaction> = {}): FinancialTransaction => ({ id: 'account-a', farmId: 'farm-a', type: 'SAIDA', categoria: 'OUTROS', accountCategoryId: 'cat-a', accountCategoryName: 'Serviços', accountCategoryGroup: 'Operação', valor: 125, data: `${localDateInput()}T00:00:00.000Z`, competenceDate: localDateInput(), settledAt: null, modelVersion: 2, descricao: 'Conta de teste', vencimento: localDateInput(), status: 'PENDENTE', herdEventId: null, sanitaryRecordId: null, createdAt: localDateInput(), ...overrides });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const cash = (value: number) => ({ period: {}, realized: { totals: { incoming: value, outgoing: 0, net: value }, byMonth: [], byActivity: [] }, projected: { totals: { incoming: 0, outgoing: 0, net: 0 }, byMonth: [], byActivity: [] } });
const analytics = (label: string) => ({ items: [{ key: label, label, revenue: 10, productionCost: 2, operatingExpense: 1, margin: 7, topCategories: [] }], unallocatedAmount: 0, allocationCoveragePercent: 100, metricNotice: null });
let rows = [account()];
let calls: { url: URL; init?: RequestInit }[] = [];
let intercept: (url: URL, init?: RequestInit) => Response | Promise<Response>;
const defaults = (url: URL, init?: RequestInit) => {
    if (url.pathname.endsWith('/transactions')) return response({ transactions: rows });
    if (url.pathname.includes('/transactions/') && init?.method === 'PATCH') { rows = rows.map((row) => ({ ...row, ...JSON.parse(String(init.body)) })); return response({ transaction: rows[0] }); }
    if (url.pathname.endsWith('/allocations')) return response({ editable: true, reason: null, allocations: [], relatedResults: [] });
    if (url.pathname.endsWith('/account-categories')) return response({ categories: [category] });
    if (url.pathname.endsWith('/cash-flow')) return response(cash(123));
    if (url.pathname.endsWith('/analytics')) return response(analytics('Lote teste'));
    if (url.pathname.endsWith('/data-quality')) return response({ reliable: true, allocationCoveragePercent: 100, unconfiguredCategories: 0, lotsWithoutPhase: 0, animalsWithoutAcquisitionCost: 0, animalsWithoutSufficientWeighings: 0, unallocatedAmount: 0 });
    return response({ items: [], lots: [] });
};
window.fetch = async (input, init) => { const url = new URL(String(input), location.href); calls.push({ url, init }); return intercept(url, init); };
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const text = () => fixture.innerText;
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
const render = async (element: React.ReactNode) => { await act(async () => root.render(element)); await flush(); };
const button = (label: string) => Array.from(fixture.querySelectorAll('button')).find((item) => item.textContent?.trim() === label)!;
const click = async (label: string) => { assert(button(label), `Botão ausente: ${label}`); await act(async () => button(label).click()); await flush(); };
const input = async (selector: string, value: string) => { const node = fixture.querySelector<HTMLInputElement>(selector)!; assert(node, `Campo ausente: ${selector}`); await act(async () => { Object.getOwnPropertyDescriptor(node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(node, value); node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); await flush(); };
const key = async (node: Element, value: string, shiftKey = false) => { await act(async () => node.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true }))); await flush(); };
let passed = 0;
const failures: string[] = [];
async function test(name: string, run: () => Promise<void>) {
    await act(async () => root.unmount()); root = createRoot(fixture); rows = [account()]; calls = []; intercept = defaults;
    try { await run(); passed++; results.textContent += `\n✓ ${name}`; }
    catch (error) { failures.push(`${name}: ${(error as Error).message}`); results.textContent += `\n✗ ${failures.at(-1)}`; }
}
async function run() {
    await test('erro nas contas não aparece como zero e permite tentar novamente', async () => {
        let fail = true;
        intercept = (url, init) => url.pathname.endsWith('/transactions') && !url.searchParams.has('mes') && fail ? response({ message: 'Falha de teste' }, 500) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar');
        assert(text().includes('Falha de teste') && !text().includes('Total a pagar'), 'Erro confundido com total');
        fail = false; await click('Tentar novamente'); assert(text().includes('Conta de teste'), 'Recuperação falhou');
    });
    await test('conta automática permite baixa com data e preserva campos', async () => {
        rows = [account({ herdEventId: 'event-a' })];
        await render(<FinanceModule {...props} />); await click('Contas a Pagar');
        assert(!fixture.querySelector('[aria-label="Editar lançamento"]'), 'Conta automática editável');
        await click('Registrar pagamento'); await input('#settlement-date', '2026-09-12'); await click('Confirmar');
        const patch = calls.find((call) => call.init?.method === 'PATCH');
        assert(JSON.stringify(JSON.parse(String(patch?.init?.body))) === JSON.stringify({ status: 'PAGO', settledAt: '2026-09-12' }), 'Baixa alterou contrato ou campos indevidos');
        assert(text().includes('12/09/2026'), 'Data não exibida');
    });
    await test('recebimento usa terminologia própria', async () => {
        rows = [account({ type: 'ENTRADA' })]; await render(<FinanceModule {...props} />); await click('Contas a Receber'); await click('Registrar recebimento'); await click('Confirmar'); assert(text().includes('Recebido'), 'Status de recebimento incorreto');
    });
    await test('timeout após baixa consulta o estado e não repete operação', async () => {
        intercept = (url, init) => { if (init?.method === 'PATCH') { rows = [account({ status: 'PAGO', settledAt: '2026-09-01' })]; throw new Error('Timeout'); } return defaults(url, init); };
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await click('Registrar pagamento'); await click('Confirmar');
        assert(calls.filter((call) => call.init?.method === 'PATCH').length === 1 && !fixture.querySelector('[role="dialog"]'), 'Baixa duplicada ou resultado não confirmado');
    });
    await test('resultado desconhecido só libera nova baixa após consulta', async () => {
        let unavailable = false;
        intercept = (url, init) => { if (init?.method === 'PATCH') { unavailable = true; throw new Error('Timeout'); } if (unavailable && url.pathname.endsWith('/transactions')) throw new Error('Offline'); return defaults(url, init); };
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await click('Registrar pagamento'); await click('Confirmar');
        assert(button('Verificar situação'), 'Repetição oferecida sem consultar'); unavailable = false; await click('Verificar situação');
        assert(button('Confirmar') && calls.filter((call) => call.init?.method === 'PATCH').length === 1, 'Consulta repetiu baixa');
    });
    await test('caixa descarta resposta atrasada após troca de fazenda', async () => {
        let resolveA: (response: Response) => void;
        intercept = (url) => url.searchParams.get('farmId') === 'farm-a' ? new Promise((resolve) => { resolveA = resolve; }) : response(cash(987));
        const common = { selectedAnoAnual: 2026, setSelectedAnoAnual: () => {}, anos: [2026] };
        await render(<FluxoTab farmId="farm-a" {...common} />); await render(<FluxoTab farmId="farm-b" {...common} />);
        await act(async () => resolveA!(response(cash(111)))); await flush();
        assert(text().includes('987,00') && !text().includes('111,00'), 'Resposta antiga exibida');
    });
    await test('custos limpam dados e descartam resposta de ano anterior', async () => {
        let resolveA: (response: Response) => void;
        intercept = (url) => url.searchParams.get('year') === '2025' ? new Promise((resolve) => { resolveA = resolve; }) : response(analytics('Lote atual'));
        const common = { farmId: 'farm-a', anos: [2025, 2026], onYearChange: () => {} };
        await render(<AnalyticsTab {...common} year={2025} />); assert(text().includes('Carregando'), 'Carregamento aparece como vazio'); await render(<AnalyticsTab {...common} year={2026} />);
        await act(async () => resolveA!(response(analytics('Lote antigo')))); await flush(); assert(text().includes('Lote atual') && !text().includes('Lote antigo'), 'Contexto antigo em custos');
    });
    await test('qualidade recupera erro e muda contexto', async () => {
        intercept = () => response({ message: 'Qualidade indisponível' }, 500); await render(<DataQualityTab farmId="farm-a" onOpenCategories={() => {}} onOpenAccounts={() => {}} />); assert(button('Tentar novamente'), 'Sem recuperação');
        intercept = defaults; await click('Tentar novamente'); assert(text().includes('Base configurada'), 'Não recuperou qualidade');
    });
    await test('datas não deslocam o dia e conta de hoje não está vencida', async () => {
        assert(formatDate('2026-10-05T00:00:00.000Z') === '05/10/2026', 'Data mudou de dia'); assert(!isVencida(account()), 'Conta de hoje vencida'); assert(isVencida(account({ vencimento: '2000-01-01' })), 'Atraso não reconhecido');
    });
    await test('busca normaliza acentos e separa contas sem vencimento', async () => {
        rows = [account({ descricao: 'Manutenção rural', vencimento: null }), account({ id: 'b', descricao: 'Outra conta', valor: 9 })];
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await input('#accounts-search', 'manutencao'); assert(text().includes('Manutenção rural') && !text().includes('Outra conta'), 'Busca incorreta'); assert(text().includes('não entram') || text().includes('Não entram'), 'Sem aviso de projeção');
    });
    await test('categoria exige escolha, funciona por teclado e formulário preserva trabalho', async () => {
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await click('Nova conta');
        assert((button('Lançar') as HTMLButtonElement).disabled, 'Categoria escolhida automaticamente');
        const picker = fixture.querySelector<HTMLInputElement>('#finance-category')!; await act(async () => picker.focus()); await flush(); await key(picker, 'ArrowDown'); await key(picker, 'Enter');
        assert(!(button('Lançar') as HTMLButtonElement).disabled, 'Seleção por teclado falhou'); await input('#finance-amount', '150'); await key(picker, 'Escape');
        assert(fixture.querySelector('[role="dialog"]') && text().includes('Descartar as informações'), 'Perdeu formulário'); await click('Continuar preenchendo'); assert((fixture.querySelector('#finance-amount') as HTMLInputElement).value === '150', 'Valor perdido');
    });
    await test('divisão de custos confere total e impede percentual acima de 100', async () => {
        intercept = (url, init) => url.pathname.endsWith('/lots') ? response({ lots: [{ id: 'lot-a', name: 'Lote A' }] }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await click('Nova conta'); await input('#finance-amount', '200');
        await click('Adicionar divisão'); assert(text().includes('Distribuído:'), 'Resumo de distribuição ausente');
        await input('[aria-label="Percentual da divisão 1"]', '60'); assert(text().includes('120,00') && text().includes('80,00'), 'Valores de distribuição incorretos');
        await input('[aria-label="Lote da divisão 1"]', 'lot-a'); await click('Adicionar divisão'); await input('[aria-label="Lote da divisão 2"]', 'lot-a'); await input('[aria-label="Percentual da divisão 2"]', '60');
        const picker = fixture.querySelector<HTMLInputElement>('#finance-category')!; await act(async () => picker.focus()); await flush(); await key(picker, 'Enter'); await click('Lançar'); assert(text().includes('não pode superar 100%') && !calls.some((call) => call.init?.method === 'POST'), 'Distribuição inválida enviada');
    });
    await test('troca de fazenda não exibe contas da fazenda anterior', async () => {
        intercept = (url, init) => url.pathname.endsWith('/transactions') ? response({ transactions: [account({ descricao: url.searchParams.get('farmId') === 'farm-a' ? 'Conta da Fazenda A' : 'Conta da Fazenda B', farmId: url.searchParams.get('farmId')! })] }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); assert(text().includes('Conta da Fazenda A'), 'Conta inicial ausente');
        await render(<FinanceModule {...props} farmId="farm-b" />); await click('Contas a Pagar'); assert(text().includes('Conta da Fazenda B') && !text().includes('Conta da Fazenda A'), 'Misturou fazendas');
    });
    await test('visão geral abre contas do grupo no mesmo mês de competência', async () => {
        const today = localDateInput();
        rows = [account({ vencimento: '2030-01-01', descricao: 'Conta da competência atual' }), account({ id: 'old', data: '2000-01-01', descricao: 'Conta antiga' })];
        intercept = (url, init) => url.pathname.endsWith('/transactions') && url.searchParams.has('mes') ? response({ transactions: rows.filter((row) => row.data.slice(0, 7) === today.slice(0, 7)) }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Operação');
        assert(text().includes('Conta da competência atual') && !text().includes('Conta antiga'), 'Não preservou competência no detalhamento');
        assert(text().includes('Período pela competência'), 'Base da data não informada');
    });
    await test('modal contém foco e devolve ao botão de abertura', async () => {
        await render(<FinanceModule {...props} />); await click('Contas a Pagar');
        const opener = button('Registrar pagamento'); await act(async () => opener.focus()); await click('Registrar pagamento');
        const confirm = button('Confirmar'); await act(async () => confirm.focus()); await key(confirm, 'Tab');
        assert(document.activeElement?.id === 'settlement-date', 'Foco saiu do diálogo');
        await key(document.activeElement!, 'Escape'); assert(document.activeElement === opener, 'Foco não voltou para a conta');
    });
    await test('plano de contas preserva categoria em preenchimento e associa campos', async () => {
        await render(<FinanceModule {...props} />); await click('Plano de Contas'); await click('Nova categoria'); await input('#category-name', 'Categoria de teste');
        const field = fixture.querySelector('#category-name')!; assert(fixture.querySelector('label[for="category-name"]'), 'Campo sem rótulo'); await key(field, 'Escape');
        assert(text().includes('Descartar as informações desta categoria') && fixture.querySelector('[role="dialog"]'), 'Categoria descartada sem aviso');
    });
    await test('visão geral descarta resposta atrasada ao trocar o ano', async () => {
        let resolveOld: (response: Response) => void;
        intercept = (url, init) => url.pathname.endsWith('/transactions') && url.searchParams.get('ano') === String(new Date().getFullYear()) ? new Promise((resolve) => { resolveOld = resolve; }) : url.pathname.endsWith('/transactions') ? response({ transactions: [account({ valor: 987 })] }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await input('[aria-label="Ano da visão geral"]', String(new Date().getFullYear() - 1));
        await act(async () => resolveOld!(response({ transactions: [account({ valor: 111 })] }))); await flush();
        assert(text().includes('987,00') && !text().includes('111,00'), 'Resposta mensal antiga substituiu o período atual');
    });
    await test('erro de gravação preserva valor e categoria para correção', async () => {
        intercept = (url, init) => init?.method === 'POST' ? response({ message: 'Falha de gravação de teste' }, 500) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await click('Nova conta'); await input('#finance-amount', '450');
        const picker = fixture.querySelector<HTMLInputElement>('#finance-category')!; await act(async () => picker.focus()); await flush(); await key(picker, 'Enter'); await click('Lançar');
        assert(text().includes('Falha de gravação de teste') && (fixture.querySelector('#finance-amount') as HTMLInputElement).value === '450' && (fixture.querySelector('#finance-category') as HTMLInputElement).value === 'Serviços', 'Falha apagou o formulário');
    });
    await test('salvamento bloqueia fechamento e envio duplicado', async () => {
        let resolveSave: (response: Response) => void;
        intercept = (url, init) => init?.method === 'POST' ? new Promise((resolve) => { resolveSave = resolve; }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await click('Nova conta'); await input('#finance-amount', '450');
        const picker = fixture.querySelector<HTMLInputElement>('#finance-category')!; await act(async () => picker.focus()); await flush(); await key(picker, 'Enter'); await click('Lançar');
        assert((fixture.querySelector('[aria-label="Fechar"]') as HTMLButtonElement).disabled && (button('Salvando...') as HTMLButtonElement).disabled, 'Envio ou fechamento liberado durante gravação');
        await key(fixture.querySelector('[role="dialog"]')!, 'Escape'); assert(fixture.querySelector('[role="dialog"]'), 'Fechou durante gravação');
        await act(async () => resolveSave!(response({ transaction: account() }))); await flush(); assert(!fixture.querySelector('[role="dialog"]') && calls.filter((call) => call.init?.method === 'POST').length === 1, 'Gravação duplicada ou formulário não fechou');
    });
    await test('edição consulta destinos e preserva centavos, fase e animal', async () => {
        const division = { id: 'division-a', amount: 33.33, lotId: 'lot-a', paddockId: null, animalId: 'animal-a', productionPhase: 'RECRIA', lotName: 'Lote registrado', paddockName: null, animalLabel: 'Animal registrado' };
        intercept = (url, init) => url.pathname.endsWith('/allocations') ? response({ editable: true, reason: null, allocations: [division], relatedResults: [] }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await act(async () => fixture.querySelector<HTMLButtonElement>('[aria-label="Editar lançamento"]')!.click()); await flush();
        assert((fixture.querySelector('[aria-label="Valor da divisão 1"]') as HTMLInputElement).value === '33.33', 'Centavos não foram carregados');
        assert(text().includes('Lote registrado') && text().includes('Animal registrado') && text().includes('RECRIA'), 'Destino ou fase não foi carregado');
        await input('[aria-label="Valor da divisão 1"]', '60.17'); await click('Salvar alterações');
        const patch = calls.find((call) => call.init?.method === 'PATCH'); const payload = JSON.parse(String(patch?.init?.body));
        assert(payload.allocations[0].amount === 60.17 && payload.allocations[0].productionPhase === 'RECRIA' && payload.allocations[0].animalId === 'animal-a', 'Alteração perdeu valor ou referências');
    });
    await test('erro ao consultar distribuição bloqueia gravação e permite recuperar', async () => {
        let fail = true;
        intercept = (url, init) => url.pathname.endsWith('/allocations') && fail ? response({ message: 'Distribuição indisponível' }, 500) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await act(async () => fixture.querySelector<HTMLButtonElement>('[aria-label="Editar lançamento"]')!.click()); await flush();
        assert((button('Salvar alterações') as HTMLButtonElement).disabled && text().includes('Distribuição indisponível'), 'Gravação permitida sem consulta');
        fail = false; await click('Tentar novamente'); assert(!(button('Salvar alterações') as HTMLButtonElement).disabled, 'Consulta não recuperou');
    });
    await test('remover todas as divisões envia lista vazia e fechamento protege alterações', async () => {
        intercept = (url, init) => url.pathname.endsWith('/allocations') ? response({ editable: true, reason: null, allocations: [{ id: 'division-a', amount: 50, lotId: 'lot-a', lotName: 'Lote registrado' }], relatedResults: [] }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await act(async () => fixture.querySelector<HTMLButtonElement>('[aria-label="Editar lançamento"]')!.click()); await flush(); await click('Remover divisão');
        await key(fixture.querySelector('[role="dialog"]')!, 'Escape'); assert(text().includes('Descartar as informações'), 'Remoção não protegida'); await click('Continuar preenchendo'); await click('Salvar alterações');
        const patch = calls.find((call) => call.init?.method === 'PATCH'); assert(JSON.stringify(JSON.parse(String(patch?.init?.body)).allocations) === '[]', 'Não limpou explicitamente');
    });
    await test('edição de descrição preserva distribuição sem reenviar ou arredondar', async () => {
        intercept = (url, init) => url.pathname.endsWith('/allocations') ? response({ editable: true, reason: null, allocations: [{ id: 'division-a', amount: 33.33, lotId: 'lot-a', lotName: 'Lote registrado' }], relatedResults: [] }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await act(async () => fixture.querySelector<HTMLButtonElement>('[aria-label="Editar lançamento"]')!.click()); await flush(); await input('#finance-description', 'Descrição revisada'); await click('Salvar alterações');
        const patch = calls.find((call) => call.init?.method === 'PATCH'); assert(!('allocations' in JSON.parse(String(patch?.init?.body))), 'Reenviou distribuição sem alteração');
    });
    await test('conta automática permite consultar destinos sem liberar alteração', async () => {
        rows = [account({ herdEventId: 'event-a' })];
        intercept = (url, init) => url.pathname.endsWith('/allocations') ? response({ editable: false, reason: 'Distribuição automática', allocations: [{ id: 'division-a', amount: 50, animalId: 'animal-a', animalLabel: 'Animal registrado' }], relatedResults: [] }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await click('Consultar'); assert(text().includes('Animal registrado') && !button('Salvar alterações') && !button('Adicionar divisão'), 'Consulta liberou edição automática');
        assert(fixture.querySelector('[aria-label="Valor da divisão 1"]')!.matches(':disabled'), 'Valor automático editável');
    });
    await test('edição bloqueia divisão acima do total sem enviar alteração', async () => {
        intercept = (url, init) => url.pathname.endsWith('/allocations') ? response({ editable: true, reason: null, allocations: [{ id: 'division-a', amount: 50, lotId: 'lot-a', lotName: 'Lote registrado' }], relatedResults: [] }) : defaults(url, init);
        await render(<FinanceModule {...props} />); await click('Contas a Pagar'); await act(async () => fixture.querySelector<HTMLButtonElement>('[aria-label="Editar lançamento"]')!.click()); await flush(); await input('[aria-label="Valor da divisão 1"]', '200'); await click('Salvar alterações');
        assert(text().includes('A soma das divisões supera') && !calls.some((call) => call.init?.method === 'PATCH'), 'Divisão excedente enviada');
    });
    results.textContent += `\n\n${passed} testes passaram; ${failures.length} falharam.`;
    (window as any).financeTestResults = { passed, failures };
    const preview = async (mode = 'form') => {
        await act(async () => root.unmount()); root = createRoot(fixture); intercept = defaults; rows = [account(), account({ id: 'auto', descricao: 'Compra de animais — parcela 1/3', herdEventId: 'event-a', valor: 2500 }), account({ id: 'nodue', descricao: 'Serviço sem vencimento', vencimento: null })];
        await render(<FinanceModule {...props} />); if (mode !== 'overview') await click('Contas a Pagar'); if (mode === 'form') { await click('Nova conta'); await click('Adicionar divisão'); }
    };
    const controls = document.createElement('nav'); controls.setAttribute('aria-label', 'Prévia de teste'); for (const [label, mode] of [['Ver formulário', 'form'], ['Ver contas', 'accounts'], ['Ver visão geral', 'overview']]) { const control = document.createElement('button'); control.textContent = label; control.className = 'm-2 rounded-xl border p-2'; control.addEventListener('click', () => preview(mode)); controls.appendChild(control); } results.after(controls);
}
run().catch((error) => { results.textContent += `\nFalha de execução: ${error.message}`; });
