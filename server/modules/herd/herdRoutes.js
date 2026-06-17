import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import { requireAuth } from '../middlewares/requireAuth.js';
import { buildFarmScopeFilter, buildFarmRelationFilter } from '../middlewares/farmScope.js';
import { parseNumber, parseDateValue } from '../utils/formatters.js';
import { logActivity } from '../utils/activityLog.js';
import { serializeHerdEvent, serializeSanitaryRecord } from '../utils/serializers.js';
import { HERD_EVENT_CATEGORY_MAP, SANITARY_CATEGORY_MAP } from '../config/env.js';
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
    const { type, date, peso, valor, origem, destino, observacoes } = req.body || {};

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
        const event = await prisma.herdEvent.create({
            data: {
                farmId: animal.farmId,
                animalId: id,
                type: eventType,
                date: eventDate,
                peso: parseNumber(peso),
                valor: parseNumber(valor),
                origem: origem?.trim() || null,
                destino: destino?.trim() || null,
                observacoes: observacoes?.trim() || null,
            },
        });

        // Auto-lançamento financeiro para COMPRA e VENDA
        const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
        if (financialMap && valor) {
            const parsedValor = parseNumber(valor);
            if (parsedValor && parsedValor > 0) {
                await prisma.financialTransaction.create({
                    data: {
                        farmId: animal.farmId,
                        type: financialMap.type,
                        categoria: financialMap.categoria,
                        accountCategoryId: financialMap.categoryId,
                        valor: parsedValor,
                        data: eventDate,
                        descricao: `${eventType === 'COMPRA' ? 'Compra' : 'Venda'} de animal — ${animal.brinco || id}`,
                        herdEventId: event.id,
                        status: 'PAGO',
                    },
                });
            }
        }

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
        const record = await prisma.sanitaryRecord.create({
            data: {
                farmId: animal.farmId,
                animalId: id,
                tipo: tipoUpper,
                produto: produto.trim(),
                date: eventDate,
                dose: dose?.trim() || null,
                proximaAplicacao: parseDateValue(proximaAplicacao),
                observacoes: observacoes?.trim() || null,
                valorUnitario: parsedValor || null,
            },
        });

        // Auto-lançamento financeiro se valorUnitario foi informado
        const sanitaryMap = SANITARY_CATEGORY_MAP[tipoUpper];
        if (sanitaryMap && parsedValor && parsedValor > 0) {
            await prisma.financialTransaction.create({
                data: {
                    farmId: animal.farmId,
                    type: 'SAIDA',
                    categoria: sanitaryMap.categoria,
                    accountCategoryId: sanitaryMap.categoryId,
                    valor: parsedValor,
                    data: eventDate,
                    descricao: `${produto.trim()} — ${animal.brinco || id}`,
                    sanitaryRecordId: record.id,
                    status: 'PAGO',
                },
            });
        }

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
  'F1 (50/50)',
  '3/4 ou 5/8 sangue',
  'Anelorado',
  'Cruzado europeu × zebu',
  'Comercial / Sem definição',
];

const STATUS_REPRODUTIVOS = ['PRENHE', 'VAZIA', 'CICLANDO', 'RECRIA'];

