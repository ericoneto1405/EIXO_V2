// ─── Funções de Formatação e Normalização ───────────────────────────────────────

export function sanitizeUser(user) {
    const { password, ...safeUser } = user;
    return safeUser;
}

export const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

export function parseNumber(value) {
    const raw = String(value ?? '').trim().replace(/[^\d,.\-]/g, '');
    if (!raw) return null;
    const commaIndex = raw.lastIndexOf(',');
    const dotIndex = raw.lastIndexOf('.');
    let normalized = raw;
    if (commaIndex >= 0 && dotIndex >= 0) {
        normalized = commaIndex > dotIndex
            ? raw.replace(/\./g, '').replace(',', '.')
            : raw.replace(/,/g, '');
    } else if (commaIndex >= 0) {
        normalized = raw.replace(',', '.');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

export function parseDateValue(value) {
    if (!value) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function parseInteger(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeSexo(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'macho') {
        return 'MACHO';
    }
    if (normalized === 'femea' || normalized === 'fêmea') {
        return 'FEMEA';
    }
    return null;
}

export const formatSexoLabel = (sexo) => (sexo === 'FEMEA' ? 'Fêmea' : 'Macho');

export function normalizeReproMode(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return normalized === 'CONTINUO' || normalized === 'ESTACAO' ? normalized : null;
}

export function normalizeReproEventType(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    const validTypes = ['COBERTURA', 'IATF', 'DIAGNOSTICO_PRENHEZ', 'PARTO', 'DESMAME'];
    return validTypes.includes(normalized) ? normalized : null;
}

export function normalizePregStatus(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return normalized === 'PRENHE' || normalized === 'VACIA' ? normalized : null;
}

export function normalizeEmbryoTechnique(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return normalized === 'FIV' || normalized === 'TE' ? normalized : null;
}

export function normalizeSemenMoveType(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['IN', 'OUT', 'USE', 'ADJUST'].includes(normalized) ? normalized : null;
}

export function normalizeEmbryoMoveType(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['IN', 'OUT', 'TRANSFER', 'ADJUST'].includes(normalized) ? normalized : null;
}

export function normalizeSelectionDecision(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.trim().toUpperCase();
    return ['KEEP', 'WATCH', 'DISCARD'].includes(normalized) ? normalized : null;
}

export function normalizeAnimalTipoCadastro(value) {
    if (typeof value !== 'string') {
        return 'MESTICO';
    }
    const normalized = value
        .trim()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]/g, '');
    if (['PO', 'PUROORIGEM', 'PURODEORIGEM'].includes(normalized)) {
        return 'PO';
    }
    return 'MESTICO';
}

export function normalizeEmailForLogin(value) {
    return String(value || '').trim().toLowerCase();
}

export function isEmailValid(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}
