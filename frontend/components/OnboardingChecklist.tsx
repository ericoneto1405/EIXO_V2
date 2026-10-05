import React, { useCallback, useRef, useState, useEffect } from 'react';
import { buildApiUrl } from '../api';
import type { Farm } from '../types';
import { listAnimals } from '../adapters/herdApi';
import ProgressGuide, { guideButtonClass } from './ProgressGuide';
import { GuideNavigation, hasFarmWeighings, initialDoneKey, readFlag, writeFlag, useGuideCollapsed, useGuideData } from './progressGuideState';

interface OnboardingChecklistProps {
    userId: string;
    farmId: string | null;
    farms: Farm[];
    onNavigate: GuideNavigation;
    onboardingCompletedAt?: string | null;
    canEditAnimals: boolean;
    canNavigateHerd: boolean;
    canManageFarms: boolean;
}

const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({ userId, farmId, farms, onNavigate, onboardingCompletedAt, canEditAnimals, canNavigateHerd, canManageFarms }) => {
    const selectedFarm = farms.find((farm) => farm.id === farmId);
    const [collapsed, setCollapsed] = useGuideCollapsed(userId, farmId, 'initial');
    const [confirmedUser, setConfirmedUser] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const context = JSON.stringify([userId, farmId]);
    const currentContext = useRef(context);
    currentContext.current = context;
    const mounted = useRef(true);
    const savingRef = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { setSaveError(false); }, [context]);
    const completed = Boolean(onboardingCompletedAt) || confirmedUser === userId || readFlag(initialDoneKey(userId));
    const load = useCallback(async () => {
        if (completed || !farmId) return { animals: false, weighings: false };
        const [animals, weighings] = await Promise.all([listAnimals(farmId, 'COMMERCIAL'), hasFarmWeighings(farmId)]);
        return { animals: animals.length > 0, weighings };
    }, [farmId, completed]);
    const { data, loading, error, retry } = useGuideData(context, load, ['eixo:herd-onboarding-progress-changed']);
    const steps = [
        { title: 'Cadastre a fazenda', description: 'Registre o nome, localização e tamanho da propriedade.', done: Boolean(selectedFarm) },
        { title: 'Cadastre os pastos', description: 'Organize a lotação e o manejo da fazenda selecionada.', done: (selectedFarm?.paddocks?.length ?? 0) > 0 },
        { title: 'Cadastre ou importe os animais', description: 'Monte o rebanho inicial da fazenda selecionada.', done: Boolean(data?.animals) },
        { title: 'Registre a primeira pesagem', description: 'Comece a acompanhar o desempenho do rebanho.', done: Boolean(data?.weighings) },
    ];
    const allDone = Boolean(data) && steps.every((step) => step.done);
    const pending = steps.findIndex((step) => !step.done);
    const confirm = async () => {
        if (savingRef.current || !allDone || loading || error) return;
        savingRef.current = true;
        setSaving(true);
        setSaveError(false);
        const requestContext = context;
        try {
            const response = await fetch(buildApiUrl('/auth/me/onboarding'), { method: 'PATCH', credentials: 'include' });
            if (!response.ok) throw new Error('Falha ao concluir.');
            // Só persistir uma confirmação que ainda pertence ao usuário/contexto ativo.
            if (mounted.current && currentContext.current === requestContext) {
                writeFlag(initialDoneKey(userId), true);
                setConfirmedUser(userId);
            }
        } catch {
            if (mounted.current && currentContext.current === requestContext) setSaveError(true);
        } finally {
            savingRef.current = false;
            if (mounted.current) setSaving(false);
        }
    };
    if (completed) return null;
    return <ProgressGuide key={context} requiresConfirmation title="Primeiros passos" description="Aprenda o fluxo usando a fazenda selecionada. Este guia é concluído uma vez por usuário." farmName={selectedFarm?.name} steps={steps} loading={loading} error={error} hasData={Boolean(data)} collapsed={collapsed} onCollapse={setCollapsed} onRetry={retry}>
        {allDone ? <>
            {saveError && <p role="alert" className="mb-3 text-sm text-(--eixo-danger)">Não foi possível salvar a conclusão. Seus passos foram preservados.</p>}
            <button type="button" disabled={saving} onClick={confirm} className={guideButtonClass}>{saving ? 'Salvando conclusão…' : saveError ? 'Tentar salvar conclusão novamente' : 'Concluir primeiros passos'}</button>
        </> : farmId ? <div className="flex flex-wrap items-center gap-3">
            {(pending === 0 || pending === 1) && canManageFarms && <button type="button" className={guideButtonClass} onClick={() => onNavigate('Fazendas')}>{pending === 0 ? 'Cadastrar fazenda' : 'Cadastrar pastos'}</button>}
            {pending === 2 && canNavigateHerd && canEditAnimals && <>
                <button type="button" className={guideButtonClass} onClick={() => onNavigate('Rebanho Comercial', { herdTab: 'animals', openAnimalForm: true })}>Cadastrar animais</button>
                <button type="button" className="rounded-xl border border-(--eixo-border) px-3.5 py-2 text-sm font-semibold focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-(--eixo-green-dark)" onClick={() => onNavigate('Rebanho Comercial', { herdTab: 'animals', openImportModal: true })}>Importar animais</button>
            </>}
            {pending === 3 && canNavigateHerd && canEditAnimals && <button type="button" className={guideButtonClass} onClick={() => onNavigate('Rebanho Comercial', { herdTab: 'weighings' })}>Registrar pesagem</button>}
            {((pending < 2 && !canManageFarms) || (pending === 2 && (!canNavigateHerd || !canEditAnimals)) || (pending === 3 && (!canNavigateHerd || !canEditAnimals))) && <p className="text-sm text-(--eixo-text-muted)">Peça a um responsável com acesso para concluir este passo.</p>}
        </div> : null}
    </ProgressGuide>;
};
export default OnboardingChecklist;
