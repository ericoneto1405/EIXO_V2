import { buildApiUrl } from '../api';
import type {
  AppActivationCodePayload,
  FieldCollaboratorCreatePayload,
  FieldCollaboratorUpdatePayload,
  ManagedUser,
  WebUserCreatePayload,
  WebUserUpdatePayload,
} from '../types';

const readJson = async (response: Response) => response.json().catch(() => ({}));

export const listUsers = async (): Promise<ManagedUser[]> => {
  const response = await fetch(buildApiUrl('/users'), {
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || 'Erro ao carregar usuários.');
  }
  return payload.users || [];
};

export const createWebUser = async (payload: WebUserCreatePayload): Promise<ManagedUser> => {
  const response = await fetch(buildApiUrl('/users'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      ...payload,
      accessType: 'WEB',
      fieldProfile: null,
    }),
  });
  const responsePayload = await readJson(response);
  if (!response.ok) {
    const error = new Error(responsePayload?.message || 'Erro ao cadastrar usuário.');
    (error as Error & { code?: string }).code = responsePayload?.code;
    throw error;
  }
  return responsePayload.user;
};

export const createFieldCollaborator = async (payload: FieldCollaboratorCreatePayload): Promise<ManagedUser> => {
  const response = await fetch(buildApiUrl('/users'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      name: payload.name,
      modules: ['Rebanho Comercial'],
      accessType: 'APP_MANEJO',
      fieldProfile: payload.fieldProfile,
      defaultFarmId: payload.defaultFarmId,
    }),
  });
  const responsePayload = await readJson(response);
  if (!response.ok) {
    const error = new Error(responsePayload?.message || 'Erro ao cadastrar colaborador.');
    (error as Error & { code?: string }).code = responsePayload?.code;
    throw error;
  }
  return responsePayload.user;
};

export const generateAppActivationCode = async (userId: string): Promise<AppActivationCodePayload> => {
  const response = await fetch(buildApiUrl(`/users/${userId}/app-code`), {
    method: 'POST',
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || 'Erro ao gerar código.');
  }
  return payload;
};

export const revokeAppDevice = async (userId: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/users/${userId}/revoke-device`), {
    method: 'POST',
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || 'Erro ao revogar aparelho.');
  }
};

export const updateFieldCollaborator = async (
  userId: string,
  payload: FieldCollaboratorUpdatePayload,
): Promise<ManagedUser> => {
  const response = await fetch(buildApiUrl(`/users/${userId}/app-access`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const responsePayload = await readJson(response);
  if (!response.ok) {
    throw new Error(responsePayload?.message || 'Erro ao atualizar colaborador.');
  }
  return responsePayload.user;
};

export const updateUser = async (userId: string, payload: WebUserUpdatePayload): Promise<ManagedUser> => {
  const response = await fetch(buildApiUrl(`/users/${userId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const responsePayload = await readJson(response);
  if (!response.ok) {
    throw new Error(responsePayload?.message || 'Erro ao atualizar usuário.');
  }
  return responsePayload.user;
};

export const deleteUser = async (userId: string): Promise<void> => {
  const response = await fetch(buildApiUrl(`/users/${userId}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(payload?.message || 'Erro ao excluir usuário.');
  }
};
