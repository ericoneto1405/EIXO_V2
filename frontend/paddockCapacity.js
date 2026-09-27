const GRAZING_DIVISION_TYPES = new Set(['pasto', 'piquete de maternidade']);

/**
 * Pastos antigos podem não ter o tipo preenchido. Nesse caso, preservamos o
 * comportamento histórico e tratamos a divisão como área de pastejo.
 */
export const isGrazingPaddock = (paddock) =>
    GRAZING_DIVISION_TYPES.has(paddock?.divisionType ?? 'pasto');

/**
 * Ordem canônica da capacidade: UA gravada, depois área × lotação. Área sem
 * lotação não representa capacidade e devolve null.
 */
export const getPaddockCapacityUa = (paddock) => {
    const storedCapacity = Number(paddock?.capacity);
    if (Number.isFinite(storedCapacity) && storedCapacity > 0) {
        return storedCapacity;
    }

    const areaHa = Number(paddock?.areaHa);
    const stockingUaHa = Number(paddock?.lotacaoUaHa);
    if (Number.isFinite(areaHa) && areaHa > 0 && Number.isFinite(stockingUaHa) && stockingUaHa > 0) {
        return areaHa * stockingUaHa;
    }

    return null;
};

export const summarizeActiveGrazingCapacity = (paddocks = []) => {
    const eligiblePaddocks = paddocks.filter(
        (paddock) => paddock?.active !== false && isGrazingPaddock(paddock),
    );
    const capacities = eligiblePaddocks
        .map(getPaddockCapacityUa)
        .filter((value) => value !== null);

    const totalUa = capacities.reduce((total, value) => total + value, 0);
    const configuredCount = capacities.length;
    const eligibleCount = eligiblePaddocks.length;
    const state = configuredCount === 0
        ? 'not-informed'
        : configuredCount < eligibleCount
            ? 'partial'
            : 'complete';

    return { totalUa, configuredCount, eligibleCount, state };
};
