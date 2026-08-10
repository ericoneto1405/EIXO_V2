import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { requireAuth } from '../middlewares/requireAuth.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { parseNumber, parseDateValue, normalizeAnimalIdentityKey } from '../utils/formatters.js';
import { logActivity } from '../utils/activityLog.js';
import { serializeHerdEvent, serializeSanitaryRecord } from '../utils/serializers.js';
import { HERD_EVENT_CATEGORY_MAP, SANITARY_CATEGORY_MAP } from '../config/env.js';
import { createIntegratedTransaction, upsertAutomaticResult } from '../financial/financialService.js';
const prisma = new PrismaClient();

const VALID_EVENT_TYPES = ['NASCIMENTO', 'COMPRA', 'VENDA', 'MORTE'];
const VALID_SANITARY_TIPOS = ['VACINA', 'VERMIFUGO', 'TRATAMENTO'];

export function registerHerdRoutes(app) {
app.get('/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const events = await prisma.herdEvent.findMany({
            where: { animalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ events: events.map(serializeHerdEvent) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar eventos.' });
    }
});

app.post('/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    const { type, date, peso, valor, origem, destino, observacoes, purchasePurpose } = req.body || {};

    if (!VALID_EVENT_TYPES.includes(type?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use NASCIMENTO, COMPRA, VENDA ou MORTE.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do evento inválida.' });
    }

    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const eventType = type.toUpperCase();
        if (purchasePurpose && !['PRODUCTION', 'BREEDING'].includes(purchasePurpose)) {
            return res.status(400).json({ message: 'Finalidade da compra inválida.' });
        }
        const resolvedPurchasePurpose = eventType === 'COMPRA' ? (purchasePurpose || 'PRODUCTION') : null;
        const event = await prisma.$transaction(async (tx) => {
            const createdEvent = await tx.herdEvent.create({ data: {
                farmId: animal.farmId, animalId: id, type: eventType, date: eventDate,
                peso: parseNumber(peso), valor: parseNumber(valor), origem: origem?.trim() || null,
                destino: destino?.trim() || null, observacoes: observacoes?.trim() || null,
                purchasePurpose: resolvedPurchasePurpose,
            } });
            const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
            const parsedValor = parseNumber(valor);
            if (financialMap && parsedValor && parsedValor > 0) {
                await createIntegratedTransaction(tx, {
                    farmId: animal.farmId, type: financialMap.type, categoria: financialMap.categoria,
                    accountCategoryId: eventType === 'COMPRA'
                        ? (resolvedPurchasePurpose === 'BREEDING' ? (animal.sexo === 'MACHO' ? 'sys-compra-reprodutores' : 'sys-compra-matrizes') : 'sys-compra-animais-producao')
                        : financialMap.categoryId,
                    amount: parsedValor, competenceDate: eventDate,
                    description: `${eventType === 'COMPRA' ? 'Compra' : 'Venda'} de animal — ${animal.brinco || id}`,
                    herdEventId: createdEvent.id, animalId: animal.id,
                    allocations: (animal.lotId || animal.currentPaddockId) ? [{ lotId: animal.lotId, paddockId: animal.currentPaddockId }] : [],
                });
            }
            return createdEvent;
        });

        const eventLabels = { COMPRA: 'Registrou compra', VENDA: 'Registrou venda', MORTE: 'Registrou morte', NASCIMENTO: 'Registrou nascimento' };
        const label = eventLabels[eventType] || 'Registrou evento';
        const valorStr = parseNumber(valor) ? ` por R$ ${Number(parseNumber(valor)).toLocaleString('pt-BR',{minimumFractionDigits:2})}` : '';
        logActivity(req, { action: `ANIMAL_${eventType}`, entity: 'Animal', entityId: id, description: `${label} do animal ${animal.brinco || id}${valorStr}`, farmId: animal.farmId });
        return res.status(201).json({ event: serializeHerdEvent(event) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar evento.' });
    }
});

// =============================================
// MANEJO SANITÁRIO — Rebanho Comercial
// =============================================

app.get('/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const records = await prisma.sanitaryRecord.findMany({
            where: { animalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ records: records.map(serializeSanitaryRecord) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar registros sanitários.' });
    }
});

