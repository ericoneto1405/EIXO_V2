// Fixture isolada: nenhuma API ou banco real é acessado.
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ReproWorkflow from '../components/ReproWorkflow';
import type { WorkflowData } from '../adapters/reproWorkflowApi';
import '../src/index.css';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const userId = 'repro-workflow-fixture';
const fixture = document.getElementById('fixture')!;
const root = createRoot(fixture);
const step = {
    id: 'd0',
    dia: 0,
    titulo: 'Manejo D0',
    procedimentos: [
        {
            id: 'proc-0',
            titulo: 'Aplicação',
            produtoId: 'p1',
            dose: 2,
            unidade: 'mL',
        },
        {
            id: 'proc-1',
            titulo: 'Dispositivo',
            produtoId: null,
            dose: null,
            unidade: null,
        },
    ],
};
const data: WorkflowData = {
    animals: ['a1', 'a2'].map((id, i) => ({
        id,
        status: 'VIVO',
        desmamadoEm: null,
        previsaoParto: null,
        pesoAtual: 400,
        brinco: `Matriz ${i + 1}`,
        sexo: 'FEMEA',
        dataNascimento: '2020-01-01',
        maeId: null,
        raca: 'Nelore',
        lotId: 'l1',
        currentPaddockId: 'past1',
        statusReprodutivo: 'VAZIA',
        impedimento: null,
        reproEvents: [
            {
                id: `lib-${id}`,
                type: 'LIBERACAO',
                date: '2020-01-01',
                createdAt: '2020-01-01',
                payload: {},
                notes: null,
            },
        ],
        farol: {
            cor: 'CINZA',
            label: 'Dados insuficientes',
            motivos: ['Avaliação funcional pendente'],
            dimensoes: [],
        },
    })),
    seasons: [],
    protocols: [{ id: 'p', nome: 'Protocolo veterinário', passos: [step] }],
    rounds: [
        {
            id: 'r',
            dia0: '2026-09-01',
            seasonId: null,
            status: 'ABERTO',
            responsavel: 'Veterinário teste',
            vacas: [
                { animalId: 'a1', brinco: 'Matriz 1' },
                { animalId: 'a2', brinco: 'Matriz 2' },
            ],
            resumo: {
                protocolSnapshot: {
                    id: 'p',
                    nome: 'Protocolo veterinário',
                    passos: [step],
                },
            },
        },
    ],
    legacyRounds: 0,
    legacyRoundIds: [],
    products: [
        {
            id: 'p1',
            name: 'Produto veterinário de teste',
            unit: 'mL',
            applicationUnit: 'mL',
            applicationPerUnit: 1,
            batches: [{ quantity: 20, expiresAt: null }],
        },
    ],
    semen: [
        {
            id: 's1',
            bullName: 'Touro A',
            lote: 'Partida A',
            dosesDisponiveis: 10,
        },
        {
            id: 's2',
            bullName: 'Touro B',
            lote: 'Partida B',
            dosesDisponiveis: 10,
        },
    ],
    records: [],
    rules: null,
    rulesVersion: null,
    performance: true,
    lots: [{ id: 'l1', name: 'Matrizes' }],
    paddocks: [{ id: 'past1', name: 'Pasto 1' }],
};
let calls: { action: string; body: Record<string, any> }[] = [],
    fail = false,
    openedAnimals = false;
window.fetch = async (url, init) => {
    if (init?.method === 'POST') {
        calls.push({
            action: String(url).split('/').at(-1)!,
            body: JSON.parse(String(init.body)),
        });
        if (fail)
            return new Response(
                JSON.stringify({
                    message: 'Farmácia: estoque insuficiente. Regularize antes de confirmar.',
                }),
                { status: 400 },
            );
        return new Response(JSON.stringify({ ok: true }));
    }
    return new Response(JSON.stringify(data));
};
const flush = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 30));
    });
