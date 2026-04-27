const DEFAULT_PORT_START = 3001;
const DEFAULT_PORT_END = 3010;
const DEFAULT_API_URL = `http://localhost:${DEFAULT_PORT_START}`;

const envBaseUrl = typeof import.meta.env.VITE_API_URL === 'string'
    ? import.meta.env.VITE_API_URL.trim()
    : '';
const isProd = import.meta.env.PROD;
let cachedBaseUrl = '';

const readWindowBaseUrl = () => {
    if (typeof window === 'undefined') {
        return '';
    }
    const value = (window as any).__EIXO_API_URL__;
    return typeof value === 'string' && value.trim() ? value.trim() : '';
};

const readStoredBaseUrl = () => {
    if (typeof window === 'undefined' || isProd) {
        return '';
    }
    try {
        const stored = localStorage.getItem('eixo_api_url');
        return stored && stored.trim() ? stored.trim() : '';
    } catch {
        return '';
    }
};

const setBaseUrl = (url: string) => {
    cachedBaseUrl = url;
    (window as any).__EIXO_API_URL__ = url;
    if (isProd) {
        return;
    }
    try {
        localStorage.setItem('eixo_api_url', url);
    } catch {
        // ignore storage errors
    }
};

export const getApiBaseUrl = () => {
    return readWindowBaseUrl()
        || cachedBaseUrl
        || readStoredBaseUrl()
        || envBaseUrl
        || DEFAULT_API_URL;
};

export const buildApiUrl = (path: string) => {
    const base = getApiBaseUrl();
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    if (base.endsWith('/')) {
        return `${base.slice(0, -1)}${normalizedPath}`;
    }
    return `${base}${normalizedPath}`;
};

const tryHealth = async (port: number) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600);
    try {
        const response = await fetch(`http://localhost:${port}/health`, {
            method: 'GET',
            credentials: 'include',
            signal: controller.signal,
        });
        if (!response.ok) {
            return null;
        }
        const data = await response.json().catch(() => ({}));
        const serverPort = typeof data?.port === 'number' ? data.port : port;
        return `http://localhost:${serverPort}`;
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
};

export const detectApiBaseUrl = async () => {
    if (isProd) {
        const base = envBaseUrl || '/api';
        setBaseUrl(base);
        return base;
    }
    const shouldDetect = !envBaseUrl || envBaseUrl === '/api';
    if (!shouldDetect) {
        if (envBaseUrl) {
            setBaseUrl(envBaseUrl);
        }
        return getApiBaseUrl();
    }

    const stored = (() => {
        try {
            return localStorage.getItem('eixo_api_url');
        } catch {
            return null;
        }
    })();
    if (stored) {
        const match = stored.match(/localhost:(\d+)/);
        const storedPort = match ? Number(match[1]) : null;
        if (storedPort) {
            const url = await tryHealth(storedPort);
            if (url) {
                setBaseUrl(url);
                return url;
            }
        }
        try {
            localStorage.removeItem('eixo_api_url');
        } catch {
            // ignore storage errors
        }
    }

    for (let port = DEFAULT_PORT_START; port <= DEFAULT_PORT_END; port += 1) {
        // eslint-disable-next-line no-await-in-loop
        const url = await tryHealth(port);
        if (url) {
            setBaseUrl(url);
            return url;
        }
    }

    setBaseUrl(DEFAULT_API_URL);
    return DEFAULT_API_URL;
};
