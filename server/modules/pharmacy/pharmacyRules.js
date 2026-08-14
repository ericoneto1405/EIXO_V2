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
