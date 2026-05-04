import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, ChevronRight, ClipboardList, Cloud, HelpCircle, LoaderCircle, LogOut, MapPin, RefreshCw, Search, UserRound, Wifi, WifiOff } from 'lucide-react';
import { ACTIONS, buildAnimalLabel } from './actions';
import { getApiBaseUrl } from './api';
import { useAppAuth } from './hooks/useAppAuth';
import { useSyncReports } from './hooks/useSyncReports';
import ManagementScreen from './ManagementScreen';
import {
  type PendingPhoto,
  type PendingReport,
} from './offlineStorage';
import type { ActionConfig, Animal, AuthUser, Farm, Paddock } from './types';
import { formatCoordinateLabel } from './utils';

export default function App() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [entryMode, setEntryMode] = useState<'field' | 'management' | null>(null);
  const [selectedAction, setSelectedAction] = useState<ActionConfig | null>(null);
  const [selectedPaddockId, setSelectedPaddockId] = useState('');
  const [selectedAnimalId, setSelectedAnimalId] = useState('');
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [location, setLocation] = useState<{ lat: number | null; lng: number | null; label: string; loading: boolean }>({
    lat: null,
    lng: null,
    label: 'Aguardando localização',
    loading: false,
  });
  const [observations, setObservations] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [showAnimalLookup, setShowAnimalLookup] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [animalSearch, setAnimalSearch] = useState('');
  const [lastSyncedAction, setLastSyncedAction] = useState<ActionConfig | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    activationCode,
    animals,
    apiBaseUrl,
    currentProfile,
    currentUser,
    farm,
    handleLogin,
    isAuthenticating,
    isLoggingIn,
    loginError,
    loginEmail,
    loginPassword,
    logout,
    paddocks,
    screenError,
    setActivationCode,
    setLoginEmail,
    setLoginPassword,
    authMode,
  } = useAppAuth();
  const { enqueuePendingReport, isSyncing, pendingReports } = useSyncReports({
    shouldSync: isOnline && Boolean(currentUser && farm),
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const currentActionSummary = useMemo(() => lastSyncedAction || selectedAction, [lastSyncedAction, selectedAction]);
  const filteredAnimals = useMemo(() => {
    const query = animalSearch.trim().toLowerCase();
    if (!query) {
      return animals.slice(0, 20);
    }
    return animals
      .filter((animal) => {
        const label = buildAnimalLabel(animal).toLowerCase();
        return label.includes(query);
      })
      .slice(0, 20);
  }, [animalSearch, animals]);
  const handleLogout = async () => {
    await logout();
    closeModals();
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocation({
        lat: null,
        lng: null,
        label: 'GPS indisponível neste aparelho',
        loading: false,
      });
      return;
    }

    setLocation({
      lat: null,
      lng: null,
      label: 'Capturando localização...',
      loading: true,
    });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        setLocation({
          lat,
          lng,
          label: formatCoordinateLabel(lat, lng),
          loading: false,
        });
      },
      () => {
        setLocation({
          lat: null,
          lng: null,
          label: 'Não foi possível capturar a localização',
          loading: false,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 15000,
      },
    );
  };

  const handleActionClick = (action: ActionConfig) => {
    setSelectedAction(action);
    setSelectedPaddockId('');
    setSelectedAnimalId('');
    setPhotos([]);
    setObservations('');
    setSubmitError('');
    requestLocation();
  };

  const handleSelectPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (!files.length) {
      return;
    }

    const remainingSlots = Math.max(0, 3 - photos.length);
    const filesToRead = files.slice(0, remainingSlots);
    const nextPhotos: PendingPhoto[] = [];

    for (const file of filesToRead) {
      nextPhotos.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name || `foto-${Date.now()}.jpg`,
        mimeType: file.type || 'image/jpeg',
        fileBlob: file,
      });
    }

    setPhotos((prev) => [...prev, ...nextPhotos].slice(0, 3));
    event.target.value = '';
  };

  const handleSubmit = () => {
    if (!selectedAction || !farm) {
      return;
    }
    if (photos.length === 0) {
      setSubmitError('Envie pelo menos uma foto.');
      return;
    }
    if ((selectedAction.id === 'NASCEU' || selectedAction.id === 'MORREU') && !selectedAnimalId) {
      setSubmitError(selectedAction.id === 'NASCEU' ? 'Selecione a mãe.' : 'Selecione o animal.');
      return;
    }

    setSubmitError('');
    setIsSubmitting(true);

    const newReport: PendingReport = {
      localId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      farmId: farm.id,
      type: selectedAction.id,
      description: observations.trim(),
      animalId: selectedAnimalId || null,
      paddockId: selectedPaddockId || null,
      occurredAt: new Date().toISOString(),
      offlineCreatedAt: new Date().toISOString(),
      lat: location.lat,
      lng: location.lng,
      locationLabel: location.label,
      photos,
      remoteOccurrenceId: null,
      uploadedPhotoIds: [],
      syncError: null,
    };

    enqueuePendingReport(newReport);

    setTimeout(() => {
      setLastSyncedAction(selectedAction);
      setIsSubmitting(false);
      setShowSuccess(true);
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }, 400);
  };

  const closeModals = () => {
    setShowDiscardConfirm(false);
    setSelectedAction(null);
    setShowSuccess(false);
    setShowFAQ(false);
    setShowAnimalLookup(false);
    setAnimalSearch('');
    setPhotos([]);
    setObservations('');
    setSelectedPaddockId('');
    setSelectedAnimalId('');
    setSubmitError('');
    setLocation({
      lat: null,
      lng: null,
      label: 'Aguardando localização',
      loading: false,
    });
    setLastSyncedAction(null);
  };

  const hasUnsavedDraft = () => {
    if (showSuccess || showFAQ) {
      return false;
    }
    if (showAnimalLookup) {
      return false;
    }
    if (!selectedAction) {
      return false;
    }
    return Boolean(
      observations.trim()
      || selectedPaddockId
      || selectedAnimalId
      || photos.length > 0,
    );
  };

  const requestCloseModals = () => {
    if (hasUnsavedDraft()) {
      setShowDiscardConfirm(true);
      return;
    }
    closeModals();
  };

  const getAnimalFieldLabel = () => {
    if (selectedAction?.id === 'NASCEU') return 'Mãe (obrigatório)';
    if (selectedAction?.id === 'MORREU') return 'Animal (obrigatório)';
    return 'Animal (opcional)';
  };

  const getObservationPlaceholder = () => {
    switch (selectedAction?.id) {
      case 'NASCEU':
        return 'Informe a identificação da mãe e detalhes do nascimento...';
      case 'AVARIA':
        return 'Informe o local e descreva a avaria...';
      case 'MORREU':
        return 'Descreva o ocorrido e qualquer detalhe importante...';
      case 'DOENTE':
        return 'Descreva os sintomas e a situação observada...';
      case 'COCHO':
        return 'Descreva a situação do cocho...';
      case 'AGUA':
        return 'Descreva a situação da água ou bebedouro...';
      default:
        return 'Descreva o que aconteceu...';
    }
  };

  if (isAuthenticating) {
    return (
      <div className="min-h-screen bg-[var(--eixo-bg)] flex items-center justify-center p-6">
        <div className="bg-[var(--eixo-surface)] border border-[var(--eixo-border)] rounded-[2rem] p-8 shadow-xl flex flex-col items-center gap-4 w-full max-w-sm">
          <LoaderCircle className="w-10 h-10 animate-spin text-[var(--eixo-green)]" />
          <div className="text-center">
            <div className="font-bold text-[var(--eixo-text)]">Conectando ao EIXO</div>
            <div className="text-sm text-[var(--eixo-text-muted)] mt-1">{apiBaseUrl || 'Detectando servidor...'}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    if (!entryMode) {
      return (
        <div className="min-h-screen bg-[var(--eixo-bg)] flex items-center justify-center p-6">
          <div className="w-full max-w-sm bg-[var(--eixo-surface)] border border-[var(--eixo-border)] rounded-[2rem] p-8 shadow-xl">
            <img src="/eixo-logo-render.png" alt="EIXO" className="mb-6 h-12 w-auto" />
            <h1 className="text-3xl font-bold text-[var(--eixo-text)]">EIXO Campo</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--eixo-text-muted)]">
              Escolha como este aparelho será usado.
            </p>

            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={() => setEntryMode('field')}
                className="flex w-full items-center gap-4 rounded-2xl border border-[var(--eixo-green)] bg-[var(--eixo-green)] px-4 py-4 text-left text-white shadow-lg shadow-[rgba(118,184,42,0.18)]"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                  <UserRound className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold">Vaqueiro</span>
                  <span className="mt-0.5 block text-xs leading-5 text-white/80">Entrar com o código enviado pela base.</span>
                </span>
                <ChevronRight className="ml-auto h-5 w-5 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setEntryMode('management')}
                className="flex w-full items-center gap-4 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-4 text-left text-[var(--eixo-text)]"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--eixo-surface)] text-[var(--eixo-graphite-dark)]">
                  <ClipboardList className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-bold">Gerenciamento</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--eixo-text-muted)]">Pesagem e gerenciamento em campo.</span>
                </span>
                <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-[var(--eixo-text-soft)]" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[var(--eixo-bg)] flex items-center justify-center p-6">
        <form
          onSubmit={(event) => handleLogin(event, entryMode, entryMode === 'management' ? 'ADMIN_CAMPO' : undefined)}
          className="w-full max-w-sm bg-[var(--eixo-surface)] border border-[var(--eixo-border)] rounded-[2rem] p-8 shadow-xl"
        >
          <img src="/eixo-logo-render.png" alt="EIXO" className="mb-6 h-12 w-auto" />
          <h1 className="text-2xl font-bold text-[var(--eixo-text)]">
            {entryMode === 'management' ? 'Ativar Gerenciamento' : 'Ativar EIXO Campo'}
          </h1>
          <p className="text-sm text-[var(--eixo-text-muted)] mt-2">
            {entryMode === 'management'
              ? 'Use o e-mail e a senha de Admin de Campo para entrar no gerenciamento.'
              : 'Use o código de ativação entregue pela fazenda para liberar este aparelho. Um novo código só será necessário se a fazenda gerar uma nova ativação.'}
          </p>

          <div className="mt-6 space-y-4">
            {entryMode === 'management' ? (
              <>
                <label className="block">
                  <span className="text-xs font-bold text-[var(--eixo-text-muted)] uppercase tracking-wider">E-mail</span>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    className="mt-2 w-full border border-[var(--eixo-border)] rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                    placeholder="seu@email.com"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-[var(--eixo-text-muted)] uppercase tracking-wider">Senha</span>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    className="mt-2 w-full border border-[var(--eixo-border)] rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                    placeholder="Sua senha"
                    required
                  />
                </label>
              </>
            ) : (
              <label className="block">
                <span className="text-xs font-bold text-[var(--eixo-text-muted)] uppercase tracking-wider">Código de ativação</span>
                <input
                  type="text"
                  value={activationCode}
                  onChange={(event) => setActivationCode(event.target.value.toUpperCase())}
                  className="mt-2 w-full border border-[var(--eixo-border)] rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                  placeholder="Ex.: AB12-CD34-EF56"
                  required
                />
              </label>
            )}
          </div>

          {loginError && (
            <div className="mt-4 bg-[#fff2ef] border border-[#f1d1ca] text-[var(--eixo-danger)] rounded-2xl px-4 py-3 text-sm">
              {loginError}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-bg)] px-4 py-3 text-xs leading-relaxed text-[var(--eixo-text-muted)]">
            Os registros enviados pelo app incluem data, hora, e localização do aparelho assim que houver o registro para controle operacional da fazenda.
          </div>

          <div className="mt-4 text-xs text-[var(--eixo-text-muted)] break-all">API detectada: {apiBaseUrl || getApiBaseUrl()}</div>

          <button type="submit" disabled={isLoggingIn} className="mt-6 w-full py-4 bg-[var(--eixo-green)] text-white rounded-2xl font-bold hover:bg-[var(--eixo-green-dark)] disabled:opacity-70">
            {isLoggingIn ? 'Entrando...' : (entryMode === 'management' ? 'ENTRAR NO GERENCIAMENTO' : 'ATIVAR APP')}
          </button>
          <button
            type="button"
            onClick={() => setEntryMode(null)}
            className="mt-3 w-full rounded-2xl bg-[var(--eixo-surface-soft)] py-3 text-sm font-bold text-[var(--eixo-text-muted)]"
          >
            VOLTAR
          </button>
        </form>
      </div>
    );
  }

  const modalVisible = Boolean(selectedAction || showSuccess || showFAQ || showAnimalLookup);

  if (authMode === 'management' && farm) {
    return (
      <ManagementScreen
        user={currentUser}
        farm={farm}
        animals={animals}
        isOnline={isOnline}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--eixo-bg)] flex items-center justify-center p-4 font-sans text-[var(--eixo-text)]">
      <div className="relative w-full max-w-[400px] h-[800px] bg-[var(--eixo-graphite)] rounded-[3rem] p-3 shadow-2xl border-4 border-[var(--eixo-graphite)] overflow-hidden">
        <div className="relative w-full h-full bg-[var(--eixo-surface)] rounded-[2.2rem] overflow-hidden flex flex-col">
          <div className="bg-[var(--eixo-graphite-dark)] text-white px-6 pt-10 pb-2 flex justify-between items-center text-xs font-semibold">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-end gap-0.5 h-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-0.5 bg-[var(--eixo-green)] rounded-full" style={{ height: `${i * 25}%` }} />
                ))}
              </div>
              <span className="truncate">{farm?.name || 'Fazenda vinculada'}</span>
            </div>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${isOnline ? 'bg-[var(--eixo-green)]' : 'bg-[var(--eixo-warning)]'}`}>
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="uppercase tracking-wider text-[10px]">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          <div className="bg-[var(--eixo-graphite-dark)] text-white p-6 shadow-lg relative">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-2xl bg-white/95 px-3 py-2 shadow-[var(--eixo-shadow-soft)]">
                  <img src="/eixo-logo-render.png" alt="EIXO" className="h-6 w-auto" />
                </div>
                <div className="w-px h-6 bg-[var(--eixo-surface)]/20 mx-1" />
                <h1 className="text-xl font-bold tracking-tight">EIXO Campo</h1>
              </div>
              {currentProfile === 'ADMIN_CAMPO' && (
                <button onClick={handleLogout} className="p-2 rounded-full bg-[var(--eixo-surface)]/10 border border-white/10">
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-white/72 text-sm min-w-0 truncate">{currentUser.name}</p>
              <div className="shrink-0 rounded-full bg-[var(--eixo-green-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--eixo-green)]">
                {currentProfile === 'ADMIN_CAMPO' ? 'Admin de Campo' : 'Vaqueiro'}
              </div>
            </div>

            {(isSyncing || pendingReports.length > 0) && (
              <div className="absolute right-6 bottom-6 flex items-center gap-2 bg-[var(--eixo-surface)]/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                {isSyncing ? <RefreshCw className="w-3 h-3 text-white animate-spin" /> : <Cloud className="w-3 h-3 text-white" />}
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {isSyncing ? 'Sincronizando...' : `${pendingReports.length} pendente(s)`}
                </span>
              </div>
            )}
          </div>

          {screenError && (
            <div className="mx-5 mt-5 bg-[#fff2ef] border border-[#f1d1ca] text-[var(--eixo-danger)] rounded-2xl px-4 py-3 text-sm">
              {screenError}
            </div>
          )}

          <div className="flex-1 px-5 pt-2 pb-20 grid grid-cols-2 gap-2 auto-rows-[122px] overflow-y-auto">
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                onClick={() => handleActionClick(action)}
                className="bg-[var(--eixo-surface)] border border-[var(--eixo-border)] rounded-3xl px-3.5 py-3.5 flex flex-col items-center justify-between text-center shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
              >
                <div
                  className={`absolute top-3 right-3 w-4 h-4 rounded-full ${
                    action.urgency === 'high'
                      ? 'bg-[var(--eixo-danger)] animate-pulse'
                      : action.urgency === 'medium'
                        ? 'bg-[var(--eixo-warning)]'
                        : 'bg-[var(--eixo-green)]'
                  }`}
                />
                <div className="w-14 h-14 min-w-[56px] min-h-[56px] bg-[var(--eixo-surface-soft)] rounded-2xl flex items-center justify-center group-hover:bg-[var(--eixo-surface-soft)] transition-colors">
                  {action.icon}
                </div>
                <div className="min-h-[32px] flex flex-col items-center justify-start">
                  <div className="font-bold text-[var(--eixo-text)] tracking-tight leading-none">{action.label}</div>
                  {action.subtitle && <div className="mt-1 text-[9px] leading-tight text-[var(--eixo-text-soft)] uppercase font-bold tracking-[0.14em]">{action.subtitle}</div>}
                </div>
              </button>
            ))}

            <button
              onClick={() => setShowAnimalLookup(true)}
              className="col-span-2 bg-[var(--eixo-surface)] border border-[var(--eixo-border)] rounded-3xl px-4 py-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-12 h-12 rounded-2xl bg-[var(--eixo-surface-soft)] flex items-center justify-center text-[var(--eixo-green)]">
                <Search className="w-7 h-7" />
              </div>
              <div className="text-left">
                <div className="font-bold text-[var(--eixo-text)] tracking-tight leading-none">CONSULTAR ANIMAL</div>
                <div className="text-[9px] text-[var(--eixo-text-soft)] uppercase font-bold tracking-[0.14em] mt-1">Confirmar no pasto</div>
              </div>
            </button>
          </div>

          <button className="absolute bottom-6 right-6 w-14 h-14 bg-[var(--eixo-graphite-dark)] text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform z-10" onClick={() => setShowFAQ(true)}>
            <HelpCircle className="w-7 h-7" />
          </button>
        </div>

        {modalVisible && (
          <div className="absolute inset-0 z-50 flex items-end justify-center bg-[var(--eixo-graphite)]/60 p-3">
            <div className={`w-full bg-[var(--eixo-surface)] rounded-[2.5rem] shadow-2xl max-h-[90%] ${selectedAction ? 'overflow-hidden p-5 pb-6' : 'overflow-y-auto p-8 pb-12'}`}>
              {showFAQ ? (
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-[var(--eixo-text)]">Perguntas Frequentes</h2>
                      <p className="text-sm text-[var(--eixo-text-muted)]">Ajuda do app de manejo</p>
                    </div>
                    <button onClick={requestCloseModals} className="rounded-full bg-[var(--eixo-surface-soft)] px-4 py-2 text-sm font-bold text-[var(--eixo-text-muted)]">
                      Voltar
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-[var(--eixo-surface-soft)] p-4 rounded-2xl border border-[var(--eixo-border)]">
                      <h3 className="font-bold text-[var(--eixo-text)] text-sm mb-1">Como funciona sem internet?</h3>
                      <p className="text-sm text-[var(--eixo-text-muted)]">O registro fica salvo no aparelho e tenta sincronizar quando a internet volta.</p>
                    </div>
                    <div className="bg-[var(--eixo-surface-soft)] p-4 rounded-2xl border border-[var(--eixo-border)]">
                      <h3 className="font-bold text-[var(--eixo-text)] text-sm mb-1">Nasceu e Morreu fazem baixa automática?</h3>
                      <p className="text-sm text-[var(--eixo-text-muted)]">Não. Na primeira versão, esses dois tipos entram como aviso para revisão do gestor.</p>
                    </div>
                    <div className="bg-[var(--eixo-surface-soft)] p-4 rounded-2xl border border-[var(--eixo-border)]">
                      <h3 className="font-bold text-[var(--eixo-text)] text-sm mb-1">Quantas fotos posso enviar?</h3>
                      <p className="text-sm text-[var(--eixo-text-muted)]">Até 3 fotos por ocorrência.</p>
                    </div>
                    <div className="bg-[var(--eixo-surface-soft)] p-4 rounded-2xl border border-[var(--eixo-border)]">
                      <h3 className="font-bold text-[var(--eixo-text)] text-sm mb-1">O app registra localização?</h3>
                      <p className="text-sm text-[var(--eixo-text-muted)]">Para auditoria e rastreabilidade operacional, os registros feitos no app incluem data, hora, e localização do aparelho no momento do envio ou do registro.</p>
                    </div>
                  </div>

                  <button onClick={closeModals} className="mt-6 w-full py-4 bg-[var(--eixo-graphite-dark)] text-white rounded-2xl font-bold hover:bg-[var(--eixo-graphite)] transition-colors">
                    ENTENDIDO
                  </button>
                </div>
              ) : showSuccess ? (
                <div className="text-center py-8">
                  <div className="w-24 h-24 bg-[var(--eixo-green-soft)] text-[var(--eixo-green)] rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-14 h-14" />
                  </div>
                  <h2 className="text-2xl font-bold text-[var(--eixo-text)]">Registro guardado</h2>
                  <div className="mt-6 p-4 bg-[var(--eixo-surface-soft)] rounded-2xl text-left border border-[var(--eixo-border)]">
                    <div className="text-[10px] font-bold text-[var(--eixo-text-soft)] uppercase tracking-widest mb-3">Resumo</div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-[var(--eixo-surface)] rounded-xl flex items-center justify-center border border-[var(--eixo-border)] shadow-sm">
                        {currentActionSummary?.icon}
                      </div>
                      <div>
                        <div className="font-bold text-[var(--eixo-text)] leading-none">{currentActionSummary?.label}</div>
                        <div className="text-[10px] text-[var(--eixo-text-soft)] font-bold mt-1 uppercase">
                          {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
                        </div>
                      </div>
                    </div>
                    {observations && <div className="text-sm text-[var(--eixo-text-muted)] italic bg-[var(--eixo-surface)] p-3 rounded-xl border border-[var(--eixo-border)]">"{observations}"</div>}
                  </div>
                  <p className="mt-4 text-[var(--eixo-text-muted)]">{isOnline ? 'O sistema vai sincronizar agora.' : 'Sem sinal. O envio ficará pendente.'}</p>
                  <button onClick={closeModals} className="mt-10 w-full py-4 bg-[var(--eixo-graphite-dark)] text-white rounded-2xl font-bold hover:bg-[var(--eixo-graphite)] transition-colors">
                    ENTENDIDO
                  </button>
                </div>
              ) : showAnimalLookup ? (
                <div className="flex flex-col h-full">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-[var(--eixo-text)]">Consultar Animal</h2>
                      <p className="text-sm text-[var(--eixo-text-muted)]">Consulte o rebanho da fazenda para confirmar o animal no pasto.</p>
                    </div>
                    <button onClick={requestCloseModals} className="rounded-full bg-[var(--eixo-surface-soft)] px-4 py-2 text-sm font-bold text-[var(--eixo-text-muted)]">
                      Voltar
                    </button>
                  </div>

                  <label className="block">
                    <span className="text-xs font-bold text-[var(--eixo-text-soft)] uppercase tracking-widest">Buscar por brinco, identificação ou nome</span>
                    <div className="mt-2 relative">
                      <Search className="w-4 h-4 text-[var(--eixo-text-soft)] absolute left-4 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={animalSearch}
                        onChange={(event) => setAnimalSearch(event.target.value)}
                        placeholder="Ex.: 1458, FIV 22, Matriz 08"
                        className="w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                      />
                    </div>
                  </label>

                  <div className="mt-5 space-y-3 overflow-y-auto">
                    {filteredAnimals.length > 0 ? (
                      filteredAnimals.map((animal) => (
                        <div key={animal.id} className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-4">
                          <div className="font-bold text-[var(--eixo-text)]">{buildAnimalLabel(animal)}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--eixo-text-muted)]">
                            {animal.brinco && <span className="rounded-full bg-[var(--eixo-surface)] px-3 py-1 border border-[var(--eixo-border)]">Brinco: {animal.brinco}</span>}
                            {animal.identificacao && <span className="rounded-full bg-[var(--eixo-surface)] px-3 py-1 border border-[var(--eixo-border)]">Identificação: {animal.identificacao}</span>}
                            {animal.name && <span className="rounded-full bg-[var(--eixo-surface)] px-3 py-1 border border-[var(--eixo-border)]">Nome: {animal.name}</span>}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-6 text-sm text-[var(--eixo-text-muted)]">
                        Nenhum animal encontrado para essa busca.
                      </div>
                    )}
                  </div>

                  <button onClick={closeModals} className="mt-6 w-full py-4 bg-[var(--eixo-graphite-dark)] text-white rounded-2xl font-bold hover:bg-[var(--eixo-graphite)] transition-colors">
                    VOLTAR
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--eixo-surface-soft)]">{selectedAction?.icon}</div>
                      <div>
                        <h2 className="whitespace-nowrap text-lg font-bold text-[var(--eixo-text)]">{selectedAction?.label}</h2>
                        <p className="whitespace-nowrap text-xs text-[var(--eixo-text-muted)]">{selectedAction?.subtitle}</p>
                      </div>
                    </div>
                    <button onClick={requestCloseModals} className="shrink-0 rounded-full bg-[var(--eixo-surface-soft)] px-4 py-2 text-sm font-bold text-[var(--eixo-text-muted)]">
                      Voltar
                    </button>
                  </div>

                  <div className="mb-4 flex flex-col gap-2.5">
                    <label className="block">
                      <span className="text-xs font-bold text-[var(--eixo-text-soft)] uppercase tracking-widest">Pasto (opcional)</span>
                      <select value={selectedPaddockId} onChange={(event) => setSelectedPaddockId(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--eixo-green)]">
                        <option value="">Selecione um pasto</option>
                        {paddocks.map((paddock) => (
                          <option key={paddock.id} value={paddock.id}>{paddock.name}</option>
                        ))}
                      </select>
                    </label>

                    {selectedAction?.id !== 'COCHO' && selectedAction?.id !== 'AGUA' && selectedAction?.id !== 'AVARIA' && (
                      <label className="block">
                        <span className="text-xs font-bold text-[var(--eixo-text-soft)] uppercase tracking-widest">{getAnimalFieldLabel()}</span>
                        <select value={selectedAnimalId} onChange={(event) => setSelectedAnimalId(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--eixo-green)]">
                          <option value="">{selectedAction?.id === 'NASCEU' ? 'Selecione a mãe' : 'Selecione um animal'}</option>
                          {animals.map((animal) => (
                            <option key={animal.id} value={animal.id}>{buildAnimalLabel(animal)}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="block text-xs font-bold text-[var(--eixo-text-soft)] uppercase tracking-widest">Observações</label>
                        <span className="text-[10px] font-bold text-[var(--eixo-text-soft)]">{observations.length}/500</span>
                      </div>
                      <textarea
                        value={observations}
                        onChange={(event) => setObservations(event.target.value.slice(0, 500))}
                        placeholder={getObservationPlaceholder()}
                        className="min-h-[84px] w-full resize-none rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--eixo-green)]"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[var(--eixo-text-soft)]">Fotos</label>
                      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" multiple onChange={handleSelectPhotos} />
                      <button onClick={() => fileInputRef.current?.click()} disabled={photos.length >= 3} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--eixo-graphite-dark)] py-3.5 text-sm font-bold whitespace-nowrap text-white transition-all hover:bg-[var(--eixo-graphite)] disabled:bg-[var(--eixo-border)] disabled:text-[var(--eixo-text-soft)]">
                        <Camera className="h-5 w-5" />
                        <span>{photos.length === 0 ? 'Adicionar foto' : `Adicionar foto (${photos.length}/3)`}</span>
                      </button>

                      <div className="mt-3 grid grid-cols-3 gap-2.5">
                        {[0, 1, 2].map((index) => (
                          <div key={index} className={`aspect-square rounded-xl border-2 border-dashed flex items-center justify-center transition-all ${
                            photos[index]
                              ? 'bg-[var(--eixo-green-soft)] border-[var(--eixo-border-strong)] text-[var(--eixo-green)]'
                              : 'bg-[var(--eixo-surface-soft)] border-[var(--eixo-border)] text-[var(--eixo-text-soft)]'
                          }`}>
                            {photos[index] ? <CheckCircle2 className="w-8 h-8" /> : <Camera className="w-6 h-6" />}
                          </div>
                        ))}
                      </div>
                    </div>

                    {submitError && (
                      <div className="rounded-2xl border border-[#f1d1ca] bg-[#fff2ef] px-4 py-3 text-sm font-semibold text-[var(--eixo-danger)]">
                        {submitError}
                      </div>
                    )}

                    <div className="flex gap-3 pt-1">
                      <button onClick={requestCloseModals} className="flex-1 rounded-2xl bg-[var(--eixo-surface-soft)] py-3.5 text-sm font-bold whitespace-nowrap text-[var(--eixo-text-muted)]">CANCELAR</button>
                      <button
                        disabled={photos.length === 0 || isSubmitting}
                        onClick={handleSubmit}
                        className="flex-[2] rounded-2xl bg-[var(--eixo-green)] py-3.5 text-sm font-bold whitespace-nowrap text-white shadow-lg shadow-[rgba(118,184,42,0.24)] transition-all hover:bg-[var(--eixo-green-dark)] disabled:bg-[var(--eixo-border)] disabled:shadow-none flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>ENVIAR RELATÓRIO <ChevronRight className="w-5 h-5" /></>}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-[var(--eixo-graphite)]/70 p-5">
            <div className="w-full rounded-[2rem] bg-[var(--eixo-surface)] p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-[var(--eixo-text)]">Sair sem salvar?</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--eixo-text-muted)]">
                As informações preenchidas nesta tela serão descartadas.
              </p>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="flex-1 rounded-2xl bg-[var(--eixo-surface-soft)] py-4 font-bold text-[var(--eixo-text-muted)]"
                >
                  Continuar editando
                </button>
                <button
                  type="button"
                  onClick={closeModals}
                  className="flex-1 rounded-2xl bg-[var(--eixo-danger)] py-4 font-bold text-white"
                >
                  Sair sem salvar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