app.post('/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    const { tipo, produto, date, dose, proximaAplicacao, observacoes, valorUnitario } = req.body || {};

    if (!VALID_SANITARY_TIPOS.includes(tipo?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use VACINA, VERMIFUGO ou TRATAMENTO.' });
    }
    if (!produto?.trim()) {
        return res.status(400).json({ message: 'Nome do produto é obrigatório.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do registro inválida.' });
    }

    try {
        const animal = await prisma.animal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal não encontrado.' });
        }
        const tipoUpper = tipo.toUpperCase();
        const parsedValor = parseNumber(valorUnitario);
        const record = await prisma.$transaction(async (tx) => {
            const createdRecord = await tx.sanitaryRecord.create({ data: {
                farmId: animal.farmId, animalId: id, tipo: tipoUpper, produto: produto.trim(),
                date: eventDate, dose: dose?.trim() || null, proximaAplicacao: parseDateValue(proximaAplicacao),
                observacoes: observacoes?.trim() || null, valorUnitario: parsedValor || null,
            } });
            const sanitaryMap = SANITARY_CATEGORY_MAP[tipoUpper];
            if (sanitaryMap && parsedValor && parsedValor > 0) {
                await upsertAutomaticResult(tx, {
                    farmId: animal.farmId, accountCategoryId: sanitaryMap.categoryId,
                    sourceKey: `SANITARY_RECORD:${createdRecord.id}:APPLICATION`, sourceType: 'SANITARY_APPLICATION',
                    sourceId: createdRecord.id, sanitaryRecordId: createdRecord.id, resultClass: 'PRODUCTION_COST',
                    amount: parsedValor, competenceDate: eventDate,
                    description: `${produto.trim()} — ${animal.brinco || id}`,
                    allocations: (animal.lotId || animal.currentPaddockId) ? [{ lotId: animal.lotId, paddockId: animal.currentPaddockId }] : [],
                });
            }
            return createdRecord;
        });

        return res.status(201).json({ record: serializeSanitaryRecord(record) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar registro sanitário.' });
    }
});

// =============================================
// PLANILHA MODELO — Template de Importação
// =============================================

// ─── Listas controladas (dropdowns) ────────────────────────────────────────
const RACAS_PURAS = [
  // Zebuínos
  'Nelore', 'Nelore Mocho', 'Brahman', 'Gir', 'Guzerá', 'Tabapuã', 'Sindi', 'Indubrasil',
  // Taurinos europeus
  'Aberdeen Angus', 'Red Angus', 'Hereford', 'Charolês', 'Limousin', 'Simental', 'Devon', 'Wagyu',
  // Adaptados ao trópico
  'Senepol', 'Caracu', 'Bonsmara',
  // Sintéticas
  'Brangus', 'Canchim', 'Braford', 'Simbrasil',
];

const COMPOSICOES_MESTICAS = [
  'Anelorado (predominância zebu)',
  'Guzerá (predominância zebu)',
  'Nelore × Angus',
  'Nelore × Senepol',
  'Mestiça de raça leiteira',
  'Comercial / Sem definição',
];

const STATUS_REPRODUTIVOS = ['PRENHE', 'VAZIA', 'CICLANDO', 'RECRIA'];

const CATEGORIAS = ['Bezerro', 'Bezerra', 'Novilho', 'Novilha', 'Boi', 'Vaca', 'Touro', 'Reprodutora'];

// ─── Estrutura do template (19 colunas) ────────────────────────────────────
// tier: required | conditional | recommended | optional
const TEMPLATE_COLUMNS = [
  // --- Identidade ---
  { key: 'identificacao',      label: 'Identificação',           tier: 'required',     type: 'text',   example: 'EXEMPLO-1',                  description: 'Brinco, tatuagem ou número que identifica o animal de forma única.' },
  { key: 'sexo',               label: 'Sexo',                    tier: 'required',     type: 'list',   options: ['MACHO', 'FEMEA'],            example: 'MACHO',                      description: 'MACHO ou FEMEA.' },
  // --- Raça ---
  { key: 'tipo_raca',          label: 'Tipo de Raça',            tier: 'required',     type: 'list',   options: ['Pura', 'Mestiça'],           example: 'Pura',                       description: 'Pura = animal de uma raça só. Mestiça = cruzamento entre raças.' },
  { key: 'raca',               label: 'Raça (se Pura)',          tier: 'conditional',  type: 'list',   options: RACAS_PURAS,                   example: 'Nelore',                     description: 'Preencha se Tipo de Raça = Pura. Deixe em branco se Tipo = Mestiça.' },
  { key: 'composicao_mestica', label: 'Composição (se Mestiça)', tier: 'conditional',  type: 'list',   options: COMPOSICOES_MESTICAS,          example: 'Anelorado (predominância zebu)', description: 'Preencha se Tipo de Raça = Mestiça. Deixe em branco se Tipo = Pura.' },
  { key: 'padrao_racial',      label: 'Padrão Racial',           tier: 'optional',     type: 'list',   options: ['PO', 'PSR'],                 example: 'PO',                         description: 'PO = Puro de Origem (com registro). PSR = Puro Sem Registro.' },
  { key: 'registro',           label: 'Registro',                tier: 'optional',     type: 'text',   example: 'RGN-5678',                   description: 'Número do registro genealógico, se for PO.' },
  // --- Dados de campo ---
  { key: 'data_nascimento',    label: 'Data de Nascimento',      tier: 'recommended',  type: 'date',   example: '15/03/2020',                 description: 'Data de nascimento (DD/MM/AAAA). Pode ser estimativa.' },
  { key: 'ultimo_peso_kg',     label: 'Último Peso (kg)',        tier: 'recommended',  type: 'number', example: '520',                        description: 'Peso registrado mais recente, em kg.' },
  { key: 'data_pesagem',       label: 'Data da Pesagem',         tier: 'recommended',  type: 'date',   example: '01/06/2026',                 description: 'Data da pesagem informada acima (DD/MM/AAAA).' },
  { key: 'categoria',          label: 'Categoria',               tier: 'optional',     type: 'list',   options: CATEGORIAS,                    example: 'Touro',                      description: 'Categoria do animal no ciclo produtivo (Bezerro, Novilho, Boi, Vaca, etc.).' },
  // --- Reprodução ---
  { key: 'status_reprodutivo', label: 'Status Reprodutivo',      tier: 'optional',     type: 'list',   options: STATUS_REPRODUTIVOS,           example: 'CICLANDO',                   description: 'Só para fêmeas. PRENHE, VAZIA, CICLANDO ou RECRIA.' },
  { key: 'previsao_parto',     label: 'Previsão de Parto',       tier: 'optional',     type: 'date',   example: '15/01/2027',                 description: 'Só preencher se Status Reprodutivo = PRENHE.' },
  // --- Identificação adicional e genealogia ---
  { key: 'nome',               label: 'Nome',                    tier: 'optional',     type: 'text',   example: 'Touro Imperial',             description: 'Nome do animal (comum em PO ou animal de destaque).' },
  { key: 'pai_nome',           label: 'Nome do Pai',             tier: 'optional',     type: 'text',   example: 'Imperial',                   description: 'Nome do pai do animal (texto livre).' },
  { key: 'mae_nome',           label: 'Nome da Mãe',             tier: 'optional',     type: 'text',   example: 'Princesa',                   description: 'Nome da mãe do animal (texto livre).' },
  { key: 'observacoes',        label: 'Observações',             tier: 'optional',     type: 'text',   example: 'Genética alta.',             description: 'Qualquer informação adicional sobre o animal.' },
];

// Cores por tier (para cabeçalhos e legenda)
const TIER_COLORS = {
  required:    { argb: '2F8A3E' }, // verde escuro
  conditional: { argb: '2F8A3E' }, // verde escuro (também obrigatório, mas condicional)
  recommended: { argb: '7BB661' }, // verde médio
  optional:    { argb: 'D1D5DB' }, // cinza claro
};
const TIER_FONT_COLORS = {
  required:    { argb: 'FFFFFF' },
  conditional: { argb: 'FFFFFF' },
  recommended: { argb: 'FFFFFF' },
  optional:    { argb: '1F2937' },
};
const TIER_LABELS = {
  required:    'Obrigatório',
  conditional: 'Obrigatório (condicional)',
  recommended: 'Recomendado',
  optional:    'Opcional',
};

app.get('/herd/import/template', requireAuth, async (req, res) => {
  try {
    const farmId = req.saas?.farmId;
    const farm = farmId ? await prisma.farm.findUnique({ where: { id: farmId }, select: { name: true } }) : null;
    const farmName = farm?.name || 'Minha Fazenda';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EIXO';
    workbook.created = new Date();

    // =============================================
    // ABA 1 — DADOS (onde o produtor preenche)
    // =============================================
    const dados = workbook.addWorksheet('Dados', { properties: { tabColor: { argb: '2F8A3E' } } });

    // =============================================
    // ABA 2 — INSTRUÇÕES (referência consultiva)
    // =============================================
    const instrucoes = workbook.addWorksheet('Instruções', { properties: { tabColor: { argb: '7BB661' } } });

    // Título
    instrucoes.mergeCells('A1:E1');
    const titulo = instrucoes.getCell('A1');
    titulo.value = 'EIXO — Planilha de Importação do Rebanho';
    titulo.font = { bold: true, size: 16, color: { argb: '1F2937' }, name: 'Arial' };
    titulo.alignment = { vertical: 'middle', horizontal: 'left' };
    instrucoes.getRow(1).height = 28;

    // Subtítulo
    instrucoes.mergeCells('A2:E2');
    instrucoes.getCell('A2').value = 'Preencha os animais na aba "Dados". Use o cabeçalho com * para identificar campos obrigatórios.';
    instrucoes.getCell('A2').font = { size: 10, color: { argb: '6B7280' }, name: 'Arial' };
    instrucoes.getRow(2).height = 18;

    // Legenda de cores
    instrucoes.getCell('A4').value = 'Legenda';
    instrucoes.getCell('A4').font = { bold: true, size: 11, name: 'Arial' };

    const legendaItens = [
      { row: 5, cor: TIER_COLORS.required,    txt: '* Obrigatório — sem isso o animal não pode ser cadastrado.' },
      { row: 6, cor: TIER_COLORS.conditional, txt: '* Obrigatório condicional — depende de outro campo (ver descrição).' },
      { row: 7, cor: TIER_COLORS.recommended, txt: 'Recomendado — sistema funciona melhor com esse dado.' },
      { row: 8, cor: TIER_COLORS.optional,    txt: 'Opcional — preencha se tiver à mão.' },
    ];
    legendaItens.forEach(({ row, cor, txt }) => {
      const c = instrucoes.getCell(`A${row}`);
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: cor };
      c.value = '';
      instrucoes.getCell(`B${row}`).value = txt;
      instrucoes.getCell(`B${row}`).font = { size: 10, name: 'Arial' };
    });

    // Tabela detalhada (linha 10 em diante)
    const tabelaHeaderRow = 10;
    const tabHeaders = ['Coluna', 'Tipo', 'Exemplo', 'Descrição'];
    tabHeaders.forEach((h, idx) => {
      const c = instrucoes.getCell(tabelaHeaderRow, idx + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: 'FFFFFF' }, name: 'Arial' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F8A3E' } };
      c.alignment = { vertical: 'middle' };
    });
    instrucoes.getRow(tabelaHeaderRow).height = 22;

    TEMPLATE_COLUMNS.forEach((col, idx) => {
      const rowNum = tabelaHeaderRow + 1 + idx;
      const label = (col.tier === 'required' || col.tier === 'conditional') ? `${col.label} *` : col.label;
      instrucoes.getCell(rowNum, 1).value = label;
      instrucoes.getCell(rowNum, 2).value = TIER_LABELS[col.tier];
      instrucoes.getCell(rowNum, 3).value = col.example;
      instrucoes.getCell(rowNum, 4).value = col.description;
      for (let i = 1; i <= 4; i++) {
        instrucoes.getCell(rowNum, i).font = { size: 10, name: 'Arial' };
        instrucoes.getCell(rowNum, i).alignment = { vertical: 'middle', wrapText: true };
      }
      instrucoes.getCell(rowNum, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: TIER_COLORS[col.tier] };
      instrucoes.getCell(rowNum, 1).font = { size: 10, bold: true, color: TIER_FONT_COLORS[col.tier], name: 'Arial' };
    });

    instrucoes.getColumn(1).width = 28;
    instrucoes.getColumn(2).width = 24;
    instrucoes.getColumn(3).width = 22;
    instrucoes.getColumn(4).width = 70;

    // Preenche a aba Dados (definida no topo)
    const totalCols = TEMPLATE_COLUMNS.length;
    const lastColLetter = String.fromCharCode(64 + totalCols);

    // Linha 1 — Banner de aviso (mesclado em todas as colunas)
    dados.mergeCells(`A1:${lastColLetter}1`);
    const banner = dados.getCell('A1');
    banner.value = '💡  Legenda e descrição de cada coluna na aba "Instruções".   |   Dúvidas? Clique no balão de suporte EIXO no canto inferior direito do sistema.';
    banner.font = { bold: true, color: { argb: '1F2937' }, size: 11, name: 'Arial' };
    banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } };
    banner.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    banner.border = {
      bottom: { style: 'medium', color: { argb: '2F8A3E' } },
    };
    dados.getRow(1).height = 32;

    // Linha 2 — Cabeçalhos
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      const cell = dados.getCell(2, idx + 1);
      const label = (col.tier === 'required' || col.tier === 'conditional') ? `${col.label} *` : col.label;
      cell.value = label;
      cell.font = {
        bold: true,
        color: TIER_FONT_COLORS[col.tier],
        size: 11,
        name: 'Arial',
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: TIER_COLORS[col.tier] };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
        left: { style: 'thin', color: { argb: 'E5E7EB' } },
        right: { style: 'thin', color: { argb: 'E5E7EB' } },
      };
      cell.note = col.description;

      // Largura da coluna baseada no tipo
      const widthByType = { date: 16, number: 14, list: 22, text: 22 };
      dados.getColumn(idx + 1).width = widthByType[col.type] || 20;
    });
    dados.getRow(2).height = 36;

    // Exemplos de referência (linhas 3 e 4) — itálico cinza
    const exemplos = [
      // Nelore macho puro, PO, Touro
      {
        identificacao: 'EXEMPLO-1', sexo: 'MACHO', tipo_raca: 'Pura', raca: 'Nelore',
        composicao_mestica: '', raca_predominante: '', padrao_racial: 'PO', registro: 'RGN-5678',
        data_nascimento: '10/03/2021', ultimo_peso_kg: '620', data_pesagem: '01/06/2026',
        categoria: 'Touro', status_reprodutivo: '', previsao_parto: '',
        nome: 'Touro Imperial', pai_nome: 'Imperial', mae_nome: 'Princesa',
        observacoes: 'PO registrado ABCZ',
      },
      // Anelorado fêmea prenhe, Vaca de Cria
      {
        identificacao: 'EXEMPLO-2', sexo: 'FEMEA', tipo_raca: 'Mestiça', raca: '',
        composicao_mestica: 'Anelorado (predominância zebu)', padrao_racial: '', registro: '',
        data_nascimento: '05/07/2019', ultimo_peso_kg: '480', data_pesagem: '01/06/2026',
        categoria: 'Vaca', status_reprodutivo: 'PRENHE', previsao_parto: '15/01/2027',
        nome: '', pai_nome: '', mae_nome: '',
        observacoes: '',
      },
    ];

    exemplos.forEach((ex, rowOffset) => {
      TEMPLATE_COLUMNS.forEach((col, idx) => {
        const cell = dados.getCell(3 + rowOffset, idx + 1);
        cell.value = ex[col.key] ?? col.example;
        cell.font = { italic: true, color: { argb: '9CA3AF' }, size: 10, name: 'Arial' };
        cell.alignment = { vertical: 'middle', horizontal: (col.type === 'date' || col.type === 'number') ? 'center' : 'left' };
      });
    });

    // Freeze pane: banner + cabeçalho fixos (linhas 1–2)
    dados.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

    // =============================================
    // ABA 3 — LISTAS (oculta, usada pelos dropdowns)
    // =============================================
    const listas = workbook.addWorksheet('Listas', { state: 'hidden' });
    const listColumnsMap = {};
    let colLetter = 1;
    TEMPLATE_COLUMNS.forEach((col) => {
      if (col.type === 'list' && Array.isArray(col.options)) {
        const colChar = String.fromCharCode(64 + colLetter); // A, B, C...
        listas.getCell(1, colLetter).value = col.label;
        listas.getCell(1, colLetter).font = { bold: true, size: 10 };
        col.options.forEach((opt, i) => {
          listas.getCell(2 + i, colLetter).value = opt;
        });
        listColumnsMap[col.key] = `Listas!$${colChar}$2:$${colChar}$${1 + col.options.length}`;
        colLetter++;
      }
    });

    // Estilo único para as linhas onde o usuário digita (evita herdar itálico/cinza dos exemplos)
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      const colChar = String.fromCharCode(64 + idx + 1);
      const horizontal = (col.type === 'date' || col.type === 'number') ? 'center' : 'left';
      for (let row = 5; row <= 1002; row++) {
        const cell = dados.getCell(`${colChar}${row}`);
        cell.font = { name: 'Arial', size: 10, color: { argb: '1F2937' }, italic: false };
        cell.alignment = { vertical: 'middle', horizontal };
      }
    });

    // Aplica validação de dados (dropdowns) nas colunas tipo 'list' da aba Dados
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      if (col.type === 'list' && listColumnsMap[col.key]) {
        const colChar = String.fromCharCode(64 + idx + 1);
        for (let row = 3; row <= 1002; row++) { // permite até 1000 linhas (linha 3 = exemplo)
          dados.getCell(`${colChar}${row}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`=${listColumnsMap[col.key]}`],
            showErrorMessage: true,
            errorStyle: 'warning',
            errorTitle: 'Valor inválido',
            error: `Use um valor da lista para ${col.label}.`,
          };
        }
      }
      if (col.type === 'date') {
        const colChar = String.fromCharCode(64 + idx + 1);
        for (let row = 3; row <= 1002; row++) {
          dados.getCell(`${colChar}${row}`).numFmt = 'dd/mm/yyyy';
        }
      }
      if (col.type === 'number') {
        const colChar = String.fromCharCode(64 + idx + 1);
        for (let row = 3; row <= 1002; row++) {
          dados.getCell(`${colChar}${row}`).numFmt = '0.##';
        }
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const filename = `[EIXO] ${farmName} - Cadastro de Rebanho.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Erro ao gerar planilha modelo:', error);
    return res.status(500).json({ message: 'Erro ao gerar planilha modelo.' });
  }
});

