import { useEffect, useState, type FormEvent } from 'react';
import {
  apiFetch,
  clearStoredSessionToken,
  detectApiBaseUrl,
  getApiBaseUrl,
  getStoredSessionToken,
  setStoredSessionToken,
} from '../api';
import type { AuthUser, Farm, Paddock, Animal } from '../types';

const DEVICE_ID_KEY = 'eixo_app_manejo_device_id';

const getDeviceId = () => {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      return stored;
    }
    const nextValue = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, nextValue);
    return nextValue;
  } catch {
    return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

export const useAppAuth = () => {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [activationCode, setActivationCode] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentProfile, setCurrentProfile] = useState<'VAQUEIRO' | 'ADMIN_CAMPO' | null>(null);
  const [farm, setFarm] = useState<Farm | null>(null);
  const [paddocks, setPaddocks] = useState<Paddock[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [screenError, setScreenError] = useState('');
  const [authMode, setAuthMode] = useState<'field' | 'management' | null>(null);

  const loadFieldContext = async (user: AuthUser) => {
    const defaultFarmId = user.defaultFarmId || user.allowedFarmIds?.[0] || null;
    if (!defaultFarmId) {
      setScreenError('Esse usuário não tem fazenda vinculada.');
      return;
    }

    const [farmsResponse, paddocksResponse, animalsResponse, poAnimalsResponse] = await Promise.all([
      apiFetch('/farms', { method: 'GET' }),
      apiFetch(`/pastos?farmId=${encodeURIComponent(defaultFarmId)}`, { method: 'GET' }),
      apiFetch(`/animals?farmId=${encodeURIComponent(defaultFarmId)}`, { method: 'GET' }),
      apiFetch(`/po/animals?farmId=${encodeURIComponent(defaultFarmId)}`, { method: 'GET' }),
    ]);

    if (!farmsResponse.ok) {
      throw new Error('Falha ao carregar fazendas.');
    }
    if (!paddocksResponse.ok) {
      throw new Error('Falha ao carregar pastos.');
    }
    if (!animalsResponse.ok) {
      throw new Error('Falha ao carregar animais.');
    }

    const farmsPayload = await farmsResponse.json();
    const paddocksPayload = await paddocksResponse.json();
    const animalsPayload = await animalsResponse.json();
    const poAnimalsPayload = poAnimalsResponse.ok ? await poAnimalsResponse.json().catch(() => ({})) : {};

    const availableFarms: Farm[] = Array.isArray(farmsPayload?.farms) ? farmsPayload.farms : [];
    const commercialAnimals: Animal[] = (Array.isArray(animalsPayload?.animals) ? animalsPayload.animals : [])
      .map((animal: Animal) => ({ ...animal, animalType: 'comercial' as const }));
    const poAnimalsSource = Array.isArray(poAnimalsPayload?.animals)
      ? poAnimalsPayload.animals
      : Array.isArray(poAnimalsPayload?.poAnimals)
        ? poAnimalsPayload.poAnimals
        : Array.isArray(poAnimalsPayload?.items)
          ? poAnimalsPayload.items
          : [];
    const poAnimals: Animal[] = poAnimalsSource.map((animal: Animal) => ({
      ...animal,
      name: animal.name || animal.nome || animal.registro || null,
      animalType: 'po' as const,
    }));

    setFarm(availableFarms.find((item) => item.id === defaultFarmId) || null);
    setPaddocks(Array.isArray(paddocksPayload?.items) ? paddocksPayload.items : []);
    setAnimals([...commercialAnimals, ...poAnimals]);
    setScreenError('');
  };

  const applyAuthenticatedState = async (payload: {
    user?: AuthUser;
    profile?: 'VAQUEIRO' | 'ADMIN_CAMPO' | null;
  }) => {
    const user = payload?.user;
    if (!user) {
      throw new Error('Resposta de autenticação inválida.');
    }
    setCurrentUser(user);
    setCurrentProfile(payload.profile || user.fieldProfile || null);
    await loadFieldContext(user);
  };

  useEffect(() => {
    const bootstrap = async () => {
      const baseUrl = await detectApiBaseUrl();
      setApiBaseUrl(baseUrl);
    try {
      if (!getStoredSessionToken()) {
        return;
      }
      const appMeResponse = await apiFetch('/app/me', { method: 'GET' });
      if (appMeResponse.ok) {
        const payload = await appMeResponse.json();
        await applyAuthenticatedState(payload);
        setAuthMode('field');
        return;
      }

      const authMeResponse = await apiFetch('/auth/me', { method: 'GET' });
      if (!authMeResponse.ok) {
        clearStoredSessionToken();
        return;
      }
      const payload = await authMeResponse.json().catch(() => ({}));
      await applyAuthenticatedState({
        user: payload?.user,
        profile: payload?.user?.fieldProfile || null,
      });
      setAuthMode('management');
    } catch {
      setScreenError(`Não foi possível conectar ao servidor em ${getApiBaseUrl()}.`);
    } finally {
      setIsAuthenticating(false);
    }
    };

    void bootstrap();
  }, []);

  const handleLogin = async (
    event: FormEvent,
    mode: 'field' | 'management',
    expectedProfile?: 'VAQUEIRO' | 'ADMIN_CAMPO',
  ) => {
    event.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);

    try {
      let response: Response;
      if (mode === 'management') {
        response = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: loginEmail.trim(),
            password: loginPassword,
            rememberMe: true,
          }),
        });
      } else {
        const deviceId = getDeviceId();
        response = await apiFetch('/app/activate', {
          method: 'POST',
          body: JSON.stringify({
            code: activationCode.trim(),
            deviceId,
            deviceFingerprint: deviceId,
            deviceLabel: 'Navegador atual',
            platform: 'WEB',
            appVersion: 'web-prototype',
          }),
        });
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoginError(payload?.message || 'Não foi possível entrar no app.');
        return;
      }
      if (mode === 'management') {
        const user = payload?.user;
        if (!user) {
          setLoginError('Resposta de login inválida.');
          return;
        }
        await applyAuthenticatedState({
          user,
          profile: user.fieldProfile || null,
        });
        setAuthMode('management');
        setLoginEmail('');
        setLoginPassword('');
      } else {
        if (!payload?.sessionToken) {
          setLoginError('Resposta de ativação inválida.');
          return;
        }
        const resolvedProfile = payload.profile || payload.user?.fieldProfile || null;
        if (expectedProfile && resolvedProfile !== expectedProfile) {
          clearStoredSessionToken();
          setLoginError(expectedProfile === 'ADMIN_CAMPO'
            ? 'Este código é de Vaqueiro. Use o botão Gerenciamento apenas com código de Admin de Campo.'
            : 'Este código não é de Vaqueiro.');
          return;
        }
        setStoredSessionToken(payload.sessionToken);
        await applyAuthenticatedState(payload);
        setAuthMode('field');
        setActivationCode('');
      }
    } catch {
      setLoginError(`Falha ao conectar em ${getApiBaseUrl()}.`);
    } finally {
      setIsAuthenticating(false);
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    clearStoredSessionToken();
    setCurrentUser(null);
    setCurrentProfile(null);
    setFarm(null);
    setPaddocks([]);
    setAnimals([]);
    setActivationCode('');
    setAuthMode(null);
  };

  return {
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
    logout,
    paddocks,
    screenError,
    setActivationCode,
    loginEmail,
    loginPassword,
    setLoginEmail,
    setLoginPassword,
    authMode,
  };
};
