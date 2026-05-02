import {
  AlertOctagon,
  CirclePlus,
  Droplets,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import type { ActionConfig, Animal } from './types';

export const ACTIONS: ActionConfig[] = [
  {
    id: 'COCHO',
    icon: (
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <polygon points="22,3 2,17 42,17" fill="#76b82a" />
        <polygon points="22,3 2,17 42,17" fill="none" stroke="#3f4141" strokeWidth="1" />
        <line x1="12" y1="10" x2="22" y2="3" stroke="#3f4141" strokeWidth="0.8" opacity="0.6" />
        <line x1="22" y1="10" x2="22" y2="3" stroke="#3f4141" strokeWidth="0.8" opacity="0.6" />
        <line x1="32" y1="10" x2="22" y2="3" stroke="#3f4141" strokeWidth="0.8" opacity="0.6" />
        <line x1="2" y1="17" x2="42" y2="17" stroke="#3f4141" strokeWidth="0.8" opacity="0.6" />
        <rect x="8" y="17" width="3.5" height="19" rx="1" fill="#3f4141" />
        <rect x="32.5" y="17" width="3.5" height="19" rx="1" fill="#3f4141" />
        <path d="M6 30 Q6 38 10 38 L34 38 Q38 38 38 30 Z" fill="#5f9f1f" stroke="#3f4141" strokeWidth="1" />
        <ellipse cx="22" cy="31" rx="11" ry="3" fill="#edf7e6" opacity="0.85" />
      </svg>
    ),
    label: 'COCHO',
    subtitle: 'Ração e sal',
    urgency: 'low',
  },
  {
    id: 'AGUA',
    icon: <Droplets className="h-10 w-10 text-[#3f6f8f]" />,
    label: 'ÁGUA',
    subtitle: 'Bebedouros',
    urgency: 'medium',
  },
  {
    id: 'NASCEU',
    icon: (
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf7e6]">
        <CirclePlus className="h-10 w-10 text-[#76b82a]" strokeWidth={2.2} />
        <div className="absolute -right-0.5 -top-0.5 rounded-full border-2 border-white bg-[#3f4141] p-1">
          <CirclePlus className="h-3 w-3 text-white" strokeWidth={2.8} />
        </div>
      </div>
    ),
    label: 'NASCEU',
    subtitle: 'Novo bezerro',
    urgency: 'low',
  },
  {
    id: 'MORREU',
    icon: <AlertOctagon className="h-10 w-10 text-[#3f4141]" />,
    label: 'MORREU',
    subtitle: 'Aviso de campo',
    urgency: 'high',
  },
  {
    id: 'DOENTE',
    icon: <Stethoscope className="h-10 w-10 text-[#b84232]" />,
    label: 'DOENTE',
    subtitle: 'Animal com atenção',
    urgency: 'high',
  },
  {
    id: 'AVARIA',
    icon: <Wrench className="h-10 w-10 text-[#c58a20]" />,
    label: 'AVARIA',
    subtitle: 'Cerca ou porteira',
    urgency: 'medium',
  },
];

export const buildAnimalLabel = (animal: Animal) => {
  return animal.brinco || animal.identificacao || animal.name || animal.nome || animal.registro || 'Animal sem identificação';
};
