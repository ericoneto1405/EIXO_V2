export const calculatePharmacyMovement = ({ currentStock, type, quantity }) => {
    const current = Number(currentStock);
    const informed = Number(quantity);
    if (!Number.isFinite(current) || current < 0 || !Number.isFinite(informed) || informed < 0) {
        throw new Error('Quantidade inválida.');
    }
    if (type !== 'ADJUSTMENT' && informed === 0) {
        throw new Error('Quantidade inválida.');
    }
    const nextStock = type === 'ENTRY'
        ? current + informed
        : type === 'EXIT'
            ? current - informed
            : informed;
    if (nextStock < 0) {
        throw new Error('Estoque insuficiente.');
    }
    return {
        nextStock,
        movementQuantity: type === 'ADJUSTMENT' ? nextStock - current : informed,
    };
};

export const PHARMACY_PAYMENT_CONDITIONS = new Set(['PAGO', 'A_PAGAR', 'PARCELADO', 'ENTRADA_PARCELADO', 'CARTAO']);

// Decisão do Erico (set/2026): a COMPRA vira custo no resultado geral da fazenda.
// A aplicação só distribui esse custo por lote e por animal (relatório da Sanidade),
// sem novo lançamento no resultado. Remédio que vence fica no resultado da fazenda
// e nunca chega ao lote: é perda por falta de gestão do estoque.
export const pharmacyPurchaseAccount = (productCategory) => {
    if (productCategory === 'VACINA') return 'sys-vacinas';
    if (productCategory === 'VERMIFUGO' || productCategory === 'ANTIPARASITARIO') return 'sys-vermifugos';
    return 'sys-tratamentos';
};

// Traduz a forma de pagamento da tela para o formato da função de parcelas da compra de animais.
// Cartão: cada parcela vence na data de pagamento da fatura (a 1ª fatura é informada; as outras, mês a mês).
export const normalizePharmacyPayment = (payment = {}) => {
    const condition = String(payment.condition || 'PAGO').toUpperCase();
    if (!PHARMACY_PAYMENT_CONDITIONS.has(condition)) return { error: 'Forma de pagamento inválida.' };
    const installments = payment.installments === '' || payment.installments == null ? null : Number(payment.installments);
    const parseDue = (value) => {
        if (!value) return null;
        const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00.000Z`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const dueDate = parseDue(payment.dueDate);
    if (condition === 'PAGO') return { schedule: { condition: 'PAGO' }, isCard: false };
    if (!dueDate) {
        return { error: condition === 'CARTAO' ? 'Informe a data de pagamento da fatura do cartão.' : 'Informe a data do primeiro vencimento.' };
    }
    if (condition === 'CARTAO') {
        const count = installments ?? 1;
        if (!Number.isInteger(count) || count < 1 || count > 24) return { error: 'No cartão, informe de 1 a 24 parcelas.' };
        return {
            schedule: count === 1 ? { condition: 'A_PAGAR', dueDate } : { condition: 'PARCELADO', dueDate, installments: count },
            isCard: true,
        };
    }
    return {
        schedule: { condition, dueDate, installments, downPayment: Number(payment.downPayment || 0) },
        isCard: false,
    };
};
