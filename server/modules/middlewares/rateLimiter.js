import { LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS, FORGOT_PASSWORD_WINDOW_MS, FORGOT_PASSWORD_MAX_ATTEMPTS } from '../config/env.js';

// ─── Stores de Rate Limiting (Singletons) ──────────────────────────────────────
// Estes Maps são compartilhados entre todos os módulos que importam este arquivo
export const loginAttempts = new Map();
export const otpSendAttempts = new Map();
export const otpVerifyAttempts = new Map();
export const chatRateAttempts = new Map();
export const chatBurstAttempts = new Map();
export const forgotPasswordAttempts = new Map();

// ─── Funções Genéricas de Rate Limiting ────────────────────────────────────────

export function isWindowRateLimited(store, key, limit, windowMs) {
    const entry = store.get(key);
    if (!entry) {
        return false;
    }
    if (Date.now() - entry.firstAttemptAt > windowMs) {
        store.delete(key);
        return false;
    }
    return entry.count >= limit;
}

export function registerWindowAttempt(store, key, windowMs) {
    const now = Date.now();
    const entry = store.get(key);
    if (!entry || now - entry.firstAttemptAt > windowMs) {
        store.set(key, { count: 1, firstAttemptAt: now });
        return;
    }
    entry.count += 1;
    store.set(key, entry);
}

export function clearWindowAttempt(store, key) {
    store.delete(key);
}

export function getWindowRetryAfterSeconds(store, key, windowMs) {
    const entry = store.get(key);
    if (!entry) return 1;
    const elapsed = Date.now() - entry.firstAttemptAt;
    const remainingMs = Math.max(1000, windowMs - elapsed);
    return Math.ceil(remainingMs / 1000);
}

// ─── Funções de Rate Limiting de Login ─────────────────────────────────────────

export function isRateLimited(key) {
    const entry = loginAttempts.get(key);
    if (!entry) {
        return false;
    }
    if (Date.now() - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
        loginAttempts.delete(key);
        return false;
    }
    return entry.count >= LOGIN_MAX_ATTEMPTS;
}

export function registerFailedLogin(key) {
    const now = Date.now();
    const entry = loginAttempts.get(key);
    if (!entry || now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
        loginAttempts.set(key, { count: 1, firstAttemptAt: now });
        return;
    }
    entry.count += 1;
    loginAttempts.set(key, entry);
}

export function clearLoginAttempts(key) {
    loginAttempts.delete(key);
}

export function isAnyLoginRateLimited(keys) {
    return keys.some((key) => isRateLimited(key));
}

export function registerFailedLogins(keys) {
    for (const key of keys) {
        registerFailedLogin(key);
    }
}

export function clearLoginRateLimits(keys) {
    for (const key of keys) {
        clearLoginAttempts(key);
    }
}

// ─── Funções de Rate Limiting de Forgot Password ───────────────────────────────

export function isAnyForgotPasswordRateLimited(keys) {
    return keys.some((key) => isWindowRateLimited(forgotPasswordAttempts, key, FORGOT_PASSWORD_MAX_ATTEMPTS, FORGOT_PASSWORD_WINDOW_MS));
}

export function registerForgotPasswordAttempts(keys) {
    for (const key of keys) {
        registerWindowAttempt(forgotPasswordAttempts, key, FORGOT_PASSWORD_WINDOW_MS);
    }
}

export function clearForgotPasswordAttempts(keys) {
    for (const key of keys) {
        clearWindowAttempt(forgotPasswordAttempts, key);
    }
}
