
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { detectApiBaseUrl } from './api';
import './src/index.css';

declare global {
  interface Window {
    __eixoFetchGuardInstalled?: boolean;
  }
}

if (!window.__eixoFetchGuardInstalled) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) {
      try {
        const cloned = response.clone();
        const payload = await cloned.json().catch(() => null);
        if (payload?.code === 'SESSION_REVOKED' || payload?.code === 'SESSION_EXPIRED' || payload?.code === 'SESSION_INVALID') {
          window.dispatchEvent(new CustomEvent('eixo:session-ended', {
            detail: payload,
          }));
        }
      } catch {
        // ignore parse errors
      }
    }
    return response;
  };
  window.__eixoFetchGuardInstalled = true;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const start = async () => {
  await detectApiBaseUrl();
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

start();
