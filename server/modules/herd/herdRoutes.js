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
import { normalizeImportText, normalizeSexoImport, normalizeTipoRacaImport, parseImportDate } from './herdImportRules.js';
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

app.post('/animals/:id/eventos', requireAuth, async (req, res) => {
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

app.post('/animals/:id/sanitario', requireAuth, async (req, res) => {
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
  { key: 'sexo',               label: 'Sexo (MACHO ou FÊMEA)',   tier: 'required',     type: 'list',   options: ['MACHO', 'FEMEA'],            example: 'MACHO',                      description: 'MACHO ou FEMEA.' },
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
  { key: 'pasto_destino',      label: 'Pasto de destino',        tier: 'optional',     type: 'destination', example: 'Pasto 1',                  description: 'Escolha um pasto cadastrado no EIXO. Em branco, usa o pasto padrão escolhido na tela.' },
  { key: 'lote_destino',       label: 'Lote de destino',         tier: 'optional',     type: 'destination', example: 'Lote Recria',              description: 'Escolha um lote cadastrado no EIXO. Em branco, usa o lote padrão escolhido na tela.' },
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

const IMPORT_CELL_BORDER = {
  top: { style: 'thin', color: { argb: 'D1D5DB' } },
  bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
  left: { style: 'thin', color: { argb: 'D1D5DB' } },
  right: { style: 'thin', color: { argb: 'D1D5DB' } },
};

const IMPORT_COLUMN_WIDTHS = { date: 13, number: 12, list: 16, text: 18 };

app.get('/herd/import/template', requireAuth, async (req, res) => {
  try {
    const farmId = String(req.query?.farmId || req.saas?.farmId || '');
    if (!farmId) return res.status(400).json({ message: 'Selecione uma fazenda para gerar a planilha modelo.' });
    const farm = await prisma.farm.findFirst({
      where: buildFarmScopeFilter(req, { id: farmId }),
      select: { id: true, name: true },
    });
    if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada ou sem acesso.' });
    const [paddocks, lots] = await Promise.all([
      prisma.paddock.findMany({ where: { farmId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.lot.findMany({ where: { farmId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const farmName = farm.name;

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
    titulo.alignment = { vertical: 'middle', horizontal: 'center' };
    instrucoes.getRow(1).height = 28;

    // Subtítulo
    instrucoes.mergeCells('A2:E2');
    instrucoes.getCell('A2').value = 'Preencha os animais na aba "Dados". Abra no Excel ou Google Sheets e envie ao EIXO no formato .xlsx.';
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
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
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

    // Linha 1 — Título principal
    dados.mergeCells(`A1:${lastColLetter}1`);
    const dataTitle = dados.getCell('A1');
    dataTitle.value = 'EIXO — Planilha de Importação do Rebanho';
    dataTitle.font = { bold: true, color: { argb: 'FFFFFF' }, size: 16, name: 'Arial' };
    dataTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F8A3E' } };
    dataTitle.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    dataTitle.protection = { locked: true };
    dados.getRow(1).height = 30;

    // Linha 2 — Orientação rápida
    dados.mergeCells(`A2:${lastColLetter}2`);
    const banner = dados.getCell('A2');
    banner.value = '💡  Cole seus dados a partir da primeira linha vazia abaixo do cabeçalho. Veja exemplos e descrições na aba "Instruções".';
    banner.font = { bold: true, color: { argb: '1F2937' }, size: 11, name: 'Arial' };
    banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } };
    banner.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    banner.protection = { locked: true };
    banner.border = {
      bottom: { style: 'medium', color: { argb: '2F8A3E' } },
    };
    dados.getRow(2).height = 32;

    // Linha 3 — Cabeçalhos
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      const cell = dados.getCell(3, idx + 1);
      const label = (col.tier === 'required' || col.tier === 'conditional') ? `${col.label} *` : col.label;
      cell.value = label;
      cell.font = {
        bold: true,
        color: TIER_FONT_COLORS[col.tier],
        size: 11,
        name: 'Arial',
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: TIER_COLORS[col.tier] };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
        left: { style: 'thin', color: { argb: 'E5E7EB' } },
        right: { style: 'thin', color: { argb: 'E5E7EB' } },
      };
      cell.note = col.description;
      cell.protection = { locked: true };

      // Largura da coluna baseada no tipo
      dados.getColumn(idx + 1).width = IMPORT_COLUMN_WIDTHS[col.type] || 18;
    });
    dados.getRow(3).height = 44;

    // Mantém título, orientação e cabeçalho visíveis
    dados.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

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

    // Estilo das 1000 linhas disponíveis para copiar, colar ou digitar
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      const colChar = String.fromCharCode(64 + idx + 1);
      const horizontal = (col.type === 'date' || col.type === 'number') ? 'center' : 'left';
      for (let row = 4; row <= 1003; row++) {
        const cell = dados.getCell(`${colChar}${row}`);
        cell.font = { name: 'Arial', size: 10, color: { argb: '1F2937' }, italic: false };
        cell.alignment = { vertical: 'middle', horizontal, wrapText: true };
        cell.border = IMPORT_CELL_BORDER;
        cell.protection = { locked: false };
      }
    });

    // Aplica validação de dados (dropdowns) nas colunas tipo 'list' da aba Dados
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      if (col.type === 'list' && listColumnsMap[col.key]) {
        const colChar = String.fromCharCode(64 + idx + 1);
        for (let row = 4; row <= 1003; row++) { // permite até 1000 linhas de dados
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
        for (let row = 4; row <= 1003; row++) {
          dados.getCell(`${colChar}${row}`).numFmt = 'dd/mm/yyyy';
        }
      }
      if (col.type === 'number') {
        const colChar = String.fromCharCode(64 + idx + 1);
        for (let row = 4; row <= 1003; row++) {
          dados.getCell(`${colChar}${row}`).numFmt = '0.##';
        }
      }
    });

    const destinationRanges = addFarmDestinationCatalog(workbook, paddocks, lots);
    applyFarmDestinationValidations(dados, TEMPLATE_COLUMNS, destinationRanges);

    await dados.protect('', {
      selectLockedCells: false,
      selectUnlockedCells: true,
      spinCount: 1000,
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
      cb(new Error('Formato não suportado. Use a planilha modelo oficial .xlsx.'));
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
      message: error?.message || 'Erro ao receber arquivo. Use a planilha modelo oficial .xlsx.',
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
  map[normalizeHeader('Sexo')] = 'sexo';
  map[normalizeHeader('Sexo *')] = 'sexo';
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

function addFarmDestinationCatalog(workbook, paddocks, lots) {
  const catalog = workbook.addWorksheet('Cadastros EIXO', { state: 'hidden' });
  catalog.addRow(['Pasto', 'Pasto ID', 'Lote', 'Lote ID']);
  catalog.getRow(1).font = { bold: true };
  const totalRows = Math.max(paddocks.length, lots.length);
  for (let index = 0; index < totalRows; index += 1) {
    catalog.addRow([
      paddocks[index]?.name || '',
      paddocks[index]?.id || '',
      lots[index]?.name || '',
      lots[index]?.id || '',
    ]);
  }
  return {
    pasto_destino: paddocks.length ? `'Cadastros EIXO'!$A$2:$A$${paddocks.length + 1}` : null,
    lote_destino: lots.length ? `'Cadastros EIXO'!$C$2:$C$${lots.length + 1}` : null,
  };
}

function applyFarmDestinationValidations(sheet, columns, ranges, startRow = 4, endRow = 1003) {
  for (const key of ['pasto_destino', 'lote_destino']) {
    const range = ranges[key];
    const columnIndex = columns.findIndex((column) => column.key === key) + 1;
    if (!range || columnIndex <= 0) continue;
    for (let row = startRow; row <= endRow; row += 1) {
      sheet.getCell(row, columnIndex).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`=${range}`],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Cadastro inválido',
        error: 'Escolha um cadastro disponível na lista do EIXO.',
      };
    }
  }
}

function buildDestinationLookup(items) {
  const lookup = new Map();
  items.forEach((item) => {
    const key = normalizeHeader(item.name);
    if (!key) return;
    lookup.set(key, [...(lookup.get(key) || []), item]);
  });
  return lookup;
}

function resolveImportDestination(value, fallback, lookup, label, reasons) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return fallback || null;
  const matches = lookup.get(normalizeHeader(rawValue)) || [];
  if (matches.length === 0) {
    reasons.push(`${label} "${rawValue}" não encontrado nesta fazenda`);
    return null;
  }
  if (matches.length > 1) {
    reasons.push(`${label} "${rawValue}" está duplicado nos cadastros da fazenda`);
    return null;
  }
  return matches[0];
}

function buildImportCorrectionRows(rows, errors) {
  const errorsByLine = new Map();
  errors.forEach((error) => {
    const line = Number(error.line);
    const current = errorsByLine.get(line) || { identificacao: null, motivos: [] };
    current.identificacao = current.identificacao || error.identificacao || null;
    current.motivos.push(...(error.motivos || []));
    errorsByLine.set(line, current);
  });

  return rows.map((row, index) => {
    const line = Number(row.__line || index + 1);
    const error = errorsByLine.get(line);
    return {
      line,
      identificacao: error?.identificacao || row.identificacao || null,
      motivos: [...new Set(error?.motivos || [])],
      dados: { ...row },
    };
  });
}

const getOrganizationFarmFilter = (farm) => (
  farm.organizationId ? { organizationId: farm.organizationId } : { userId: farm.userId }
);

async function loadOrganizationAnimalReferences(farm) {
  const farmFilter = getOrganizationFarmFilter(farm);
  const [commercialAnimals, poAnimals] = await Promise.all([
    prisma.animal.findMany({
      where: { farm: farmFilter },
      select: { identityKey: true, registro: true, farm: { select: { name: true } } },
    }),
    prisma.poAnimal.findMany({
      where: { farm: farmFilter },
      select: {
        identityKey: true,
        brinco: true,
        registro: true,
        registrationEntity: true,
        registrationNumber: true,
        farm: { select: { name: true } },
      },
    }),
  ]);
  const identities = new Map();
  const registrations = new Map();
  const legacyRegistrations = new Map();
  const addIdentity = (value, source, farmName) => {
    const key = normalizeHeader(value);
    if (key && !identities.has(key)) identities.set(key, { source, farmName });
  };
  const addRegistration = (entity, number, source, farmName) => {
    const numberKey = normalizeHeader(number);
    if (!numberKey) return;
    const entityKey = normalizeHeader(entity);
    const target = entityKey ? registrations : legacyRegistrations;
    const key = entityKey ? `${entityKey}|${numberKey}` : numberKey;
    if (!target.has(key)) target.set(key, { source, farmName });
  };
  commercialAnimals.forEach((animal) => {
    addIdentity(animal.identityKey, 'rebanho Comercial', animal.farm.name);
    addRegistration(null, animal.registro, 'rebanho Comercial', animal.farm.name);
  });
  poAnimals.forEach((animal) => {
    addIdentity(animal.identityKey || animal.brinco, 'plantel P.O.', animal.farm.name);
    addRegistration(animal.registrationEntity, animal.registrationNumber || animal.registro, 'plantel P.O.', animal.farm.name);
  });
  return { identities, registrations, legacyRegistrations };
}

function findRegistrationConflict(references, entity, number) {
  const numberKey = normalizeHeader(number);
  if (!numberKey) return null;
  const legacyConflict = references.legacyRegistrations.get(numberKey);
  if (legacyConflict) return legacyConflict;
  const entityKey = normalizeHeader(entity);
  if (entityKey) return references.registrations.get(`${entityKey}|${numberKey}`) || null;
  for (const [key, conflict] of references.registrations) {
    if (key.endsWith(`|${numberKey}`)) return conflict;
  }
  return null;
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

// Planilhas coladas em massa raramente têm a coluna "Tipo de Raça" (é um conceito
// só do EIXO). Se ela vier em branco (ou com valor não reconhecido), deduz a partir
// da Raça: bateu com uma raça pura da lista, é Pura; senão, Mestiça.
function resolveImportTipoRaca(row) {
  const explicit = normalizeTipoRacaImport(row.tipo_raca);
  if (explicit) return explicit;
  const racaInput = String(row.raca || '').trim();
  const composicaoInput = String(row.composicao_mestica || '').trim();
  if (!racaInput && !composicaoInput) return null;
  if (racaInput) {
    const isRacaPura = RACAS_PURAS.some((opt) => normalizeHeader(opt) === normalizeHeader(racaInput));
    return isRacaPura ? 'Pura' : 'Mestiça';
  }
  return 'Mestiça';
}

function validateUploadRow(row, line) {
  const errs = [];
  if (!row.identificacao || !String(row.identificacao).trim()) {
    errs.push('Identificação é obrigatória');
  }
  const sexo = normalizeSexoImport(row.sexo);
  if (!sexo) errs.push('Sexo é obrigatório (MACHO ou FEMEA)');

  const tipoRaca = resolveImportTipoRaca(row);
  const racaPreenchida = String(row.raca || '').trim();
  const composicaoPreenchida = String(row.composicao_mestica || '').trim();

  if (!tipoRaca) {
    errs.push('Preencha Raça, Composição ou Tipo de Raça (Pura ou Mestiça)');
  } else if (tipoRaca === 'Pura' && !racaPreenchida) {
    errs.push('Raça (se Pura) precisa ser preenchida');
  } else if (
    tipoRaca === 'Mestiça'
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
    const { farmId, paddockId, lotId } = req.body || {};
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

    const [paddocks, lots] = await Promise.all([
      prisma.paddock.findMany({ where: { farmId: String(farmId) }, select: { id: true, name: true } }),
      prisma.lot.findMany({ where: { farmId: String(farmId) }, select: { id: true, name: true } }),
    ]);
    const defaultPaddock = paddockId ? paddocks.find((item) => item.id === String(paddockId)) : null;
    const defaultLot = lotId ? lots.find((item) => item.id === String(lotId)) : null;
    if (paddockId && !defaultPaddock) return res.status(400).json({ message: 'Pasto padrão inválido para esta fazenda.' });
    if (lotId && !defaultLot) return res.status(400).json({ message: 'Lote padrão inválido para esta fazenda.' });
    const paddockLookup = buildDestinationLookup(paddocks);
    const lotLookup = buildDestinationLookup(lots);

    const erros = [];
    const prepared = [];
    const identityLines = new Map();
    const registroLines = new Map();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = row.__line || i + 1;
      const validationError = validateUploadRow(row, line);
      const rowReasons = [...(validationError?.motivos || [])];
      const brinco = String(row.identificacao || '').trim();
      const identityKey = brinco ? normalizeAnimalIdentityKey(brinco) : null;
      const identityLookupKey = identityKey ? normalizeHeader(identityKey) : null;
      if (identityLookupKey && identityLines.has(identityLookupKey)) {
        rowReasons.push(`Identificação duplicada na planilha (também na linha ${identityLines.get(identityLookupKey)})`);
      } else if (identityLookupKey) {
        identityLines.set(identityLookupKey, line);
      }
      const registro = String(row.registro || '').trim() || null;
      const registroLookupKey = registro ? normalizeHeader(registro) : null;
      if (registroLookupKey && registroLines.has(registroLookupKey)) {
        rowReasons.push(`Registro duplicado na planilha (também na linha ${registroLines.get(registroLookupKey)})`);
      } else if (registroLookupKey) {
        registroLines.set(registroLookupKey, line);
      }
      const sexo = normalizeSexoImport(row.sexo);
      const tipoRacaNormalizado = resolveImportTipoRaca(row);
      const isPura = tipoRacaNormalizado === 'Pura';

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
      if (row.data_nascimento && !dataNascimento) rowReasons.push('Data de nascimento inválida');
      if (row.data_pesagem && !dataPesagem) rowReasons.push('Data da pesagem inválida');
      if (row.ultimo_peso_kg && (!pesoAtual || pesoAtual <= 0)) rowReasons.push('Último peso deve ser maior que zero');
      if (row.previsao_parto && !previsaoParto) rowReasons.push('Previsão de parto inválida');
      // Peso preenchido sem data: usa a data da importação para não perder o registro de pesagem.
      // Data preenchida sem peso: não há o que registrar, segue sem pesagem (sem erro).
      const dataPesagemEfetiva = dataPesagem || (pesoAtual ? new Date() : null);
      const categoriaInput = String(row.categoria || '').trim();
      // Campo opcional: se não bater com a lista oficial, ignora o valor (fica em branco)
      // em vez de bloquear a linha inteira.
      const categoriaNormalizada = categoriaInput
        ? CATEGORIAS.find((opt) => normalizeHeader(opt) === normalizeHeader(categoriaInput)) || null
        : null;
      const destinationReasons = [];
      const paddock = resolveImportDestination(row.pasto_destino, defaultPaddock, paddockLookup, 'Pasto de destino', destinationReasons);
      const lot = resolveImportDestination(row.lote_destino, defaultLot, lotLookup, 'Lote de destino', destinationReasons);
      rowReasons.push(...destinationReasons);
      if (rowReasons.length) {
        erros.push({ line, identificacao: brinco || null, motivos: [...new Set(rowReasons)], dados: { ...row } });
        continue;
      }
      prepared.push({ line, brinco, identityKey, dataPesagem: dataPesagemEfetiva, pesoAtual, paddock, raw: { ...row }, data: {
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
          registro,
          paiNome: String(row.pai_nome || '').trim() || null,
          maeNome: String(row.mae_nome || '').trim() || null,
          observacoes: String(row.observacoes || '').trim() || null,
          categoria: categoriaNormalizada,
          currentPaddockId: paddock?.id || null,
          lotId: lot?.id || null,
      } });
    }

    // Linhas com identificação/registro que já existem na organização também viram
    // erro (não bloqueiam mais as demais linhas — só ficam de fora da criação).
    const conflictedLines = new Set();
    if (prepared.length) {
      const organizationReferences = await loadOrganizationAnimalReferences(farm);
      prepared.forEach((item) => {
        const identityConflict = organizationReferences.identities.get(normalizeHeader(item.identityKey));
        const registrationConflict = item.data.registro
          ? findRegistrationConflict(organizationReferences, null, item.data.registro)
          : null;
        const conflict = identityConflict || registrationConflict;
        if (conflict) {
          conflictedLines.add(item.line);
          erros.push({
            line: item.line,
            identificacao: item.brinco,
            motivos: [`Animal já existe na organização (${conflict.source}, fazenda ${conflict.farmName})`],
            dados: { ...item.raw },
          });
        }
      });
    }

    // Importação parcial: cada linha válida é criada mesmo que outras linhas da
    // mesma planilha tenham erro. Cada animal entra em sua própria transação —
    // assim um problema numa linha não desfaz o que já foi criado nas anteriores.
    const toCreate = prepared.filter((item) => !conflictedLines.has(item.line));
    const criados = [];
    for (const item of toCreate) {
      try {
        const created = await prisma.$transaction(async (tx) => {
          const animal = await tx.animal.create({ data: item.data });
          if (item.paddock) {
            await tx.paddockMove.create({
              data: { farmId: String(farmId), paddockId: item.paddock.id, animalId: animal.id, startAt: item.dataPesagem || new Date() },
            });
          }
          if (item.dataPesagem && item.pesoAtual) {
            await tx.weighing.create({ data: { animalId: animal.id, data: item.dataPesagem, peso: item.pesoAtual, gmd: 0, source: 'MANUAL' } });
          }
          return { line: item.line, id: animal.id, identificacao: item.brinco };
        });
        criados.push(created);
      } catch (error) {
        console.error(`Importação linha ${item.line}:`, error.message);
        erros.push({
          line: item.line,
          identificacao: item.brinco,
          motivos: ['Erro inesperado ao criar este animal. Tente novamente ou contate o suporte.'],
          dados: { ...item.raw },
        });
      }
    }

    const linhasCorrecao = buildImportCorrectionRows(rows, erros);
    const linhasComErro = linhasCorrecao.filter((item) => item.motivos.length > 0);
    return res.json({
      total: rows.length,
      criados: criados.length,
      ignorados: 0,
      erros: linhasComErro.length,
      detalhes: { criados, ignorados: [], erros: linhasComErro, linhasCorrecao },
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
    const { erros, linhasCorrecao } = req.body || {};
    const linhas = Array.isArray(linhasCorrecao) && linhasCorrecao.length > 0 ? linhasCorrecao : erros;
    if (!Array.isArray(linhas) || linhas.length === 0) {
      return res.status(400).json({ message: 'Nenhuma linha para correção informada.' });
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
    banner.value = '⚠  Esta planilha contém todas as linhas originais. Corrija somente as linhas com motivo em vermelho e use "Enviar planilha corrigida" no EIXO.';
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
    linhas.forEach((err, idx) => {
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
      const hasError = (err?.motivos || []).length > 0;
      motivoCell.font = { size: 10, color: { argb: hasError ? 'A32D2D' : '6B7280' }, bold: hasError, name: 'Arial' };
      if (hasError) motivoCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
      motivoCell.alignment = { vertical: 'middle', wrapText: true };
    });

    // Freeze pane na linha 2
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="[EIXO] Planilha completa para correcao.xlsx"');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Erro ao gerar planilha de erros:', error);
    return res.status(500).json({ message: 'Erro ao gerar planilha de erros.' });
  }
});

const REGISTRATION_ENTITIES = [
  'ABCZ', 'ANC / Herd-Book Collares', 'ABHB', 'Brangus', 'Senepol',
  'Simental e Simbrasil', 'Angus e Ultrablack', 'Santa Gertrudis',
  'Caracu', 'Limousin', 'Bonsmara', 'Wagyu', 'Outra',
];

const PO_TEMPLATE_COLUMNS = [
  { key: 'identificacao', label: 'Identificação / Brinco', required: true, type: 'text', description: 'Identificação usada no manejo da fazenda.' },
  { key: 'nome', label: 'Nome do animal', required: true, type: 'text', description: 'Nome oficial ou nome usado na fazenda.' },
  { key: 'raca', label: 'Raça', required: true, type: 'text', description: 'Raça do animal.' },
  { key: 'sexo', label: 'Sexo', required: true, type: 'list', options: ['MACHO', 'FEMEA'], description: 'MACHO ou FEMEA.' },
  { key: 'entidade_registradora', label: 'Entidade registradora', required: true, type: 'list', options: REGISTRATION_ENTITIES, description: 'Associação responsável pelo registro ou controle genealógico.' },
  { key: 'numero_registro', label: 'Número do registro / controle', required: true, type: 'text', description: 'Número exatamente como aparece no documento da entidade.' },
  { key: 'tipo_registro', label: 'Tipo do registro', required: false, type: 'text', description: 'Ex.: nascimento, definitivo, genealógico ou controle.' },
  { key: 'categoria_registro', label: 'Categoria do registro', required: false, type: 'text', description: 'Ex.: PO, LA, PC, CCG ou categoria usada pela entidade.' },
  { key: 'data_nascimento', label: 'Data de nascimento', required: false, type: 'date', description: 'Use DD/MM/AAAA.' },
  { key: 'ultimo_peso_kg', label: 'Último peso (kg)', required: false, type: 'number', description: 'Peso mais recente em quilogramas.' },
  { key: 'data_pesagem', label: 'Data da pesagem', required: false, type: 'date', description: 'Data do peso informado.' },
  { key: 'categoria', label: 'Categoria no rebanho', required: false, type: 'text', description: 'Ex.: bezerra, matriz, touro.' },
  { key: 'pasto_destino', label: 'Pasto de destino', required: false, type: 'destination', description: 'Escolha um pasto cadastrado no EIXO. Em branco, usa o pasto padrão escolhido na tela.' },
  { key: 'lote_destino', label: 'Lote de destino', required: false, type: 'destination', description: 'Escolha um lote P.O. cadastrado no EIXO. Em branco, usa o lote padrão escolhido na tela.' },
  { key: 'status_reprodutivo', label: 'Status reprodutivo', required: false, type: 'list', options: ['RECRIA', 'CICLANDO', 'VAZIA', 'PRENHE', 'PARIDA'], description: 'Somente para fêmeas.' },
  { key: 'previsao_parto', label: 'Previsão de parto', required: false, type: 'date', description: 'Obrigatória quando houver previsão conhecida para animal PRENHE.' },
  { key: 'em_te', label: 'Em TE?', required: false, type: 'list', options: ['NÃO', 'SIM'], description: 'Indica participação atual em transferência de embrião.' },
  { key: 'marcado_descarte', label: 'Marcado para descarte?', required: false, type: 'list', options: ['NÃO', 'SIM'], description: 'Indica decisão de descarte já tomada.' },
  { key: 'motivo_descarte', label: 'Motivo do descarte', required: false, type: 'text', description: 'Explique o motivo quando marcado para descarte.' },
  { key: 'mae', label: 'Mãe (identificação ou registro)', required: false, type: 'text', description: 'A mãe precisa existir na mesma fazenda ou estar nesta planilha.' },
  { key: 'pai', label: 'Pai (identificação ou registro)', required: false, type: 'text', description: 'O pai precisa existir na mesma fazenda ou estar nesta planilha.' },
  { key: 'observacoes', label: 'Observações', required: false, type: 'text', description: 'Informações adicionais.' },
];

const parsePoSpreadsheet = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames.find((name) => normalizeHeader(name) === 'dados') || workbook.SheetNames[0]];
  if (!sheet) throw new Error('Planilha vazia ou sem abas.');
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  const labels = new Map(PO_TEMPLATE_COLUMNS.flatMap((column) => [[normalizeHeader(column.label), column.key], [normalizeHeader(column.key), column.key]]));
  labels.set(normalizeHeader('Registro'), 'numero_registro');
  labels.set(normalizeHeader('Brinco'), 'identificacao');
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

const parseOptionalBooleanImport = (value) => {
  const normalized = normalizeHeader(value);
  if (!normalized) return null;
  if (['sim', 's', 'yes'].includes(normalized)) return true;
  if (['nao', 'n', 'no'].includes(normalized)) return false;
  return undefined;
};

app.get('/po/herd/import/template', requireAuth, async (req, res) => {
  try {
    const farmId = String(req.query?.farmId || req.saas?.farmId || '');
    if (!farmId) return res.status(400).json({ message: 'Selecione uma fazenda para gerar a planilha modelo.' });
    const farm = await prisma.farm.findFirst({
      where: buildFarmScopeFilter(req, { id: farmId }),
      select: { id: true, name: true },
    });
    if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada ou sem acesso.' });
    const [paddocks, lots] = await Promise.all([
      prisma.paddock.findMany({ where: { farmId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.poLot.findMany({ where: { farmId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EIXO';
    const sheet = workbook.addWorksheet('Dados');
    const lastPoColumnLetter = String.fromCharCode(64 + PO_TEMPLATE_COLUMNS.length);
    sheet.mergeCells(`A1:${lastPoColumnLetter}1`);
    const poTitle = sheet.getCell('A1');
    poTitle.value = 'EIXO — Planilha de Importação do Rebanho';
    poTitle.font = { bold: true, color: { argb: 'FFFFFF' }, size: 16, name: 'Arial' };
    poTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F8A3E' } };
    poTitle.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    poTitle.protection = { locked: true };
    sheet.getRow(1).height = 30;

    sheet.mergeCells(`A2:${lastPoColumnLetter}2`);
    const poBanner = sheet.getCell('A2');
    poBanner.value = '💡  Cole seus dados abaixo do cabeçalho. Escolha pasto e lote por linha ou deixe em branco para usar o padrão da tela.';
    poBanner.font = { bold: true, color: { argb: '1F2937' }, size: 11, name: 'Arial' };
    poBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ECFDF5' } };
    poBanner.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    poBanner.protection = { locked: true };
    poBanner.border = { bottom: { style: 'medium', color: { argb: '2F8A3E' } } };
    sheet.getRow(2).height = 32;

    sheet.getRow(3).values = PO_TEMPLATE_COLUMNS.map((column) => `${column.label}${column.required ? ' *' : ''}`);
    sheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F8A3E' } };
    sheet.getRow(3).height = 44;
    sheet.views = [{ state: 'frozen', ySplit: 3 }];
    PO_TEMPLATE_COLUMNS.forEach((column, columnIndex) => {
      const headerCell = sheet.getCell(3, columnIndex + 1);
      headerCell.note = column.description;
      headerCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      headerCell.border = IMPORT_CELL_BORDER;
      headerCell.protection = { locked: true };
      sheet.getColumn(columnIndex + 1).width = IMPORT_COLUMN_WIDTHS[column.type] || 18;
      if (column.type === 'date') sheet.getColumn(columnIndex + 1).numFmt = 'dd/mm/yyyy';
      if (column.type === 'number') sheet.getColumn(columnIndex + 1).numFmt = '0.##';
      const horizontal = (column.type === 'date' || column.type === 'number') ? 'center' : 'left';
      for (let row = 4; row <= 1003; row += 1) {
        const cell = sheet.getCell(row, columnIndex + 1);
        cell.alignment = { vertical: 'middle', horizontal, wrapText: true };
        cell.border = IMPORT_CELL_BORDER;
        cell.protection = { locked: false };
      }
      if (column.type === 'list') {
        for (let row = 4; row <= 1003; row += 1) {
          sheet.getCell(row, columnIndex + 1).dataValidation = {
            type: 'list',
            allowBlank: !column.required,
            formulae: [`"${column.options.join(',')}"`],
            showErrorMessage: true,
            errorTitle: 'Valor inválido',
            error: `Use uma opção válida para ${column.label}.`,
          };
        }
      }
    });
    const instructions = workbook.addWorksheet('Instruções');
    instructions.addRows([
      ['EIXO — Importação de animais P.O.'],
      ['Cole os dados por coluna na aba Dados. Cada coluna representa uma informação e cada linha identifica um animal.'],
      ['A planilha funciona no Excel e no Google Sheets. No Google Sheets, faça o download como Microsoft Excel (.xlsx) antes de enviar ao EIXO.'],
      ['Identificação, nome, raça, sexo, entidade registradora e número do registro/controle são obrigatórios.'],
      ['Pasto e lote podem ser escolhidos por linha. Em branco, será usado o destino padrão selecionado no EIXO.'],
      ['RGN, RGD e outras siglas não são universais. Informe o tipo e a categoria exatamente como a entidade utiliza.'],
      ['Mãe e pai podem ser informados por identificação ou registro e devem pertencer à mesma fazenda.'],
      ['A importação é tudo ou nada: qualquer erro impede a criação de todas as linhas.'],
      [],
      ['Coluna', 'Obrigatória?', 'Descrição'],
      ...PO_TEMPLATE_COLUMNS.map((column) => [column.label, column.required ? 'Sim' : 'Não', column.description]),
    ]);
    instructions.mergeCells('A1:C1');
    instructions.getRow(1).font = { bold: true, size: 15 };
    instructions.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    instructions.getRow(1).height = 28;
    instructions.getRow(10).font = { bold: true, color: { argb: 'FFFFFF' } };
    instructions.getRow(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F8A3E' } };
    for (let row = 10; row <= 10 + PO_TEMPLATE_COLUMNS.length; row += 1) {
      for (let column = 1; column <= 3; column += 1) {
        const cell = instructions.getCell(row, column);
        cell.alignment = { vertical: 'middle', horizontal: row === 10 ? 'center' : 'left', wrapText: true };
        cell.border = IMPORT_CELL_BORDER;
      }
    }
    instructions.getColumn(1).width = 34;
    instructions.getColumn(2).width = 16;
    instructions.getColumn(3).width = 80;
    const destinationRanges = addFarmDestinationCatalog(workbook, paddocks, lots);
    applyFarmDestinationValidations(sheet, PO_TEMPLATE_COLUMNS, destinationRanges);
    await sheet.protect('', {
      selectLockedCells: false,
      selectUnlockedCells: true,
      spinCount: 1000,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const filename = `[EIXO] ${farm.name} - Cadastro de Rebanho.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Erro ao gerar modelo do Plantel P.O.' });
  }
});

app.post('/po/herd/import/upload', requireAuth, uploadHerdImportFile, async (req, res) => {
  try {
    const farmId = String(req.body?.farmId || '');
    const paddockId = String(req.body?.paddockId || '');
    const lotId = String(req.body?.lotId || '');
    if (!farmId || !req.file) return res.status(400).json({ message: 'Informe fazenda e arquivo.' });
    const farm = await prisma.farm.findFirst({ where: buildFarmScopeFilter(req, { id: farmId }) });
    if (!farm) return res.status(404).json({ message: 'Fazenda não encontrada ou sem acesso.' });
    let rows;
    try { rows = parsePoSpreadsheet(req.file.buffer); } catch (error) { return res.status(400).json({ message: error.message }); }
    if (!rows.length) return res.status(400).json({ message: 'Planilha P.O. sem linhas para importar.' });
    if (rows.length > 1000) return res.status(400).json({ message: 'Limite de 1000 linhas por importação.' });

    const [paddocks, lots, existingAnimals, organizationReferences] = await Promise.all([
      prisma.paddock.findMany({ where: { farmId }, select: { id: true, name: true } }),
      prisma.poLot.findMany({ where: { farmId }, select: { id: true, name: true } }),
      prisma.poAnimal.findMany({ where: { farmId }, select: { id: true, brinco: true, registro: true, registrationNumber: true, sexo: true } }),
      loadOrganizationAnimalReferences(farm),
    ]);
    const defaultPaddock = paddockId ? paddocks.find((item) => item.id === paddockId) : null;
    const defaultLot = lotId ? lots.find((item) => item.id === lotId) : null;
    if (paddockId && !defaultPaddock) return res.status(400).json({ message: 'Pasto padrão inválido para esta fazenda.' });
    if (lotId && !defaultLot) return res.status(400).json({ message: 'Lote P.O. padrão inválido para esta fazenda.' });
    const paddockLookup = buildDestinationLookup(paddocks);
    const lotLookup = buildDestinationLookup(lots);
    const existingByRef = new Map();
    existingAnimals.forEach((animal) => {
      if (animal.brinco) existingByRef.set(normalizeHeader(animal.brinco), animal);
      if (animal.registrationNumber || animal.registro) existingByRef.set(normalizeHeader(animal.registrationNumber || animal.registro), animal);
    });
    const errors = [];
    const prepared = [];
    const usedIds = new Set();
    const usedRegistrations = new Set();
    for (const row of rows) {
      const line = row.__line;
      const nome = String(row.nome || '').trim();
      const brinco = String(row.identificacao || '').trim();
      const registrationEntity = String(row.entidade_registradora || '').trim();
      const registrationNumber = String(row.numero_registro || '').trim();
      const raca = String(row.raca || '').trim();
      const sexo = normalizeSexoImport(String(row.sexo || ''));
      const birthDate = row.data_nascimento ? parseImportDate(row.data_nascimento) : null;
      const weighingDate = row.data_pesagem ? parseImportDate(row.data_pesagem) : null;
      const weight = row.ultimo_peso_kg ? parseNumber(row.ultimo_peso_kg) : null;
      const birthForecast = row.previsao_parto ? parseImportDate(row.previsao_parto) : null;
      const reproductiveStatus = normalizeHeader(row.status_reprodutivo).replace(/ /g, '_').toUpperCase() || null;
      const embryoTransferValue = parseOptionalBooleanImport(row.em_te);
      const markedForDiscardValue = parseOptionalBooleanImport(row.marcado_descarte);
      const embryoTransfer = embryoTransferValue === true;
      const markedForDiscard = markedForDiscardValue === true;
      const identityKey = normalizeAnimalIdentityKey(brinco);
      const registrationKey = normalizeAnimalIdentityKey(registrationNumber);
      const identityReferenceKey = normalizeHeader(identityKey);
      const registrationNumberReferenceKey = normalizeHeader(registrationKey);
      const registrationReferenceKey = `${normalizeHeader(registrationEntity)}|${registrationNumberReferenceKey}`;
      const reasons = [];
      if (!brinco) reasons.push('Identificação / Brinco é obrigatório');
      if (!nome) reasons.push('Nome do animal é obrigatório');
      if (!raca) reasons.push('Raça é obrigatória');
      if (!sexo) reasons.push('Sexo é obrigatório e deve ser MACHO ou FEMEA');
      if (!registrationEntity) reasons.push('Entidade registradora é obrigatória');
      if (!registrationNumber) reasons.push('Número do registro / controle é obrigatório');
      if (usedIds.has(identityReferenceKey)) reasons.push('Identificação duplicada na planilha');
      if (registrationNumberReferenceKey && usedRegistrations.has(registrationReferenceKey)) reasons.push('Número do registro/controle duplicado na planilha para a mesma entidade');
      const identityConflict = organizationReferences.identities.get(identityReferenceKey);
      const registrationConflict = findRegistrationConflict(organizationReferences, registrationEntity, registrationNumberReferenceKey);
      const conflict = identityConflict || registrationConflict;
      if (conflict) reasons.push(`Animal já existe na organização (${conflict.source}, fazenda ${conflict.farmName})`);
      if (row.data_nascimento && !birthDate) reasons.push('Data de nascimento inválida');
      if (row.data_pesagem && !weighingDate) reasons.push('Data de pesagem inválida');
      if (row.ultimo_peso_kg && (!weight || weight <= 0)) reasons.push('Peso inválido');
      if (row.previsao_parto && !birthForecast) reasons.push('Previsão de parto inválida');
      if (birthForecast && reproductiveStatus !== 'PRENHE') reasons.push('Previsão de parto exige status reprodutivo PRENHE');
      if (sexo === 'MACHO' && (reproductiveStatus || birthForecast || embryoTransfer)) reasons.push('Status de fêmea, previsão de parto e TE não podem ser aplicados a macho');
      if (row.status_reprodutivo && !['RECRIA', 'CICLANDO', 'VAZIA', 'PRENHE', 'PARIDA'].includes(reproductiveStatus)) reasons.push('Status reprodutivo inválido');
      if (embryoTransferValue === undefined) reasons.push('Em TE? deve ser SIM ou NÃO');
      if (markedForDiscardValue === undefined) reasons.push('Marcado para descarte? deve ser SIM ou NÃO');
      const paddock = resolveImportDestination(row.pasto_destino, defaultPaddock, paddockLookup, 'Pasto de destino', reasons);
      const lot = resolveImportDestination(row.lote_destino, defaultLot, lotLookup, 'Lote de destino', reasons);
      if (!paddock && !String(row.pasto_destino || '').trim() && !defaultPaddock) {
        reasons.push('Informe o pasto de destino na planilha ou escolha um pasto padrão no EIXO');
      }
      if (reasons.length) errors.push({ line, identificacao: brinco, motivos: reasons, dados: { ...row } });
      else {
        usedIds.add(identityReferenceKey);
        usedRegistrations.add(registrationReferenceKey);
        prepared.push({ line, nome, brinco, identityKey, registrationEntity, registrationNumber, registrationType: String(row.tipo_registro || '').trim(), registrationCategory: String(row.categoria_registro || '').trim(), raca, sexo, birthDate, weighingDate, weight, reproductiveStatus, birthForecast, embryoTransfer, markedForDiscard, discardReason: String(row.motivo_descarte || '').trim(), maeRef: String(row.mae || '').trim(), paiRef: String(row.pai || '').trim(), categoria: String(row.categoria || '').trim(), observacoes: String(row.observacoes || '').trim(), paddock, lot, raw: { ...row } });
      }
    }

    const preparedByRef = new Map();
    prepared.forEach((item) => {
      preparedByRef.set(normalizeHeader(item.brinco), item);
      preparedByRef.set(normalizeHeader(item.registrationNumber), item);
    });
    prepared.forEach((item) => {
      for (const [kind, ref, expectedSex] of [['Mãe', item.maeRef, 'FEMEA'], ['Pai', item.paiRef, 'MACHO']]) {
        if (!ref) continue;
        const parent = existingByRef.get(normalizeHeader(ref)) || preparedByRef.get(normalizeHeader(ref));
        if (!parent) errors.push({ line: item.line, identificacao: item.brinco, motivos: [`${kind} não encontrado(a)`], dados: item.raw });
        else if (parent === item || parent.sexo !== expectedSex) errors.push({ line: item.line, identificacao: item.brinco, motivos: [`${kind} inválido(a)`], dados: item.raw });
      }
    });
    if (errors.length) {
      const linhasCorrecao = buildImportCorrectionRows(rows, errors);
      const linhasComErro = linhasCorrecao.filter((item) => item.motivos.length > 0);
      return res.status(422).json({ total: rows.length, criados: 0, ignorados: 0, erros: linhasComErro.length, detalhes: { criados: [], ignorados: [], erros: linhasComErro, linhasCorrecao } });
    }

    const created = await prisma.$transaction(async (tx) => {
      const createdByRef = new Map();
      const result = [];
      for (const item of prepared) {
        const animal = await tx.poAnimal.create({ data: { farmId, nome: item.nome, brinco: item.brinco, identityKey: item.identityKey, registro: item.registrationNumber, registrationEntity: item.registrationEntity, registrationNumber: item.registrationNumber, registrationType: item.registrationType || null, registrationCategory: item.registrationCategory || null, raca: item.raca, sexo: item.sexo, dataNascimento: item.birthDate, pesoAtual: item.weight || 0, categoria: item.categoria || null, observacoes: item.observacoes || null, statusReprodutivo: item.reproductiveStatus, previsaoParto: item.birthForecast, emTransferenciaEmbriao: item.embryoTransfer, marcadoDescarte: item.markedForDiscard, motivoDescarte: item.discardReason || null, currentPaddockId: item.paddock.id, lotId: item.lot?.id || null } });
        createdByRef.set(normalizeHeader(item.brinco), animal);
        createdByRef.set(normalizeHeader(item.registrationNumber), animal);
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
    const linhasCorrecao = Array.isArray(req.body?.linhasCorrecao) ? req.body.linhasCorrecao : [];
    const errors = linhasCorrecao.length > 0 ? linhasCorrecao : (Array.isArray(req.body?.erros) ? req.body.erros : []);
    if (!errors.length) return res.status(400).json({ message: 'Nenhuma linha para correção informada.' });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Erros P.O.');
    const totalColumns = PO_TEMPLATE_COLUMNS.length + 1;
    const lastColumnLetter = String.fromCharCode(64 + totalColumns);
    sheet.mergeCells(`A1:${lastColumnLetter}1`);
    const banner = sheet.getCell('A1');
    banner.value = '⚠  Esta planilha contém todas as linhas originais. Corrija somente as linhas com motivo em vermelho e use "Enviar planilha corrigida" no EIXO.';
    banner.font = { bold: true, color: { argb: '7F1D1D' }, size: 11, name: 'Arial' };
    banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
    banner.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    banner.border = { bottom: { style: 'medium', color: { argb: 'A32D2D' } } };
    sheet.getRow(1).height = 32;
    sheet.addRow([...PO_TEMPLATE_COLUMNS.map((column) => column.label), 'Motivo do erro']);
    errors.forEach((error) => {
      const row = sheet.addRow([...PO_TEMPLATE_COLUMNS.map((column) => error?.dados?.[column.key] ?? ''), (error?.motivos || []).join(' · ')]);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { size: 10, name: 'Arial' };
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = IMPORT_CELL_BORDER;
      });
      if ((error?.motivos || []).length > 0) {
        const reasonCell = row.getCell(PO_TEMPLATE_COLUMNS.length + 1);
        reasonCell.font = { color: { argb: 'A32D2D' }, bold: true };
        reasonCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FEE2E2' } };
      }
    });
    sheet.getRow(2).font = { bold: true, color: { argb: 'FFFFFF' }, name: 'Arial' };
    sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2F8A3E' } };
    sheet.getRow(2).height = 44;
    PO_TEMPLATE_COLUMNS.forEach((column, index) => {
      const headerCell = sheet.getCell(2, index + 1);
      headerCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      headerCell.border = IMPORT_CELL_BORDER;
      sheet.getColumn(index + 1).width = IMPORT_COLUMN_WIDTHS[column.type] || 18;
    });
    const reasonHeader = sheet.getCell(2, totalColumns);
    reasonHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'A32D2D' } };
    reasonHeader.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    reasonHeader.border = IMPORT_CELL_BORDER;
    sheet.getColumn(totalColumns).width = 50;
    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="[EIXO] Planilha completa PO para correcao.xlsx"');
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

app.post('/po/animals/:id/eventos', requireAuth, async (req, res) => {
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

app.post('/po/animals/:id/sanitario', requireAuth, async (req, res) => {
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