// =============================================
// UPLOAD DE PLANILHA — Importação simplificada (novo template)
// =============================================

// Multer em memória, limite 5MB, extensões permitidas
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Formato não suportado. Use .xlsx, .xls ou .csv.'));
    }
  },
});

const uploadHerdImportFile = (req, res, next) => {
  uploadMemory.single('file')(req, res, (error) => {
    if (!error) return next();

    if (error?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Arquivo maior que 5MB. Envie uma planilha menor.' });
    }

    return res.status(400).json({
      message: error?.message || 'Erro ao receber arquivo. Use .xlsx, .xls ou .csv.',
    });
  });
};

// Mapa: label da planilha (com ou sem "*") → key técnica
const LABEL_TO_KEY = (() => {
  const map = {};
  TEMPLATE_COLUMNS.forEach((col) => {
    // Aceita label atual, com asterisco, e key técnica
    map[normalizeHeader(col.label)] = col.key;
    map[normalizeHeader(`${col.label} *`)] = col.key;
    map[normalizeHeader(col.key)] = col.key;
  });
  // Labels antigos (compatibilidade com planilhas baixadas em versões anteriores)
  map[normalizeHeader('Raça')] = 'raca';
  map[normalizeHeader('Raça *')] = 'raca';
  map[normalizeHeader('Composição Mestiça')] = 'composicao_mestica';
  map[normalizeHeader('Composição Mestiça *')] = 'composicao_mestica';
  return map;
})();

