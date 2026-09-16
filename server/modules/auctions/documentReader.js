import { GoogleGenAI, Type } from '@google/genai';
import { extractText, getDocumentProxy } from 'unpdf';
import { DOCUMENT_AI_MODEL, DOCUMENT_AI_TIER, GOOGLE_API_KEY } from '../config/env.js';

const MIN_TEXT_CHARS = 80;
const MAX_TEXT_CHARS = 60000;

const client = GOOGLE_API_KEY ? new GoogleGenAI({ apiKey: GOOGLE_API_KEY }) : null;

export const isDocumentReaderConfigured = () => Boolean(client);

// No gratuito o Google pode ler e reaproveitar o conteúdo: só o super admin testa.
export const canUseDocumentReader = (req) => {
    if (!client) return false;
    if (DOCUMENT_AI_TIER === 'paid') return true;
    return Boolean(req.user?.roles?.includes('SUPER_ADMIN'));
};

export const extractPdfText = async (buffer) => {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
};

// Números sem pontuação só são tampados quando vêm depois de "CPF"/"CNPJ"; assim um
// registro genealógico de 11 dígitos não some.
const REDACTIONS = [
    { label: 'CNPJ', pattern: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g },
    { label: 'CNPJ', pattern: /(CNPJ\s*(?:n[º°o.]*)?\s*:?\s*)\d{14}\b/gi, keepPrefix: true },
    { label: 'CPF', pattern: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
    { label: 'CPF', pattern: /(CPF\s*(?:n[º°o.]*)?\s*:?\s*)\d{11}\b/gi, keepPrefix: true },
    { label: 'EMAIL', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
    { label: 'TELEFONE', pattern: /(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]\d{4}\b/g },
    { label: 'CONTA', pattern: /\b(?:ag[êe]ncia|conta|c\/c|pix)\s*[:nº°.]*\s*[\w.\-\/@]{3,}/gi },
];

export const redactPersonalData = (text) => {
    let result = String(text || '');
    const counts = {};
    for (const { label, pattern, keepPrefix } of REDACTIONS) {
        result = result.replace(pattern, (_match, prefix) => {
            counts[label] = (counts[label] || 0) + 1;
            return `${keepPrefix ? prefix : ''}[${label}]`;
        });
    }
    return { text: result, counts };
};

const RESPONSE_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        documentKind: { type: Type.STRING, enum: ['CONTRATO', 'NOTA', 'CATALOGO', 'REGISTRO', 'OUTRO'] },
        animal: {
            type: Type.OBJECT,
            properties: {
                nome: { type: Type.STRING, nullable: true },
                registro: { type: Type.STRING, nullable: true },
                raca: { type: Type.STRING, nullable: true },
                sexo: { type: Type.STRING, enum: ['MACHO', 'FEMEA'], nullable: true },
                dataNascimento: { type: Type.STRING, nullable: true, description: 'AAAA-MM-DD' },
                pai: { type: Type.STRING, nullable: true },
                mae: { type: Type.STRING, nullable: true },
                lote: { type: Type.STRING, nullable: true },
            },
        },
        leilao: {
            type: Type.OBJECT,
            properties: {
                nome: { type: Type.STRING, nullable: true },
                leiloeira: { type: Type.STRING, nullable: true },
                data: { type: Type.STRING, nullable: true, description: 'AAAA-MM-DD' },
                valorTotal: { type: Type.NUMBER, nullable: true, description: 'Valor total do animal ou da parte comprada, em reais' },
                parcelas: { type: Type.INTEGER, nullable: true },
                valorParcela: { type: Type.NUMBER, nullable: true },
                comissaoPct: { type: Type.NUMBER, nullable: true },
                percentualAdquirido: { type: Type.NUMBER, nullable: true, description: 'Percentual do animal comprado, 0 a 100' },
                vendedor: { type: Type.STRING, nullable: true },
                comprador: { type: Type.STRING, nullable: true },
            },
        },
        socios: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    nome: { type: Type.STRING },
                    percentual: { type: Type.NUMBER, nullable: true },
                },
                required: ['nome'],
            },
        },
        observacoes: { type: Type.STRING, nullable: true, description: 'Dúvidas ou campos ambíguos' },
    },
    required: ['documentKind', 'animal', 'leilao', 'socios'],
};

const PROMPT = `Você lê documentos de leilão de gado de elite no Brasil (contrato de compra e venda, nota de arrematação, catálogo ou registro genealógico).
Extraia só o que estiver escrito. Não invente: campo ausente = null.
Valores em reais como número (ex.: "R$ 1.200.000,00" -> 1200000). Datas em AAAA-MM-DD.
Se houver condomínio, liste cada condômino com seu percentual. Dados pessoais aparecem tampados como [CPF], [TELEFONE] etc.; ignore-os.
Se o documento tiver vários lotes, use o primeiro e explique em "observacoes".`;

const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const toText = (value) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : null);
const toDate = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

export const normalizeExtraction = (raw = {}) => ({
    documentKind: ['CONTRATO', 'NOTA', 'CATALOGO', 'REGISTRO', 'OUTRO'].includes(raw.documentKind) ? raw.documentKind : 'OUTRO',
    animal: {
        nome: toText(raw.animal?.nome),
        registro: toText(raw.animal?.registro),
        raca: toText(raw.animal?.raca),
        sexo: ['MACHO', 'FEMEA'].includes(raw.animal?.sexo) ? raw.animal.sexo : null,
        dataNascimento: toDate(raw.animal?.dataNascimento),
        pai: toText(raw.animal?.pai),
        mae: toText(raw.animal?.mae),
        lote: toText(raw.animal?.lote),
    },
    leilao: {
        nome: toText(raw.leilao?.nome),
        leiloeira: toText(raw.leilao?.leiloeira),
        data: toDate(raw.leilao?.data),
        valorTotal: toNumber(raw.leilao?.valorTotal),
        parcelas: Number.isInteger(raw.leilao?.parcelas) ? raw.leilao.parcelas : null,
        valorParcela: toNumber(raw.leilao?.valorParcela),
        comissaoPct: toNumber(raw.leilao?.comissaoPct),
        percentualAdquirido: toNumber(raw.leilao?.percentualAdquirido),
        vendedor: toText(raw.leilao?.vendedor),
        comprador: toText(raw.leilao?.comprador),
    },
    socios: (Array.isArray(raw.socios) ? raw.socios : [])
        .map((s) => ({ nome: toText(s?.nome), percentual: toNumber(s?.percentual) }))
        .filter((s) => s.nome)
        .slice(0, 30),
    observacoes: toText(raw.observacoes),
});

export const readAuctionText = async (text) => {
    if (!client) throw new Error('Leitura com IA não configurada.');
    const { text: safeText, counts } = redactPersonalData(text);
    const response = await client.models.generateContent({
        model: DOCUMENT_AI_MODEL,
        contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\n--- DOCUMENTO ---\n${safeText.slice(0, MAX_TEXT_CHARS)}` }] }],
        config: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0 },
    });
    let parsed;
    try {
        parsed = JSON.parse(String(response?.text || '{}'));
    } catch {
        throw new Error('A IA devolveu uma resposta que não deu para ler. Tente de novo.');
    }
    return { extraction: normalizeExtraction(parsed), redacted: counts };
};

export const hasEnoughText = (text) => String(text || '').replace(/\s/g, '').length >= MIN_TEXT_CHARS;
