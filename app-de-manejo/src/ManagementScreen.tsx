import React, { useMemo, useState } from 'react';
import { ClipboardList, LogOut, RefreshCw, Search, Scale, Wifi, WifiOff } from 'lucide-react';
import { buildAnimalLabel } from './actions';
import { useSyncWeighings } from './hooks/useSyncWeighings';
import type { Animal, AuthUser, Farm, PendingWeighing } from './types';

interface ManagementScreenProps {
  user: AuthUser;
  farm: Farm;
  animals: Animal[];
  isOnline: boolean;
  onLogout: () => void;
}

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const formatWeight = (value: number) => {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kg`;
};

const formatDate = (value: string) => {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
};

const statusClasses: Record<PendingWeighing['status'], string> = {
  pendente: 'bg-[var(--eixo-surface-soft)] text-[var(--eixo-text-muted)] border-[var(--eixo-border)]',
  enviado: 'bg-[var(--eixo-green-soft)] text-[var(--eixo-green-dark)] border-[var(--eixo-green-soft)]',
  erro: 'bg-[#fff2ef] text-[var(--eixo-danger)] border-[#f1d1ca]',
  conflito: 'bg-[#fff8e6] text-[#9a6a00] border-[#f2d48a]',
};

const statusLabel: Record<PendingWeighing['status'], string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  erro: 'Erro',
  conflito: 'Conflito - ja existe no servidor',
};

export default function ManagementScreen({ user, farm, animals, isOnline, onLogout }: ManagementScreenProps) {
  const [animalSearch, setAnimalSearch] = useState('');
  const [selectedAnimal, setSelectedAnimal] = useState<Animal | null>(null);
  const [weighingDate, setWeighingDate] = useState(todayInputValue());
  const [weightValue, setWeightValue] = useState('');
  const [formError, setFormError] = useState('');
  const [localConflict, setLocalConflict] = useState<{
    existing: PendingWeighing;
    next: Omit<PendingWeighing, 'localId' | 'status' | 'syncError' | 'createdAt'>;
    sameWeight: boolean;
  } | null>(null);
  const [serverConflict, setServerConflict] = useState<PendingWeighing | null>(null);

  const {
    enqueueWeighing,
    isSyncing,
    markForceReplace,
    pendingWeighings,
    removeWeighing,
    syncNow,
  } = useSyncWeighings({ shouldSync: isOnline });

  const filteredAnimals = useMemo(() => {
    const query = animalSearch.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return animals
      .filter((animal) => {
        const label = [
          buildAnimalLabel(animal),
          animal.brinco,
          animal.identificacao,
          animal.name,
          animal.nome,
          animal.registro,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return label.includes(query);
      })
      .slice(0, 10);
  }, [animalSearch, animals]);

  const pendingCount = pendingWeighings.filter((item) => item.status === 'pendente' || item.status === 'erro').length;

  const resetFormForNextAnimal = () => {
    setAnimalSearch('');
    setSelectedAnimal(null);
    setWeightValue('');
    setFormError('');
  };

  const addWeighing = (payload: Omit<PendingWeighing, 'localId' | 'status' | 'syncError' | 'createdAt'>) => {
    enqueueWeighing(payload);
    resetFormForNextAnimal();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    if (!selectedAnimal) {
      setFormError('Selecione um animal.');
      return;
    }
    if (!weighingDate) {
      setFormError('Informe a data.');
      return;
    }

    const parsedWeight = Number(String(weightValue).replace(',', '.'));
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0 || parsedWeight > 9999) {
      setFormError('Informe um peso valido.');
      return;
    }

    const nextWeighing = {
      animalId: selectedAnimal.id,
      animalLabel: buildAnimalLabel(selectedAnimal),
      animalType: selectedAnimal.animalType ?? 'comercial',
      farmId: farm.id,
      data: weighingDate,
      peso: parsedWeight,
    };

    const existing = pendingWeighings.find((item) => item.animalId === selectedAnimal.id);
    if (existing) {
      setLocalConflict({
        existing,
        next: nextWeighing,
        sameWeight: Number(existing.peso) === Number(parsedWeight),
      });
      return;
    }

    addWeighing(nextWeighing);
  };

  const selectAnimal = (animal: Animal) => {
    setSelectedAnimal(animal);
    setAnimalSearch(buildAnimalLabel(animal));
    setFormError('');
  };

  return (
    <div className="min-h-screen bg-[var(--eixo-bg)] flex items-center justify-center p-4 font-sans text-[var(--eixo-text)]">
      <div className="relative w-full max-w-[400px] h-[800px] bg-[var(--eixo-graphite)] rounded-[3rem] p-3 shadow-2xl border-4 border-[var(--eixo-graphite)] overflow-hidden">
        <div className="relative w-full h-full bg-[var(--eixo-surface)] rounded-[2.2rem] overflow-hidden flex flex-col">
          <div className="bg-[var(--eixo-graphite-dark)] text-white px-6 pt-10 pb-2 flex justify-between items-center text-xs font-semibold">
            <div className="flex items-center gap-2 min-w-0">
              <Scale className="h-4 w-4 text-[var(--eixo-green)]" />
              <span className="truncate">{farm.name}</span>
            </div>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${isOnline ? 'bg-[var(--eixo-green)]' : 'bg-[var(--eixo-warning)]'}`}>
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="uppercase tracking-wider text-[10px]">{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          <div className="bg-[var(--eixo-graphite-dark)] text-white p-6 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="rounded-2xl bg-white/95 px-3 py-2 shadow-[var(--eixo-shadow-soft)]">
                  <img src="/eixo-logo-render.png" alt="EIXO" className="h-6 w-auto" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">EIXO Campo</h1>
                  <p className="mt-1 text-xs text-white/70">Gerenciamento</p>
                </div>
              </div>
              <button type="button" onClick={onLogout} className="p-2 rounded-full bg-[var(--eixo-surface)]/10 border border-white/10">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-white/72 text-sm min-w-0 truncate">{user.name}</p>
              <div className="shrink-0 rounded-full bg-[var(--eixo-green-soft)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--eixo-green)]">
                Admin de Campo
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            <form onSubmit={handleSubmit} className="rounded-[2rem] border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] p-4">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[var(--eixo-green)]" />
                <h2 className="font-bold text-[var(--eixo-text)]">Pesagem manual</h2>
              </div>

              <label className="block">
                <span className="text-xs font-bold text-[var(--eixo-text-soft)] uppercase tracking-widest">Buscar animal</span>
                <div className="relative mt-2">
                  <Search className="w-4 h-4 text-[var(--eixo-text-soft)] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={animalSearch}
                    onChange={(event) => {
                      setAnimalSearch(event.target.value);
                      setSelectedAnimal(null);
                    }}
                    placeholder="Brinco, identificacao ou nome"
                    className="w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] py-3 pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                  />
                </div>
              </label>

              {filteredAnimals.length > 0 && !selectedAnimal && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)]">
                  {filteredAnimals.map((animal) => (
                    <button
                      key={`${animal.animalType || 'comercial'}-${animal.id}`}
                      type="button"
                      onClick={() => selectAnimal(animal)}
                      className="block w-full border-b border-[var(--eixo-border)] px-4 py-3 text-left last:border-b-0"
                    >
                      <span className="block text-sm font-bold text-[var(--eixo-text)]">{buildAnimalLabel(animal)}</span>
                      <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--eixo-text-soft)]">
                        {animal.animalType === 'po' ? 'Plantel P.O.' : 'Rebanho'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-bold text-[var(--eixo-text-soft)] uppercase tracking-widest">Data</span>
                  <input
                    type="date"
                    value={weighingDate}
                    onChange={(event) => setWeighingDate(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-[var(--eixo-text-soft)] uppercase tracking-widest">Peso kg</span>
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    step="0.1"
                    value={weightValue}
                    onChange={(event) => setWeightValue(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-[var(--eixo-green)]"
                    required
                  />
                </label>
              </div>

              {formError && (
                <div className="mt-4 rounded-2xl border border-[#f1d1ca] bg-[#fff2ef] px-4 py-3 text-sm font-semibold text-[var(--eixo-danger)]">
                  {formError}
                </div>
              )}

              <button type="submit" className="mt-5 w-full rounded-2xl bg-[var(--eixo-green)] py-4 font-bold text-white shadow-lg shadow-[rgba(118,184,42,0.24)] hover:bg-[var(--eixo-green-dark)]">
                PESAR
              </button>
            </form>

            <div className="sticky top-0 z-10 mt-5 rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface)] p-3 shadow-sm">
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={!isOnline || isSyncing || pendingCount === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--eixo-graphite-dark)] py-3 text-sm font-bold text-white disabled:bg-[var(--eixo-border)] disabled:text-[var(--eixo-text-soft)]"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Sincronizando...' : `Sincronizar agora (${pendingCount})`}
              </button>
            </div>

            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold text-[var(--eixo-text)]">Pesagens desta sessão</h2>
                <span className="rounded-full bg-[var(--eixo-surface-soft)] px-3 py-1 text-xs font-bold text-[var(--eixo-text-muted)]">
                  {pendingWeighings.length}
                </span>
              </div>

              <div className="space-y-3 pb-8">
                {pendingWeighings.length === 0 ? (
                  <div className="rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-6 text-sm text-[var(--eixo-text-muted)]">
                    Nenhuma pesagem lancada neste aparelho.
                  </div>
                ) : (
                  pendingWeighings.map((weighing) => (
                    <button
                      key={weighing.localId}
                      type="button"
                      onClick={() => {
                        if (weighing.status === 'conflito') {
                          setServerConflict(weighing);
                        }
                      }}
                      className="w-full rounded-2xl border border-[var(--eixo-border)] bg-[var(--eixo-surface-soft)] px-4 py-4 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-[var(--eixo-text)]">{weighing.animalLabel}</div>
                          <div className="mt-1 text-sm text-[var(--eixo-text-muted)]">
                            {formatDate(weighing.data)} · {formatWeight(weighing.peso)}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusClasses[weighing.status]}`}>
                          {statusLabel[weighing.status]}
                        </span>
                      </div>
                      {weighing.syncError && (
                        <div className="mt-2 text-xs leading-5 text-[var(--eixo-text-muted)]">{weighing.syncError}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {localConflict && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--eixo-graphite)]/70 p-5">
              <div className="w-full rounded-[2rem] bg-[var(--eixo-surface)] p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-[var(--eixo-text)]">Atenção na pesagem</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--eixo-text-muted)]">
                  Já existe uma pesagem deste animal nesta sessão: {formatDate(localConflict.existing.data)} · {formatWeight(localConflict.existing.peso)}.
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--eixo-text-muted)]">
                  Nova pesagem: {formatDate(localConflict.next.data)} · {formatWeight(localConflict.next.peso)}.
                </p>
                {localConflict.sameWeight ? (
                  <div className="mt-6 grid gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        removeWeighing(localConflict.existing.localId);
                        setLocalConflict(null);
                        resetFormForNextAnimal();
                      }}
                      className="rounded-2xl bg-[var(--eixo-danger)] py-4 font-bold text-white"
                    >
                      Cancelar as duas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLocalConflict(null);
                        resetFormForNextAnimal();
                      }}
                      className="rounded-2xl bg-[var(--eixo-graphite-dark)] py-4 font-bold text-white"
                    >
                      Manter uma
                    </button>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        removeWeighing(localConflict.existing.localId);
                        addWeighing(localConflict.next);
                        setLocalConflict(null);
                      }}
                      className="rounded-2xl bg-[var(--eixo-green)] py-4 font-bold text-white"
                    >
                      Substituir
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocalConflict(null)}
                      className="rounded-2xl bg-[var(--eixo-surface-soft)] py-4 font-bold text-[var(--eixo-text-muted)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWeightValue('');
                        setLocalConflict(null);
                      }}
                      className="rounded-2xl bg-[var(--eixo-graphite-dark)] py-4 font-bold text-white"
                    >
                      Pesar novamente
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {serverConflict && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--eixo-graphite)]/70 p-5">
              <div className="w-full rounded-[2rem] bg-[var(--eixo-surface)] p-6 shadow-2xl">
                <h2 className="text-xl font-bold text-[var(--eixo-text)]">Conflito no servidor</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--eixo-text-muted)]">
                  Já existe uma pesagem para {serverConflict.animalLabel} em {formatDate(serverConflict.data)}.
                </p>
                <div className="mt-6 grid gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      markForceReplace(serverConflict.localId);
                      setServerConflict(null);
                    }}
                    className="rounded-2xl bg-[var(--eixo-green)] py-4 font-bold text-white"
                  >
                    Substituir no servidor
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      removeWeighing(serverConflict.localId);
                      setServerConflict(null);
                    }}
                    className="rounded-2xl bg-[var(--eixo-surface-soft)] py-4 font-bold text-[var(--eixo-text-muted)]"
                  >
                    Manter o que esta no servidor
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
