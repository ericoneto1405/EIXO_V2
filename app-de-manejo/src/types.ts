import type React from 'react';
import type { FieldOccurrenceType } from './offlineStorage';

export type Urgency = 'low' | 'medium' | 'high';

export interface ActionConfig {
  id: FieldOccurrenceType;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  urgency: Urgency;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  fieldProfile?: 'VAQUEIRO' | 'ADMIN_CAMPO' | null;
  allowedFarmIds?: string[];
  defaultFarmId?: string | null;
  appContext?: {
    profile?: string;
    mode?: string;
  };
}

export interface Farm {
  id: string;
  name: string;
}

export interface Paddock {
  id: string;
  name: string;
}

export interface Animal {
  id: string;
  brinco?: string | null;
  identificacao?: string | null;
  name?: string | null;
  nome?: string | null;
  registro?: string | null;
  animalType?: 'comercial' | 'po';
}

export type WeighingStatus = 'pendente' | 'enviado' | 'erro' | 'conflito';

export interface PendingWeighing {
  localId: string;
  animalId: string;
  animalLabel: string;
  animalType: 'comercial' | 'po';
  farmId: string;
  data: string;
  peso: number;
  status: WeighingStatus;
  syncError: string | null;
  createdAt: string;
  forceReplace?: boolean;
}