const render = async (mode: string, farmId = 'fixture-farm') => {
    await act(async () =>
        root.render(
            <ReproWorkflow
                key={farmId}
                farmId={farmId}
                userId={userId}
                mode={mode}
                onAnimals={() => {
                    openedAnimals = true;
                }}
                onFicha={() => {}}
                onNavigate={(tab) => void render(tab)}
            />,
        ),
    );
    await flush();
};
const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
};
const click = async (label: string) => {
    const b = [...fixture.querySelectorAll('button')].find((n) => n.textContent?.trim() === label);
    assert(b, `Botão ausente: ${label}`);
    await act(async () => b!.click());
    await flush();
};
const submit = async () => {
    await act(async () =>
        fixture.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await flush();
};
const change = async (node: HTMLInputElement | HTMLSelectElement, value: string) => {
    await act(async () => {
        const prototype = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
        node.dispatchEvent(
            new Event(node instanceof HTMLSelectElement ? 'change' : 'input', {
                bubbles: true,
            }),
        );
    });
    await flush();
};
function clear() {
    for (const key of Object.keys(localStorage)) if (key.includes(userId)) localStorage.removeItem(key);
}
async function run() {
    clear();
    let passed = 0;
    const output = document.getElementById('results')!;
    async function test(name: string, task: () => Promise<void>) {
        try {
            await task();
            output.textContent += `✓ ${name}\n`;
            passed++;
        } catch (e) {
            output.textContent += `✗ ${name}: ${(e as Error).message}\n`;
        }
    }
    await test('seleção por animal e consumo, falha mantém rascunho', async () => {
        await render('CURRAL');
        await click('Registrar selecionadas');
        const checkbox = fixture.querySelector('input[type=checkbox]') as HTMLInputElement;
        await act(async () => checkbox.click());
        await flush();
        assert(fixture.textContent?.includes('total 2 mL'), 'Consumo não corresponde a uma fêmea');
        fail = true;
        await submit();
        assert(fixture.textContent?.includes('estoque insuficiente'), 'Erro ausente');
        assert(calls.at(-1)?.body.animalIds.length === 1, 'Seleção enviada incorreta');
        assert(
            Object.keys(localStorage).some(
                (k) => k.includes(userId) && k.endsWith(':drafts') && localStorage.getItem(k)?.includes('ETAPA'),
            ),
            'Rascunho não preservado',
        );
        fail = false;
        await click('Salvar rascunho e fechar');
    });
    await test('rascunho não aparece em outra fazenda', async () => {
        await render('CURRAL', 'other-farm');
        assert(!fixture.textContent?.includes('Revisar rascunho'), 'Rascunho vazou entre fazendas');
    });
    await test('parto encaminha a Animais preservando rascunho', async () => {
        await render('PARTOS', 'birth-farm');
        await click('Registrar parto com crias cadastradas');
        await click('Ir para Animais (preservar rascunho)');
        assert(openedAnimals, 'Não encaminhou a Animais');
        assert(
            Object.keys(localStorage).some(
                (k) => k.includes('birth-farm') && k.endsWith(':drafts') && localStorage.getItem(k)?.includes('PARTO'),
            ),
            'Parto não preservado',
        );
        await click('Salvar rascunho e fechar');
    });
    await test('descarte usa modal, Cancelar e foco contido', async () => {
        await render('DECIDIR', 'decision-farm');
        await click('Registrar descarte');
        await submit();
        const dialog = fixture.querySelector('[role=dialog]');
        assert(dialog, 'Modal ausente');
        assert(dialog!.contains(document.activeElement), 'Foco fora do modal');
        assert(dialog!.textContent?.includes('Cancelar'), 'Cancelar ausente');
        await click('Cancelar');
        assert(!fixture.querySelector('[role=dialog]'), 'Modal não fechou');
        await click('Salvar rascunho e fechar');
    });
    await test('modelo Comercial sem avaliação racial obrigatória', async () => {
        await render('CRITERIOS', 'rules-farm');
        await click('Revisar modelo e limites');
        const boxes = [...fixture.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
        assert(
            boxes[0].checked && boxes[1].checked && !boxes[2].checked && !boxes[3].checked,
            'Modelo deveria iniciar inativo e sem racial',
        );
        await click('Salvar rascunho e fechar');
    });
    await test('IATF aceita touro comum e exceção por matriz', async () => {
        await render('CURRAL', 'semen-farm');
        await click('Inseminar');
        await click('Selecionar resultados filtrados (2)');
        const common = [...fixture.querySelectorAll('label')]
            .find((l) => l.textContent?.startsWith('Sêmen comum'))!
            .querySelector('select')!;
        await change(common, 's1');
        const individual = [...fixture.querySelectorAll('label')]
            .find((l) => l.textContent?.startsWith('Sêmen da fêmea Matriz 2'))!
            .querySelector('select')!;
        await change(individual, 's2');
        await submit();
        assert(calls.at(-1)?.body.semen[1].batchId === 's2', 'Exceção não enviada');
    });
    output.textContent += `${passed}/6 verificações concluídas.\n`;
    document.body.dataset.tests = `${passed}/6`;
    await render('CURRAL', 'preview-farm');
}
const controls = document.getElementById('controls')!;
controls.innerHTML =
    '<label>Prévia <select id="mode"><option>CURRAL</option><option>ESTACAO</option><option>PARTOS</option><option>DESMAMA</option><option>TOQUE</option><option>DECIDIR</option><option>CRITERIOS</option><option>COBERTURA</option></select></label>';
controls
    .querySelector('select')!
    .addEventListener('change', (e) => void render((e.target as HTMLSelectElement).value, 'preview-farm'));
void run();