function normalizeHeader(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/\s+/g, ' ')
    .replace(/\*/g, '')
    .trim()
    .toLowerCase();
}

function parseSpreadsheet(buffer, originalName) {
  // SheetJS lê .xlsx, .xls e .csv direto do buffer
  const wb = XLSX.read(buffer, { type: 'buffer' });
  // Procura a aba "Dados" (case-insensitive); se não achar, usa a primeira
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'dados') || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error('Planilha vazia ou sem abas.');

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

  // Detectar linha de cabeçalho: primeira linha que tenha "Identificação" (com ou sem *)
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = rawRows[i] || [];
    if (row.some((cell) => normalizeHeader(cell).includes('identificacao'))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx < 0) throw new Error('Cabeçalho não encontrado. A primeira coluna deve ser "Identificação".');

  const headers = (rawRows[headerRowIdx] || []).map(normalizeHeader);
  const keys = headers.map((h) => LABEL_TO_KEY[h] || null);

  const EXAMPLE_IDS = new Set(['EXEMPLO-1', 'EXEMPLO-2']);

  const rows = [];
  for (let i = headerRowIdx + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!Array.isArray(row)) continue;
    const obj = {};
    keys.forEach((k, j) => {
      if (k && row[j] !== undefined && row[j] !== null && row[j] !== '') {
        obj[k] = row[j];
      }
    });
    if (Object.keys(obj).length === 0) continue;
    if (EXAMPLE_IDS.has(String(obj.identificacao || '').trim())) continue;
    obj.__line = i + 1;
    rows.push(obj);
  }
  return rows;
}

function validateUploadRow(row, line) {
  const errs = [];
  if (!row.identificacao || !String(row.identificacao).trim()) {
    errs.push('Identificação é obrigatória');
  }
  const sexo = normalizeSexoImport(row.sexo);
  if (!sexo) errs.push('Sexo é obrigatório (MACHO ou FEMEA)');

  const tipoRaca = String(row.tipo_raca || '').trim().toLowerCase();
  const racaPreenchida = String(row.raca || '').trim();
  const composicaoPreenchida = String(row.composicao_mestica || '').trim();

  if (!tipoRaca) {
    errs.push('Tipo de Raça é obrigatório (Pura ou Mestiça)');
  } else if (!['pura', 'mestica', 'mestiça'].includes(tipoRaca)) {
    errs.push('Tipo de Raça deve ser "Pura" ou "Mestiça"');
  } else if (tipoRaca === 'pura' && !racaPreenchida) {
    errs.push('Raça (se Pura) precisa ser preenchida');
  } else if (
    (tipoRaca === 'mestica' || tipoRaca === 'mestiça')
    && !composicaoPreenchida
    && !racaPreenchida
  ) {
    // Tolerante: aceita se houver Raça OU Composição preenchida
    errs.push('Preencha Composição (se Mestiça) ou Raça quando Tipo = Mestiça');
  }

  // Inclui dados originais para permitir geração de planilha de correção
  return errs.length > 0
    ? { line, motivos: errs, identificacao: row.identificacao || null, dados: { ...row } }
    : null;
}

app.post('/herd/import/upload', requireAuth, uploadHerdImportFile, async (req, res) => {
  try {
    const { farmId } = req.body || {};
    if (!farmId) {
      return res.status(400).json({ message: 'farmId é obrigatório.' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Arquivo não enviado.' });
    }

    let rows;
    try {
      rows = parseSpreadsheet(req.file.buffer, req.file.originalname);
    } catch (err) {
      return res.status(400).json({ message: err.message || 'Erro ao ler a planilha.' });
    }

    if (!rows.length) {
      return res.status(400).json({ message: 'Planilha sem linhas para importar.' });
    }
    if (rows.length > 1000) {
      return res.status(400).json({ message: `Limite de 1000 linhas por importação. Sua planilha tem ${rows.length}.` });
    }

    const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: String(farmId) }) });
    if (!farm) {
      return res.status(404).json({ message: 'Fazenda não encontrada ou sem acesso.' });
    }

    const erros = [];
    const prepared = [];
    const identityLines = new Map();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = row.__line || i + 1;
      const err = validateUploadRow(row, line);
      if (err) { erros.push(err); continue; }
      const brinco = String(row.identificacao).trim();
      const identityKey = normalizeAnimalIdentityKey(brinco);
      if (identityLines.has(identityKey)) {
        erros.push({ line, identificacao: brinco, motivos: [`Identificação duplicada na planilha (também na linha ${identityLines.get(identityKey)})`], dados: { ...row } });
        continue;
      }
      identityLines.set(identityKey, line);
        const sexo = normalizeSexoImport(row.sexo);
        const tipoRacaRaw = String(row.tipo_raca || '').trim().toLowerCase();
        const isPura = tipoRacaRaw === 'pura';
        const tipoRacaNormalizado = isPura ? 'Pura' : (tipoRacaRaw ? 'Mestiça' : null);

        // Tolerância: se Mestiça e só Raça foi preenchida (sem Composição),
        // marca Composição como "Comercial / Sem definição" e usa Raça como predominante
        const racaInput = String(row.raca || '').trim();
        const composicaoInput = String(row.composicao_mestica || '').trim();
        const racaPredominanteInput = String(row.raca_predominante || '').trim();
        let composicaoFinal = composicaoInput;
        let racaPredominanteFinal = racaPredominanteInput;
        if (!isPura && !composicaoInput && racaInput) {
          composicaoFinal = 'Comercial / Sem definição';
          racaPredominanteFinal = racaPredominanteFinal || racaInput;
        }

        const dataNascimento = parseImportDate(row.data_nascimento);
        const previsaoParto = parseImportDate(row.previsao_parto);
        const dataPesagem = parseImportDate(row.data_pesagem);
        const pesoAtual = parseNumber(row.ultimo_peso_kg);
        if ((row.data_nascimento && !dataNascimento) || (row.data_pesagem && !dataPesagem) || (row.ultimo_peso_kg && (!pesoAtual || pesoAtual <= 0))) {
          erros.push({ line, identificacao: brinco, motivos: ['Data ou peso inválido'], dados: { ...row } });
          continue;
        }
        prepared.push({ line, brinco, identityKey, dataPesagem, pesoAtual, data: {
            farmId,
            brinco,
            identityKey,
            nome: String(row.nome || '').trim() || null,
            brincoEletronico: String(row.brinco_eletronico || '').trim() || null,
            tipoRaca: tipoRacaNormalizado,
            raca: isPura ? (racaInput || null) : null,
            padraoRacial: isPura ? (String(row.padrao_racial || '').trim() || null) : null,
            composicaoMestica: !isPura ? (composicaoFinal || null) : null,
            racaPredominante: !isPura ? (racaPredominanteFinal || null) : null,
            tipoCadastro: 'MESTICO', // refinado depois pela tela de animal
            sexo,
            dataNascimento,
            pesoAtual,
            statusReprodutivo: String(row.status_reprodutivo || '').trim() || null,
            previsaoParto,
            registro: String(row.registro || '').trim() || null,
            paiNome: String(row.pai_nome || '').trim() || null,
            maeNome: String(row.mae_nome || '').trim() || null,
            observacoes: String(row.observacoes || '').trim() || null,
            categoria: String(row.categoria || '').trim() || null,
        } });
    }

    if (prepared.length) {
      const existing = await prisma.animal.findMany({ where: { farmId, identityKey: { in: prepared.map((item) => item.identityKey) } }, select: { identityKey: true } });
      const existingKeys = new Set(existing.map((item) => item.identityKey));
      prepared.forEach((item) => {
        if (existingKeys.has(item.identityKey)) erros.push({ line: item.line, identificacao: item.brinco, motivos: ['Animal já existe'], dados: { identificacao: item.brinco } });
      });
    }
    if (erros.length) {
      return res.status(422).json({ total: rows.length, criados: 0, ignorados: 0, erros: erros.length, detalhes: { criados: [], ignorados: [], erros } });
    }

    const criados = await prisma.$transaction(async (tx) => {
      const result = [];
      for (const item of prepared) {
        const animal = await tx.animal.create({ data: item.data });
        if (item.dataPesagem && item.pesoAtual) {
          await tx.weighing.create({ data: { animalId: animal.id, data: item.dataPesagem, peso: item.pesoAtual, gmd: 0, source: 'MANUAL' } });
        }
        result.push({ line: item.line, id: animal.id, identificacao: item.brinco });
      }
      return result;
    });

    return res.json({
      total: rows.length,
      criados: criados.length,
      ignorados: 0,
      erros: 0,
      detalhes: { criados, ignorados: [], erros: [] },
    });
  } catch (error) {
    console.error('Erro no upload de rebanho:', error);
    return res.status(500).json({ message: 'Erro interno ao processar planilha.' });
  }
});

