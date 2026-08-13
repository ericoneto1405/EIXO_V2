export const calculateActivePaddockArea = (paddocks = []) => paddocks
    .filter((paddock) => paddock.active !== false)
    .reduce((total, paddock) => total + (Number(paddock.areaHa) || 0), 0);

export const hasDuplicatePaddockNames = (paddocks = []) => {
    const names = paddocks.map((paddock) => String(paddock.name || '').trim().toLocaleLowerCase('pt-BR'));
    return new Set(names).size !== names.length;
};

export const hasActivePaddock = (paddocks = []) => paddocks.some((paddock) => paddock.active !== false);
