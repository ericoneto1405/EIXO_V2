const DEFAULT_API_URL = 'http://localhost:3001';
const APP_SESSION_TOKEN_KEY = 'eixo_app_manejo_session_token';

const envBaseUrl = typeof import.meta.env.VITE_API_URL === 'string'
  ? import.meta.env.VITE_API_URL.trim()
  : '';

let cachedBaseUrl = '';

const getStoredBaseUrl = () => {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    const value = localStorage.getItem('eixo_app_manejo_api_url');
    return value && value.trim() ? value.trim() : '';
  } catch {
    return '';
  }
};

const setStoredBaseUrl = (url: string) => {
  cachedBaseUrl = url;
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem('eixo_app_manejo_api_url', url);
  } catch {
    // ignora erro de storage
  }
};

export const getApiBaseUrl = () => {
  return cachedBaseUrl || getStoredBaseUrl() || envBaseUrl || DEFAULT_API_URL;
};

export const buildApiUrl = (path: string) => {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return base.endsWith('/') ? `${base.slice(0, -1)}${normalizedPath}` : `${base}${normalizedPath}`;
};

export const getStoredSessionToken = () => {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    const value = localStorage.getItem(APP_SESSION_TOKEN_KEY);
    return value && value.trim() ? value.trim() : '';
  } catch {
    return '';
  }
};

export const setStoredSessionToken = (token: string) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(APP_SESSION_TOKEN_KEY, token);
  } catch {
    // ignora erro de storage
  }
};

export const clearStoredSessionToken = () => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(APP_SESSION_TOKEN_KEY);
  } catch {
    // ignora erro de storage
  }
};

const tryHealth = async (baseUrl: string) => {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export const detectApiBaseUrl = async () => {
  const preferred = envBaseUrl || getStoredBaseUrl() || DEFAULT_API_URL;
  if (await tryHealth(preferred)) {
    setStoredBaseUrl(preferred);
    return preferred;
  }

  const fallbackPorts = [3001, 3002, 3003, 3004, 3005, 5173];
  for (const port of fallbackPorts) {
    const url = `http://localhost:${port}`;
    // eslint-disable-next-line no-await-in-loop
    if (await tryHealth(url)) {
      setStoredBaseUrl(url);
      return url;
    }
  }

  setStoredBaseUrl(preferred);
  return preferred;
};

export const apiFetch = async (path: string, init?: RequestInit) => {
  const token = getStoredSessionToken();
  return fetch(buildApiUrl(path), {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-session-token': token } : {}),
      ...(init?.headers || {}),
    },
  });
};