// =============================================
// PLANILHA DE ERROS — Para o cliente corrigir e reenviar
// =============================================
app.post('/herd/import/erros-xlsx', requireAuth, async (req, res) => {
  try {
    const { erros } = req.body || {};
    if (!Array.isArray(erros) || erros.length === 0) {
      return res.status(400).json({ message: 'Nenhum erro informado.' });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'EIXO';
    wb.created = new Date();
    const ws = wb.addWorksheet('Erros para corrigir', { properties: { tabColor: { argb: 'A32D2D' } } });

    const totalCols = TEMPLATE_COLUMNS.length;
    const lastColLetter = String.fromCharCode(64 + totalCols + 1); // +1 = coluna de Motivo

    // Banner
    ws.mergeCells(`A1:${lastColLetter}1`);
    const banner = ws.getCell('A1');
    banner.value = '⚠  Corrija as linhas abaixo e reenvie a planilha em "Importar Rebanho → Enviar planilha preenchida". O motivo do erro está na última coluna (em vermelho).';
    banner.font = { bold: true, color: { argb: '7F1D1D' }, size: 11, name: 'Arial' };
    banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
    banner.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    banner.border = { bottom: { style: 'medium', color: { argb: 'A32D2D' } } };
    ws.getRow(1).height = 32;

    // Cabeçalhos (linha 2)
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      const cell = ws.getCell(2, idx + 1);
      const label = (col.tier === 'required' || col.tier === 'conditional') ? `${col.label} *` : col.label;
      cell.value = label;
      cell.font = { bold: true, color: TIER_FONT_COLORS[col.tier], size: 11, name: 'Arial' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: TIER_COLORS[col.tier] };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      const widthByType = { date: 16, number: 14, list: 22, text: 22 };
      ws.getColumn(idx + 1).width = widthByType[col.type] || 20;
    });
    // Coluna extra "Motivo do erro"
    const motivoCol = ws.getCell(2, totalCols + 1);
    motivoCol.value = 'Motivo do erro';
    motivoCol.font = { bold: true, color: { argb: 'FFFFFF' }, size: 11, name: 'Arial' };
    motivoCol.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'A32D2D' } };
    motivoCol.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    ws.getColumn(totalCols + 1).width = 50;
    ws.getRow(2).height = 36;

    // Linhas com dados pré-preenchidos
    erros.forEach((err, idx) => {
      const rowNum = 3 + idx;
      const dados = err?.dados || {};
      TEMPLATE_COLUMNS.forEach((col, colIdx) => {
        const cell = ws.getCell(rowNum, colIdx + 1);
        const val = dados[col.key];
        if (val !== undefined && val !== null && val !== '') {
          cell.value = val;
        }
        cell.font = { size: 10, name: 'Arial' };
        cell.alignment = { vertical: 'middle' };
        if (col.type === 'date') cell.numFmt = 'dd/mm/yyyy';
        if (col.type === 'number') cell.numFmt = '0.##';
      });
      const motivoCell = ws.getCell(rowNum, totalCols + 1);
      motivoCell.value = (err?.motivos || []).join(' · ');
      motivoCell.font = { size: 10, color: { argb: 'A32D2D' }, bold: true, name: 'Arial' };
      motivoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
      motivoCell.alignment = { vertical: 'middle', wrapText: true };
    });

    // Freeze pane na linha 2
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="[EIXO] Linhas com erro.xlsx"');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Erro ao gerar planilha de erros:', error);
    return res.status(500).json({ message: 'Erro ao gerar planilha de erros.' });
  }
});

const PO_TEMPLATE_COLUMNS = [
  { key: 'nome', label: 'Nome', required: true },
  { key: 'identificacao', label: 'Brinco', required: true },
  { key: 'registro', label: 'Registro', required: false },
  { key: 'raca', label: 'Raça', required: true },
  { key: 'sexo', label: 'Sexo', required: true },
  { key: 'data_nascimento', label: 'Data de Nascimento', required: false },
  { key: 'ultimo_peso_kg', label: 'Último Peso (kg)', required: false },
  { key: 'data_pesagem', label: 'Data da Pesagem', required: false },
  { key: 'categoria', label: 'Categoria', required: false },
  { key: 'pasto', label: 'Pasto', required: true },
  { key: 'lote', label: 'Lote P.O.', required: false },
  { key: 'mae', label: 'Mãe (brinco ou registro)', required: false },
  { key: 'pai', label: 'Pai (brinco ou registro)', required: false },
  { key: 'observacoes', label: 'Observações', required: false },
];

const parsePoSpreadsheet = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames.find((name) => normalizeHeader(name) === 'dados') || workbook.SheetNames[0]];
  if (!sheet) throw new Error('Planilha vazia ou sem abas.');
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  const labels = new Map(PO_TEMPLATE_COLUMNS.flatMap((column) => [[normalizeHeader(column.label), column.key], [normalizeHeader(column.key), column.key]]));
  const headerIndex = rawRows.findIndex((row, index) => index < 6 && row.some((cell) => labels.has(normalizeHeader(cell))));
  if (headerIndex < 0) throw new Error('Cabeçalho da planilha P.O. não encontrado.');
  const keys = rawRows[headerIndex].map((cell) => labels.get(normalizeHeader(cell)) || null);
  return rawRows.slice(headerIndex + 1).map((row, index) => {
    const data = { __line: headerIndex + index + 2 };
    keys.forEach((key, columnIndex) => {
      if (key && row[columnIndex] !== undefined && row[columnIndex] !== null && row[columnIndex] !== '') data[key] = row[columnIndex];
    });
    return data;
  }).filter((row) => Object.keys(row).length > 1);
};

app.get('/po/herd/import/template', requireAuth, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EIXO';
    const sheet = workbook.addWorksheet('Dados');
    sheet.addRow(PO_TEMPLATE_COLUMNS.map((column) => `${column.label}${column.required ? ' *' : ''}`));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F8A3E' } };
    sheet.columns.forEach((column) => { column.width = 24; });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const instructions = workbook.addWorksheet('Instruções');
    instructions.addRows([
      ['Importação do Plantel P.O.'],
      ['Nome, brinco, raça, sexo e pasto são obrigatórios.'],
      ['Mãe e pai podem ser informados por brinco ou registro e devem pertencer à mesma fazenda.'],
      ['A importação é tudo ou nada: qualquer erro impede a criação de todas as linhas.'],
    ]);
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="[EIXO] Modelo Plantel PO.xlsx"');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao gerar modelo do Plantel P.O.' });
  }
});

