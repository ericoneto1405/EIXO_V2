import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar dotenv (caminho relativo ao server/)
const serverDir = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(serverDir, '.env') });
dotenv.config({ path: path.join(serverDir, '.env.local'), override: true });

// ─── Constantes de Caminhos ────────────────────────────────────────────────────
export const FIELD_OCCURRENCE_UPLOAD_ROOT = path.join(serverDir, 'uploads', 'field-occurrences');
export const AVATAR_UPLOAD_ROOT = path.join(serverDir, 'uploads', 'avatars');

// ─── Constantes de Domínio ─────────────────────────────────────────────────────
export const FIELD_WORKER_ROLE = 'field_worker';
export const FIELD_ADMIN_ROLE = 'field_admin';
export const FIELD_WORKER_DEFAULT_MODULES = ['Rebanho Comercial'];
export const APP_ACTIVATION_CODE_TTL_MS = 48 * 60 * 60 * 1000;
export const APP_ACTIVATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const FIELD_ATTACHMENT_MAX_FILES = 3;
export const FIELD_OCCURRENCE_TYPES = ['COCHO', 'AGUA', 'DOENTE', 'AVARIA', 'NASCEU', 'MORREU'];
export const FIELD_OCCURRENCE_STATUSES = ['PENDENTE', 'CONFIRMADO', 'CANCELADO'];
export const FIELD_ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
]);
export const PHONE_VERIFY_TTL_MS = 30 * 60 * 1000;

// ─── Variáveis de Ambiente ─────────────────────────────────────────────────────
export const PORT = process.env.PORT || 3001;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_PROD = NODE_ENV === 'production';
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'session';
export const SESSION_TOKEN_SALT = process.env.SESSION_TOKEN_SALT || 'dev-session-salt';
export const SESSION_LOGIN_TTL_MS = Number(process.env.SESSION_LOGIN_TTL_MS) || 2 * 60 * 60 * 1000;
export const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
export const ALLOW_X_USER_ID = process.env.ALLOW_X_USER_ID === 'true';
export const OTP_SEND_WINDOW_MS = Number(process.env.OTP_SEND_WINDOW_MS) || 10 * 60 * 1000;
export const OTP_SEND_MAX_PER_IP = Number(process.env.OTP_SEND_MAX_PER_IP) || 5;
export const OTP_SEND_MAX_PER_PHONE = Number(process.env.OTP_SEND_MAX_PER_PHONE) || 3;
export const OTP_VERIFY_WINDOW_MS = Number(process.env.OTP_VERIFY_WINDOW_MS) || 10 * 60 * 1000;
export const OTP_VERIFY_MAX_PER_IP = Number(process.env.OTP_VERIFY_MAX_PER_IP) || 10;
export const OTP_VERIFY_MAX_PER_PHONE = Number(process.env.OTP_VERIFY_MAX_PER_PHONE) || 5;
export const FORGOT_PASSWORD_WINDOW_MS = Number(process.env.FORGOT_PASSWORD_WINDOW_MS) || 15 * 60 * 1000;
export const FORGOT_PASSWORD_MAX_ATTEMPTS = Number(process.env.FORGOT_PASSWORD_MAX_ATTEMPTS) || 5;
export const CHAT_RATE_WINDOW_MS = Number(process.env.CHAT_RATE_WINDOW_MS) || 60 * 1000;
export const CHAT_RATE_MAX_PER_USER = Number(process.env.CHAT_RATE_MAX_PER_USER) || 30;
export const CHAT_BURST_WINDOW_MS = Number(process.env.CHAT_BURST_WINDOW_MS) || 10 * 1000;
export const CHAT_BURST_MAX_PER_USER = Number(process.env.CHAT_BURST_MAX_PER_USER) || 8;
export const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
export const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@eixo.ag';
export const RESEND_API_KEY = process.env.RESEND_API_KEY;
export const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
export const TWILIO_VERIFY_SID = process.env.TWILIO_VERIFY_SID;
export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// ─── Constantes de Negócio ─────────────────────────────────────────────────────
export const PASSWORD_POLICY_MESSAGE = 'A senha deve ter pelo menos 8 caracteres, com ao menos 1 letra e 1 número.';
export const REPRO_WINDOW_DAYS = 120;
export const DEFAULT_THRESHOLDS = {
    openDays: {
        greenMax: 120,
        yellowMax: 180,
        critical: 240,
    },
    iepDays: {
        greenMax: 430,
        yellowMax: 480,
        critical: 540,
    },
};
export const HERD_EVENT_CATEGORY_MAP = {
    COMPRA: { categoryId: 'sys-compra-animais', type: 'SAIDA', categoria: 'COMPRA_ANIMAIS' },
    VENDA:  { categoryId: 'sys-venda-animais',  type: 'ENTRADA', categoria: 'VENDA_ANIMAIS' },
};
export const SANITARY_CATEGORY_MAP = {
    VACINA:     { categoryId: 'sys-vacinas',     categoria: 'MEDICAMENTOS' },
    VERMIFUGO:  { categoryId: 'sys-vermifugos',  categoria: 'MEDICAMENTOS' },
    TRATAMENTO: { categoryId: 'sys-tratamentos', categoria: 'MEDICAMENTOS' },
};

// ─── Validação de Produção ─────────────────────────────────────────────────────
if (IS_PROD) {
    const productionConfigErrors = [];
    if (ALLOW_X_USER_ID) {
        productionConfigErrors.push('ALLOW_X_USER_ID não pode estar ativo em produção.');
    }
    if (!process.env.SESSION_TOKEN_SALT || SESSION_TOKEN_SALT === 'dev-session-salt') {
        productionConfigErrors.push('SESSION_TOKEN_SALT deve ser definido com um valor forte em produção.');
    }
    if (!process.env.CORS_ORIGIN || CORS_ORIGIN.includes('localhost') || CORS_ORIGIN.includes('127.0.0.1')) {
        productionConfigErrors.push('CORS_ORIGIN deve apontar para as origens reais do frontend em produção.');
    }
    if (productionConfigErrors.length) {
        for (const errorMessage of productionConfigErrors) {
            console.error(`ERRO CRÍTICO: ${errorMessage}`);
        }
        process.exit(1);
    }
}