// ─── Estrutura do template (18 colunas) ────────────────────────────────────
// tier: required | conditional | recommended | optional
const TEMPLATE_COLUMNS = [
  { key: 'identificacao',      label: 'Identificação',        tier: 'required',     type: 'text',   example: 'BR001',          description: 'Brinco, tatuagem ou número que identifica o animal de forma única.' },
  { key: 'sexo',               label: 'Sexo',                 tier: 'required',     type: 'list',   options: ['MACHO', 'FEMEA'], example: 'MACHO', description: 'MACHO ou FEMEA.' },
  { key: 'tipo_raca',          label: 'Tipo de Raça',         tier: 'required',     type: 'list',   options: ['Pura', 'Mestiça'], example: 'Pura', description: 'Pura = animal de uma raça só. Mestiça = cruzamento entre raças.' },
  { key: 'raca',               label: 'Raça',                 tier: 'conditional',  type: 'list',   options: RACAS_PURAS,      example: 'Nelore',          description: 'Obrigatório se Tipo de Raça = Pura. Escolha a raça do animal.' },
  { key: 'composicao_mestica', label: 'Composição Mestiça',   tier: 'conditional',  type: 'list',   options: COMPOSICOES_MESTICAS, example: 'F1 (50/50)', description: 'Obrigatório se Tipo de Raça = Mestiça. Como é a mistura do animal.' },
  { key: 'data_nascimento',    label: 'Data de Nascimento',   tier: 'recommended',  type: 'date',   example: '2020-03-15',     description: 'Data de nascimento (AAAA-MM-DD). Pode ser estimativa.' },
  { key: 'ultimo_peso_kg',     label: 'Último Peso (kg)',     tier: 'recommended',  type: 'number', example: '520',            description: 'Peso registrado mais recente, em kg.' },
  { key: 'data_pesagem',       label: 'Data da Pesagem',      tier: 'recommended',  type: 'date',   example: '2026-06-01',     description: 'Data da pesagem informada acima (AAAA-MM-DD).' },
  { key: 'padrao_racial',      label: 'Padrão Racial',        tier: 'optional',     type: 'list',   options: ['PO', 'PSR'],    example: 'PO',             description: 'PO = Puro de Origem (com registro). PSR = Puro Sem Registro.' },
  { key: 'registro',           label: 'Registro',             tier: 'optional',     type: 'text',   example: 'RGN-5678',       description: 'Número do registro genealógico, se for PO.' },
  { key: 'raca_predominante',  label: 'Raça Predominante',    tier: 'optional',     type: 'list',   options: RACAS_PURAS,      example: 'Nelore',         description: 'Para mestiços: raça que mais aparece no animal.' },
  { key: 'nome',               label: 'Nome',                 tier: 'optional',     type: 'text',   example: 'Touro Imperial', description: 'Nome do animal (comum em PO ou animal de destaque).' },
  { key: 'brinco_eletronico',  label: 'Brinco Eletrônico',    tier: 'optional',     type: 'text',   example: 'E001',           description: 'Identificador eletrônico (RFID), se houver.' },
  { key: 'pai_nome',           label: 'Nome do Pai',          tier: 'optional',     type: 'text',   example: 'Imperial',       description: 'Nome do pai do animal (texto livre).' },
  { key: 'mae_nome',           label: 'Nome da Mãe',          tier: 'optional',     type: 'text',   example: 'Princesa',       description: 'Nome da mãe do animal (texto livre).' },
  { key: 'status_reprodutivo', label: 'Status Reprodutivo',   tier: 'optional',     type: 'list',   options: STATUS_REPRODUTIVOS, example: 'CICLANDO',    description: 'Só para fêmeas. PRENHE, VAZIA, CICLANDO ou RECRIA.' },
  { key: 'previsao_parto',     label: 'Previsão de Parto',    tier: 'optional',     type: 'date',   example: '2027-01-15',     description: 'Só preencher se Status Reprodutivo = PRENHE.' },
  { key: 'observacoes',        label: 'Observações',          tier: 'optional',     type: 'text',   example: 'Genética alta.', description: 'Qualquer informação adicional sobre o animal.' },
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

app.get('/herd/import/template', async (_req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'EIXO';
    workbook.created = new Date();

    // =============================================
    // ABA 1 — INSTRUÇÕES
    // =============================================
    const instrucoes = workbook.addWorksheet('Instruções', { properties: { tabColor: { argb: '2F8A3E' } } });

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

    // =============================================
    // ABA 2 — DADOS (onde o produtor preenche)
    // =============================================
    const dados = workbook.addWorksheet('Dados', { properties: { tabColor: { argb: '3B82F6' } } });

    // Cabeçalhos
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      const cell = dados.getCell(1, idx + 1);
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
      cell.comment = { texts: [{ text: col.description, font: { size: 10, name: 'Arial' } }] };

      // Largura da coluna baseada no tipo
      const widthByType = { date: 16, number: 14, list: 22, text: 22 };
      dados.getColumn(idx + 1).width = widthByType[col.type] || 20;
    });
    dados.getRow(1).height = 36;

    // Linha 2 — exemplo (italico, cinza, sinalizando que é referência)
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      const cell = dados.getCell(2, idx + 1);
      cell.value = col.example;
      cell.font = { italic: true, color: { argb: '9CA3AF' }, size: 10, name: 'Arial' };
      cell.alignment = { vertical: 'middle' };
    });

    // Freeze pane na linha 1
    dados.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

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

    // Aplica validação de dados (dropdowns) nas colunas tipo 'list' da aba Dados
    TEMPLATE_COLUMNS.forEach((col, idx) => {
      if (col.type === 'list' && listColumnsMap[col.key]) {
        const colChar = String.fromCharCode(64 + idx + 1);
        for (let row = 2; row <= 1001; row++) { // permite até 1000 linhas
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
        for (let row = 2; row <= 1001; row++) {
          dados.getCell(`${colChar}${row}`).numFmt = 'yyyy-mm-dd';
        }
      }
      if (col.type === 'number') {
        const colChar = String.fromCharCode(64 + idx + 1);
        for (let row = 2; row <= 1001; row++) {
          dados.getCell(`${colChar}${row}`).numFmt = '0.##';
        }
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo_rebanho_eixo.xlsx"');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Erro ao gerar planilha modelo:', error);
    return res.status(500).json({ message: 'Erro ao gerar planilha modelo.' });
  }
});

// =============================================
// IMPORTAÇÃO DE PLANILHA — Rebanho Comercial
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
  const d = new Date(value);
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

app.post('/herd/import', async (req, res) => {
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

  const farm = await prisma.farm.findUnique({ where: { id: farmId } });
  if (!farm) {
    return res.status(404).json({ message: 'Fazenda não encontrada.' });
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

      const brincoNum = parseNumber(brinco);
      const identityKey = brincoNum ? String(brincoNum) : brinco;

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
        const paiKey = row.pai_registro?.trim() || row.pai_nome.trim();
        const pai = await prisma.animal.findFirst({
          where: { farmId, identityKey: paiKey },
        });
        if (pai) {
          await prisma.animal.update({ where: { id: animal.id }, data: { paiId: pai.id } });
          rowResult.created.pai = pai.id;
        }
      }

      if (row.mae_nome?.trim() || row.mae_registro?.trim()) {
        const maeKey = row.mae_registro?.trim() || row.mae_nome.trim();
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
          },
        });
        rowResult.created.herdEvent = herdEvent.id;

        if (valorCompra && valorCompra > 0) {
          const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
          if (financialMap) {
            const ft = await prisma.financialTransaction.create({
              data: {
                farmId,
                type: financialMap.type,
                categoria: financialMap.categoria,
                accountCategoryId: financialMap.categoryId,
                valor: valorCompra,
                data: eventDate,
                descricao: `${eventType} de animal — ${brinco}`,
                herdEventId: herdEvent.id,
                status: 'PAGO',
              },
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
    const { type, date, peso, valor, origem, destino, observacoes } = req.body || {};

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
        const event = await prisma.herdEvent.create({
            data: {
                farmId: animal.farmId,
                poAnimalId: id,
                type: eventType,
                date: eventDate,
                peso: parseNumber(peso),
                valor: parseNumber(valor),
                origem: origem?.trim() || null,
                destino: destino?.trim() || null,
                observacoes: observacoes?.trim() || null,
            },
        });

        const financialMap = HERD_EVENT_CATEGORY_MAP[eventType];
        if (financialMap && valor) {
            const parsedValor = parseNumber(valor);
            if (parsedValor && parsedValor > 0) {
                await prisma.financialTransaction.create({
                    data: {
                        farmId: animal.farmId,
                        type: financialMap.type,
                        categoria: financialMap.categoria,
                        accountCategoryId: financialMap.categoryId,
                        valor: parsedValor,
                        data: eventDate,
                        descricao: `${eventType === 'COMPRA' ? 'Compra' : 'Venda'} P.O. — ${animal.brinco || animal.nome || id}`,
                        herdEventId: event.id,
                        status: 'PAGO',
                    },
                });
            }
        }

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
        const record = await prisma.sanitaryRecord.create({
            data: {
                farmId: animal.farmId,
                poAnimalId: id,
                tipo: tipoUpper,
                produto: produto.trim(),
                date: eventDate,
                dose: dose?.trim() || null,
                proximaAplicacao: parseDateValue(proximaAplicacao),
                observacoes: observacoes?.trim() || null,
                valorUnitario: parsedValor || null,
            },
        });

        const sanitaryMap = SANITARY_CATEGORY_MAP[tipoUpper];
        if (sanitaryMap && parsedValor && parsedValor > 0) {
            await prisma.financialTransaction.create({
                data: {
                    farmId: animal.farmId,
                    type: 'SAIDA',
                    categoria: sanitaryMap.categoria,
                    accountCategoryId: sanitaryMap.categoryId,
                    valor: parsedValor,
                    data: eventDate,
                    descricao: `${produto.trim()} P.O. — ${animal.brinco || animal.nome || id}`,
                    sanitaryRecordId: record.id,
                    status: 'PAGO',
                },
            });
        }

        return res.status(201).json({ record: serializeSanitaryRecord(record) });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Erro ao salvar registro sanitário.' });
    }
});
}