app.post('/po/herd/import/upload', requireAuth, uploadHerdImportFile, async (req, res) => {
  try {
    const farmId = String(req.body?.farmId || '');
    if (!farmId || !req.file) return res.status(400).json({ message: 'Informe fazenda e arquivo.' });
    const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: farmId }) });
    if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada ou sem acesso.' });
    let rows;
    try { rows = parsePoSpreadsheet(req.file.buffer); } catch (error) { return res.status(400).json({ message: error.message }); }
    if (!rows.length) return res.status(400).json({ message: 'Planilha P.O. sem linhas para importar.' });
    if (rows.length > 1000) return res.status(400).json({ message: 'Limite de 1000 linhas por importação.' });

    const [paddocks, lots, existingAnimals] = await Promise.all([
      prisma.paddock.findMany({ where: { farmId }, select: { id: true, name: true } }),
      prisma.poLot.findMany({ where: { farmId }, select: { id: true, name: true } }),
      prisma.poAnimal.findMany({ where: { farmId }, select: { id: true, brinco: true, registro: true, sexo: true } }),
    ]);
    const paddockByName = new Map(paddocks.map((item) => [normalizeHeader(item.name), item]));
    const lotByName = new Map(lots.map((item) => [normalizeHeader(item.name), item]));
    const existingByRef = new Map();
    existingAnimals.forEach((animal) => {
      if (animal.brinco) existingByRef.set(normalizeHeader(animal.brinco), animal);
      if (animal.registro) existingByRef.set(normalizeHeader(animal.registro), animal);
    });
    const errors = [];
    const prepared = [];
    const usedIds = new Set();
    for (const row of rows) {
      const line = row.__line;
      const nome = String(row.nome || '').trim();
      const brinco = String(row.identificacao || '').trim();
      const registro = String(row.registro || '').trim();
      const raca = String(row.raca || '').trim();
      const sexo = normalizeSexoImport(String(row.sexo || ''));
      const paddock = paddockByName.get(normalizeHeader(row.pasto));
      const lot = row.lote ? lotByName.get(normalizeHeader(row.lote)) : null;
      const birthDate = row.data_nascimento ? parseImportDate(row.data_nascimento) : null;
      const weighingDate = row.data_pesagem ? parseImportDate(row.data_pesagem) : null;
      const weight = row.ultimo_peso_kg ? parseNumber(row.ultimo_peso_kg) : null;
      const reasons = [];
      if (!nome || !brinco || !raca || !sexo || !paddock) reasons.push('Nome, brinco, raça, sexo e pasto são obrigatórios');
      if (usedIds.has(normalizeHeader(brinco)) || existingByRef.has(normalizeHeader(brinco))) reasons.push('Brinco duplicado');
      if (row.lote && !lot) reasons.push('Lote P.O. não encontrado na fazenda');
      if (row.data_nascimento && !birthDate) reasons.push('Data de nascimento inválida');
      if (row.data_pesagem && !weighingDate) reasons.push('Data de pesagem inválida');
      if (row.ultimo_peso_kg && (!weight || weight <= 0)) reasons.push('Peso inválido');
      if (reasons.length) errors.push({ line, identificacao: brinco, motivos: reasons, dados: { ...row } });
      else {
        usedIds.add(normalizeHeader(brinco));
        prepared.push({ line, nome, brinco, registro, raca, sexo, paddock, lot, birthDate, weighingDate, weight, maeRef: String(row.mae || '').trim(), paiRef: String(row.pai || '').trim(), categoria: String(row.categoria || '').trim(), observacoes: String(row.observacoes || '').trim(), raw: { ...row } });
      }
    }

    const preparedByRef = new Map();
    prepared.forEach((item) => {
      preparedByRef.set(normalizeHeader(item.brinco), item);
      if (item.registro) preparedByRef.set(normalizeHeader(item.registro), item);
    });
    prepared.forEach((item) => {
      for (const [kind, ref, expectedSex] of [['Mãe', item.maeRef, 'FEMEA'], ['Pai', item.paiRef, 'MACHO']]) {
        if (!ref) continue;
        const parent = existingByRef.get(normalizeHeader(ref)) || preparedByRef.get(normalizeHeader(ref));
        if (!parent) errors.push({ line: item.line, identificacao: item.brinco, motivos: [`${kind} não encontrado(a)`], dados: item.raw });
        else if (parent === item || parent.sexo !== expectedSex) errors.push({ line: item.line, identificacao: item.brinco, motivos: [`${kind} inválido(a)`], dados: item.raw });
      }
    });
    if (errors.length) return res.status(422).json({ total: rows.length, criados: 0, ignorados: 0, erros: errors.length, detalhes: { criados: [], ignorados: [], erros: errors } });

    const created = await prisma.$transaction(async (tx) => {
      const createdByRef = new Map();
      const result = [];
      for (const item of prepared) {
        const animal = await tx.poAnimal.create({ data: { farmId, nome: item.nome, brinco: item.brinco, registro: item.registro || null, raca: item.raca, sexo: item.sexo, dataNascimento: item.birthDate, pesoAtual: item.weight || 0, categoria: item.categoria || null, observacoes: item.observacoes || null, currentPaddockId: item.paddock.id, lotId: item.lot?.id || null } });
        createdByRef.set(normalizeHeader(item.brinco), animal);
        if (item.registro) createdByRef.set(normalizeHeader(item.registro), animal);
        await tx.paddockMove.create({ data: { farmId, paddockId: item.paddock.id, poAnimalId: animal.id, startAt: item.weighingDate || item.birthDate || new Date() } });
        if (item.weight && item.weighingDate) await tx.poWeighing.create({ data: { farmId, poAnimalId: animal.id, data: item.weighingDate, peso: item.weight, gmd: 0 } });
        result.push({ line: item.line, id: animal.id, identificacao: item.brinco });
      }
      for (const item of prepared) {
        if (!item.maeRef && !item.paiRef) continue;
        const animal = createdByRef.get(normalizeHeader(item.brinco));
        const mae = item.maeRef ? (existingByRef.get(normalizeHeader(item.maeRef)) || createdByRef.get(normalizeHeader(item.maeRef))) : null;
        const pai = item.paiRef ? (existingByRef.get(normalizeHeader(item.paiRef)) || createdByRef.get(normalizeHeader(item.paiRef))) : null;
        await tx.poAnimal.update({ where: { id: animal.id }, data: { maeId: mae?.id || null, paiId: pai?.id || null, matrizResponsavelId: mae?.id || null, tatuagemOrelhaEsquerda: mae?.brinco || mae?.registro || null } });
      }
      return result;
    });
    return res.json({ total: rows.length, criados: created.length, ignorados: 0, erros: 0, detalhes: { criados: created, ignorados: [], erros: [] } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro interno ao importar Plantel P.O.' });
  }
});

app.post('/po/herd/import/erros-xlsx', requireAuth, async (req, res) => {
  try {
    const errors = Array.isArray(req.body?.erros) ? req.body.erros : [];
    if (!errors.length) return res.status(400).json({ message: 'Nenhum erro informado.' });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Erros P.O.');
    sheet.addRow([...PO_TEMPLATE_COLUMNS.map((column) => column.label), 'Motivo do erro']);
    errors.forEach((error) => sheet.addRow([...PO_TEMPLATE_COLUMNS.map((column) => error?.dados?.[column.key] ?? ''), (error?.motivos || []).join(' · ')]));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'A32D2D' } };
    sheet.columns.forEach((column) => { column.width = 24; });
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="[EIXO] Erros Plantel PO.xlsx"');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao gerar planilha de erros P.O.' });
  }
});

// =============================================
// IMPORTAÇÃO DE PLANILHA — Rebanho Comercial (rota antiga em JSON, mantida)
// =============================================

const REQUIRED_COLUMNS = ['identificacao'];
const OPTIONAL_COLUMNS = [
  'brinco_eletronico', 'nome', 'sexo', 'categoria', 'possui_registro',
  'raca', 'padrao_racial', 'ultimo_peso_kg', 'data_pesagem_atual',
  'data_nascimento', 'idade_estimada_meses', 'funcao_reprodutiva',
  'status_reprodutivo', 'data_ultimo_servico', 'tipo_servico_reprodutivo',
  'touro_ou_semen', 'registro_touro_ou_semen', 'data_diagnostico_prenhez',
  'resultado_prenhez', 'previsao_parto', 'data_ultimo_parto',
  'quantidade_partos', 'registro_rgn', 'registro_rgd',
  'pai_nome', 'pai_registro', 'mae_nome', 'mae_registro',
  'forma_entrada', 'origem_animal', 'fornecedor', 'valor_compra', 'data_compra',
  'peso_compra', 'status_sanitario', 'ultima_vacina', 'data_ultima_vacina',
  'ultimo_tratamento', 'data_ultimo_tratamento', 'carencia_ate',
  'observacao_geral',
];

function normalizeSexoImport(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'macho' || v === 'm') return 'MACHO';
  if (v === 'femea' || v === 'fêmea' || v === 'f') return 'FEMEA';
  return null;
}

function normalizeTipoCadastroImport(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'rbt' || v === 'rbt 37') return 'RBT';
  if (v === 'registro' || v === 'com registro') return 'REGISTRO';
  return 'MESTICO';
}

