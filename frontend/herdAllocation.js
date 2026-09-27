export const summarizeHerdAllocation = (animals = [], paddocks = []) => {
    const paddockCounts = new Map();
    let allocatedCount = 0;

    for (const animal of animals) {
        if (!animal?.currentPaddockId) continue;
        allocatedCount += 1;
        paddockCounts.set(
            animal.currentPaddockId,
            (paddockCounts.get(animal.currentPaddockId) || 0) + 1,
        );
    }

    const visiblePaddocks = paddocks.filter(
        (paddock) => paddock?.active !== false || (paddockCounts.get(paddock?.id) || 0) > 0,
    );

    return {
        paddockCounts,
        visiblePaddocks,
        allocatedCount,
        withoutPaddockCount: animals.length - allocatedCount,
        totalActive: animals.length,
    };
};
