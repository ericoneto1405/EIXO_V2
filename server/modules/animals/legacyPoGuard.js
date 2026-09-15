// PO remains a valid Animal.tipoCadastro. Only references to the retired store
// are rejected: never reinterpret a legacy identifier as an Animal identifier.
const legacyKeys = new Set(['poAnimalId', 'poLotId', 'bullPoAnimalId', 'donorPoAnimalId', 'sirePoAnimalId', 'recipientPoAnimalId']);
export function hasLegacyPoReference(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, item]) =>
        (legacyKeys.has(key) && item != null && item !== '')
        || (key === 'herdType' && String(item).toUpperCase() === 'PO')
        || (item && typeof item === 'object' && hasLegacyPoReference(item)));
}
export function rejectLegacyPoReference(req, res, next) {
    if (hasLegacyPoReference(req.body) || hasLegacyPoReference(req.query)) {
        return res.status(400).json({ message: 'O cadastro separado P.O. foi encerrado. Use o cadastro único de animais.', code: 'LEGACY_PO_REFERENCE' });
    }
    return next();
}