function normalizeReproEventTypeImport(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v.includes('insemin') || v === 'ia' || v === 'iatf') return 'IATF';
  if (v.includes('monta') || v.includes('touco') || v.includes('cobertura') || v.includes('servico')) return 'COBERTURA';
  if (v.includes('parto')) return 'PARTO';
  if (v.includes('diagn') || v.includes('prenhez')) return 'DIAGNOSTICO_PRENHEZ';
  if (v.includes('desmam')) return 'DESMAME';
  return null;
}

function parseImportDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + value * 86400000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  // Formato brasileiro DD/MM/AAAA (ou DD-MM-AAAA)
  const brMatch = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    let year = parseInt(brMatch[3], 10);
    if (year < 100) year += year < 50 ? 2000 : 1900; // 26→2026, 99→1999
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Fallback: tenta ISO (AAAA-MM-DD) ou qualquer outro formato reconhecido
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateImportRows(rows) {
  const errors = [];
  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push('Nenhuma linha para importar.');
    return errors;
  }
  if (rows.length > 2000) {
    errors.push('Limite de 2000 linhas por importação.');
    return errors;
  }
  const allColumns = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
  const headerRow = rows[0];
  if (headerRow && typeof headerRow === 'object') {
    const cols = Object.keys(headerRow);
    const unknown = cols.filter(c => !allColumns.includes(c));
    if (unknown.length > 0) {
      errors.push(`Colunas não reconhecidas: ${unknown.join(', ')}`);
    }
  }
  rows.forEach((row, i) => {
    const line = i + 1;
    if (!row?.identificacao?.trim()) {
      errors.push(`Linha ${line}: identificacao é obrigatória.`);
    }
  });
  return errors;
}

app.post('/herd/import', requireAuth, async (req, res) => {
  const { farmId, rows } = req.body || {};

  if (!farmId) {
    return res.status(400).json({ message: 'farmId é obrigatório.' });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'rows é obrigatório e deve ser um array.' });
  }

  const validationErrors = validateImportRows(rows);
  if (validationErrors.length > 0) {
    return res.status(400).json({ message: 'Erros de validação.', errors: validationErrors });
  }

  const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: String(farmId) }) });
  if (!farm) {
    return res.status(404).json({ message: 'Fazenda não encontrada ou sem acesso.' });
  }

  const results = [];
  const createdAnimals = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;
    const rowResult = { line, brinco: row.identificacao, status: 'ok', created: {} };

    try {
      const brinco = row.identificacao?.trim();
      if (!brinco) {
        rowResult.status = 'error';
        rowResult.errors = ['identificacao obrigatória'];
        results.push(rowResult);
        continue;
      }

      const identityKey = normalizeAnimalIdentityKey(brinco);

      const existing = await prisma.animal.findFirst({
        where: { farmId, identityKey },
      });
      if (existing) {
        rowResult.status = 'skipped';
        rowResult.message = 'Animal já existe';
        rowResult.existingId = existing.id;
        results.push(rowResult);
        createdAnimals.push(existing);
        continue;
      }

      const Sexo = normalizeSexoImport(row.sexo);
      const tipoCadastro = normalizeTipoCadastroImport(row.possui_registro);
      const dataNascimento = parseImportDate(row.data_nascimento);
      const previsaoParto = parseImportDate(row.previsao_parto);

      const animal = await prisma.animal.create({
        data: {
          farmId,
          brinco,
          identityKey,
          nome: row.nome?.trim() || null,
          brincoEletronico: row.brinco_eletronico?.trim() || null,
          raca: row.raca?.trim() || null,
          padraoRacial: row.padrao_racial?.trim() || null,
          tipoCadastro,
          sexo: Sexo,
          categoria: row.categoria?.trim() || null,
          dataNascimento,
          pesoAtual: parseNumber(row.ultimo_peso_kg),
          funcaoReprodutiva: row.funcao_reprodutiva?.trim() || null,
          statusReprodutivo: row.status_reprodutivo?.trim() || null,
          previsaoParto,
          registro: [row.registro_rgn, row.registro_rgd].filter(Boolean).map(String).join(', ') || null,
          observacoes: row.observacao_geral?.trim() || null,
        },
      });

      rowResult.created.animal = animal.id;
      createdAnimals.push(animal);

      if (row.pai_nome?.trim() || row.pai_registro?.trim()) {
        const paiKey = normalizeAnimalIdentityKey(row.pai_registro?.trim() || row.pai_nome.trim());
        const pai = await prisma.animal.findFirst({
          where: { farmId, identityKey: paiKey },
        });
        if (pai) {
          await prisma.animal.update({ where: { id: animal.id }, data: { paiId: pai.id } });
          rowResult.created.pai = pai.id;
        }
      }

      if (row.mae_nome?.trim() || row.mae_registro?.trim()) {
        const maeKey = normalizeAnimalIdentityKey(row.mae_registro?.trim() || row.mae_nome.trim());
        const mae = await prisma.animal.findFirst({
          where: { farmId, identityKey: maeKey },
        });
        if (mae) {
          await prisma.animal.update({ where: { id: animal.id }, data: { maeId: mae.id } });
          rowResult.created.mae = mae.id;
        }
      }

      const dataPesagem = parseImportDate(row.data_pesagem_atual);
      const pesoAtual = parseNumber(row.ultimo_peso_kg);
      if (dataPesagem && pesoAtual) {
        const weighing = await prisma.weighing.create({
          data: { animalId: animal.id, data: dataPesagem, peso: pesoAtual, gmd: 0, source: 'MANUAL' },
        }).catch(() => null);
        if (weighing) rowResult.created.weighing = weighing.id;
      }

      const pesoCompra = parseNumber(row.peso_compra);
      const dataCompra = parseImportDate(row.data_compra);
      const valorCompra = parseNumber(row.valor_compra);
      const formaEntrada = row.forma_entrada?.trim();
      const origemAnimal = row.origem_animal?.trim();
      const fornecedor = row.fornecedor?.trim();

      if (formaEntrada || dataCompra || valorCompra || origemAnimal || fornecedor || pesoCompra) {
        const eventType = formaEntrada?.toUpperCase() === 'COMPRA' ? 'COMPRA' :
          formaEntrada?.toUpperCase() === 'NASCIMENTO' ? 'NASCIMENTO' : 'COMPRA';
        const eventDate = dataCompra || dataNascimento || new Date();

        const herdEvent = await prisma.herdEvent.create({
          data: {
            farmId,
            animalId: animal.id,
            type: eventType,
            date: eventDate,
            peso: pesoCompra,
            valor: valorCompra,
            origem: [origemAnimal, fornecedor].filter(Boolean).join(' — ') || null,
            observacoes: [`Forma de entrada: ${eventType}`].filter(Boolean).join('. ') || null,
            purchasePurpose: eventType === 'COMPRA' ? 'PRODUCTION' : null,
          },
        });
        rowResult.created.herdEvent = herdEvent.id;

        if (valorCompra && valorCompra > 0) {
          const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
          if (financialMap) {
            const ft = await createIntegratedTransaction(prisma, {
              farmId,
              type: financialMap.type,
              categoria: financialMap.categoria,
              accountCategoryId: eventType === 'COMPRA' ? 'sys-compra-animais-producao' : financialMap.categoryId,
              amount: valorCompra,
              competenceDate: eventDate,
              description: `${eventType} de animal — ${brinco}`,
              herdEventId: herdEvent.id,
              animalId: animal.id,
              allocations: (animal.lotId || animal.currentPaddockId) ? [{ lotId: animal.lotId, paddockId: animal.currentPaddockId }] : [],
            });
            rowResult.created.financialTransaction = ft.id;
          }
        }
      }

      const ultimaVacina = row.ultima_vacina?.trim();
      const dataUltimaVacina = parseImportDate(row.data_ultima_vacina);
      const ultimoTratamento = row.ultimo_tratamento?.trim();
      const dataUltimoTratamento = parseImportDate(row.data_ultimo_tratamento);
      const carenciaAte = parseImportDate(row.carencia_ate);

      if (ultimaVacina && dataUltimaVacina) {
        const record = await prisma.sanitaryRecord.create({
          data: {
            farmId,
            animalId: animal.id,
            tipo: 'VACINA',
            produto: ultimaVacina,
            date: dataUltimaVacina,
            observacoes: carenciaAte ? `Carência até: ${carenciaAte.toISOString().split('T')[0]}` : null,
          },
        });
        rowResult.created.sanitaryRecordVacina = record.id;
      }

      if (ultimoTratamento && dataUltimoTratamento) {
        const record = await prisma.sanitaryRecord.create({
          data: {
            farmId,
            animalId: animal.id,
            tipo: 'TRATAMENTO',
            produto: ultimoTratamento,
            date: dataUltimoTratamento,
            observacoes: carenciaAte ? `Carência até: ${carenciaAte.toISOString().split('T')[0]}` : null,
          },
        });
        rowResult.created.sanitaryRecordTratamento = record.id;
      }

      const dataUltimoServico = parseImportDate(row.data_ultimo_servico);
      const tipoServico = normalizeReproEventTypeImport(row.tipo_servico_reprodutivo);
      const touroOuSemen = row.touro_ou_semen?.trim();
      const registroTouroSemen = row.registro_touro_ou_semen?.trim();

      if (dataUltimoServico && tipoServico) {
        const reproEvent = await prisma.reproEvent.create({
          data: {
            farmId,
            animalId: animal.id,
            type: tipoServico,
            date: dataUltimoServico,
            notes: [touroOuSemen, registroTouroSemen].filter(Boolean).join(' — ') || null,
          },
        });
        rowResult.created.reproEventServico = reproEvent.id;
      }

      const dataDiagnostico = parseImportDate(row.data_diagnostico_prenhez);
      const resultadoPrenhez = row.resultado_prenhez?.trim();

      if (dataDiagnostico) {
        const reproEvent = await prisma.reproEvent.create({
          data: {
            farmId,
            animalId: animal.id,
            type: 'DIAGNOSTICO_PRENHEZ',
            date: dataDiagnostico,
            notes: resultadoPrenhez || null,
          },
        });
        rowResult.created.reproEventDiagnostico = reproEvent.id;
      }

      const dataUltimoParto = parseImportDate(row.data_ultimo_parto);
      if (dataUltimoParto) {
        const reproEvent = await prisma.reproEvent.create({
          data: {
            farmId,
            animalId: animal.id,
            type: 'PARTO',
            date: dataUltimoParto,
          },
        });
        rowResult.created.reproEventParto = reproEvent.id;
      }

    } catch (error) {
      console.error(`Importação linha ${line}:`, error.message);
      rowResult.status = 'error';
      rowResult.errors = [error.message];
    }

    results.push(rowResult);
  }

  const summary = {
    total: rows.length,
    created: results.filter(r => r.status === 'ok').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
  };

  logActivity(req, {
    action: 'HERD_IMPORT',
    entity: 'Animal',
    description: `Importação em lote: ${summary.created} criados, ${summary.skipped} ignorados, ${summary.errors} erros`,
    farmId,
  });

  return res.status(201).json({ summary, results });
});

