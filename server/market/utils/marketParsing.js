export const formatDateYYYYMMDD = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const parseMarketReferenceDate = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  const datePart = str.includes('T') ? str.split('T')[0] : str;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  const dt = new Date(`${datePart}T00:00:00.000Z`);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export const normalizeState = (value) => {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  return normalized.length >= 2 ? normalized.slice(0, 2) : null;
};

export const normalizeText = (value) => {
  if (value === null || value === undefined) return null;
  const out = String(value).trim();
  return out || null;
};

export const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
