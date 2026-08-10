export const buildProvisionalIdentification = (matrixIdentification, sequence) => {
    const snapshot = String(matrixIdentification || '').trim();
    const parsedSequence = Number(sequence);
    if (!snapshot || !Number.isInteger(parsedSequence) || parsedSequence < 1) {
        throw new Error('Identificação da matriz e sequência são obrigatórias.');
    }
    return `Mãe ${snapshot}-${parsedSequence}`;
};

const normalizeTePart = (value, prefix) => String(value || '')
    .trim()
    .replace(new RegExp(`^${prefix}[-\\s]*`, 'i'), '')
    .trim();

export const buildTeProvisionalIdentification = (recipientIdentification, donorIdentification, sequence) => {
    const recipient = normalizeTePart(recipientIdentification, 'TE');
    const donor = normalizeTePart(donorIdentification, 'DO');
    const parsedSequence = Number(sequence);
    if (!recipient || !donor || !Number.isInteger(parsedSequence) || parsedSequence < 1) {
        throw new Error('Receptora, doadora e sequência são obrigatórias.');
    }
    return `TE-${recipient}-${String(parsedSequence).padStart(2, '0')} | DO-${donor}`;
};

export const isReadyForWeaning = ({ provisional, birthDate, sex, weightKg, now = new Date() }) => {
    if (!provisional) return false;
    const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
    const ageInMonths = Number.isFinite(birth.getTime())
        ? (now.getTime() - birth.getTime()) / (30.4375 * 86400000)
        : 0;
    const normalizedSex = String(sex || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const weight = Number(weightKg) || 0;
    return ageInMonths >= 7 || (normalizedSex === 'FEMEA' && weight >= 180) || (normalizedSex === 'MACHO' && weight >= 200);
};