// =============================================
// EVENTOS DE INVENTÁRIO — Plantel P.O.
// =============================================

app.get('/po/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const events = await prisma.herdEvent.findMany({
            where: { poAnimalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ events: events.map(serializeHerdEvent) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar eventos.' });
    }
});

app.post('/po/animals/:id/eventos', async (req, res) => {
    const { id } = req.params;
    const { type, date, peso, valor, origem, destino, observacoes, purchasePurpose } = req.body || {};

    if (!VALID_EVENT_TYPES.includes(type?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use NASCIMENTO, COMPRA, VENDA ou MORTE.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do evento inválida.' });
    }

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const eventType = type.toUpperCase();
        if (purchasePurpose && !['PRODUCTION', 'BREEDING'].includes(purchasePurpose)) {
            return res.status(400).json({ message: 'Finalidade da compra inválida.' });
        }
        const resolvedPurchasePurpose = eventType === 'COMPRA' ? (purchasePurpose || 'PRODUCTION') : null;
        const event = await prisma.$transaction(async (tx) => {
            const createdEvent = await tx.herdEvent.create({ data: {
                farmId: animal.farmId, poAnimalId: id, type: eventType, date: eventDate,
                peso: parseNumber(peso), valor: parseNumber(valor), origem: origem?.trim() || null,
                destino: destino?.trim() || null, observacoes: observacoes?.trim() || null,
                purchasePurpose: resolvedPurchasePurpose,
            } });
            const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
            const parsedValor = parseNumber(valor);
            if (financialMap && parsedValor && parsedValor > 0) {
                await createIntegratedTransaction(tx, {
                    farmId: animal.farmId, type: financialMap.type, categoria: financialMap.categoria,
                    accountCategoryId: eventType === 'COMPRA'
                        ? (resolvedPurchasePurpose === 'BREEDING' ? 'sys-compra-reprodutores' : 'sys-compra-animais-producao')
                        : financialMap.categoryId,
                    amount: parsedValor, competenceDate: eventDate,
                    description: `${eventType === 'COMPRA' ? 'Compra' : 'Venda'} P.O. — ${animal.brinco || animal.nome || id}`,
                    herdEventId: createdEvent.id, poAnimalId: animal.id,
                    allocations: (animal.lotId || animal.currentPaddockId) ? [{ poLotId: animal.lotId, paddockId: animal.currentPaddockId }] : [],
                });
            }
            return createdEvent;
        });

        return res.status(201).json({ event: serializeHerdEvent(event) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar evento.' });
    }
});

// =============================================
// MANEJO SANITÁRIO — Plantel P.O.
// =============================================

app.get('/po/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const records = await prisma.sanitaryRecord.findMany({
            where: { poAnimalId: id },
            orderBy: { date: 'desc' },
        });
        return res.json({ records: records.map(serializeSanitaryRecord) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao listar registros sanitários.' });
    }
});

app.post('/po/animals/:id/sanitario', async (req, res) => {
    const { id } = req.params;
    const { tipo, produto, date, dose, proximaAplicacao, observacoes, valorUnitario } = req.body || {};

    if (!VALID_SANITARY_TIPOS.includes(tipo?.toUpperCase?.())) {
        return res.status(400).json({ message: 'Tipo inválido. Use VACINA, VERMIFUGO ou TRATAMENTO.' });
    }
    if (!produto?.trim()) {
        return res.status(400).json({ message: 'Nome do produto é obrigatório.' });
    }
    const eventDate = parseDateValue(date);
    if (!eventDate) {
        return res.status(400).json({ message: 'Data do registro inválida.' });
    }

    try {
        const animal = await prisma.poAnimal.findFirst({
            where: { id, farm: buildFarmRelationFilter(req) },
        });
        if (!animal) {
            return res.status(404).json({ message: 'Animal P.O. não encontrado.' });
        }
        const tipoUpper = tipo.toUpperCase();
        const parsedValor = parseNumber(valorUnitario);
        const record = await prisma.$transaction(async (tx) => {
            const createdRecord = await tx.sanitaryRecord.create({ data: {
                farmId: animal.farmId, poAnimalId: id, tipo: tipoUpper, produto: produto.trim(),
                date: eventDate, dose: dose?.trim() || null, proximaAplicacao: parseDateValue(proximaAplicacao),
                observacoes: observacoes?.trim() || null, valorUnitario: parsedValor || null,
            } });
            const sanitaryMap = SANITARY_CATEGORY_MAP[tipoUpper];
            if (sanitaryMap && parsedValor && parsedValor > 0) {
                await upsertAutomaticResult(tx, {
                    farmId: animal.farmId, accountCategoryId: sanitaryMap.categoryId,
                    sourceKey: `SANITARY_RECORD:${createdRecord.id}:APPLICATION`, sourceType: 'SANITARY_APPLICATION',
                    sourceId: createdRecord.id, sanitaryRecordId: createdRecord.id, resultClass: 'PRODUCTION_COST',
                    amount: parsedValor, competenceDate: eventDate,
                    description: `${produto.trim()} P.O. — ${animal.brinco || animal.nome || id}`,
                    allocations: (animal.lotId || animal.currentPaddockId) ? [{ poLotId: animal.lotId, paddockId: animal.currentPaddockId }] : [],
                });
            }
            return createdRecord;
        });

        return res.status(201).json({ record: serializeSanitaryRecord(record) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar registro sanitário.' });
    }
});
}
