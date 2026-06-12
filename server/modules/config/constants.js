import { IS_PROD, ALLOW_X_USER_ID } from './env.js';
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const allowXUserId = !IS_PROD && ALLOW_X_USER_ID;
