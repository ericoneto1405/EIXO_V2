export const SUPPORT_ROLLOUT_MODES = new Set(['shadow', 'pilot', 'full']);

export const parseSupportPilotOrganizationIds = (value) => Array.from(new Set(
    String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
));

export const getSupportRolloutDecision = ({
    mode = 'full',
    organizationId = null,
    pilotOrganizationIds = [],
} = {}) => {
    const normalizedMode = SUPPORT_ROLLOUT_MODES.has(mode) ? mode : 'shadow';
    const live = normalizedMode === 'full'
        || (normalizedMode === 'pilot' && Boolean(organizationId) && pilotOrganizationIds.includes(organizationId));
    return {
        mode: normalizedMode,
        live,
        reason: live ? null : normalizedMode === 'pilot' ? 'rollout_pilot_control' : 'rollout_shadow',
    };
};
