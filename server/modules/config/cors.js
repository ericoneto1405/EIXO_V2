import cors from 'cors';

// ─── Configuração CORS e Headers de Segurança ──────────────────────────────────

export function createCorsMiddleware(IS_PROD, CORS_ORIGIN) {
    const corsOrigins = CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    const devOriginRegex = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

    return cors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }
            if (corsOrigins.includes(origin)) {
                return callback(null, true);
            }
            if (!IS_PROD && devOriginRegex.test(origin)) {
                return callback(null, true);
            }
            return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
    });
}

export function createSecurityHeadersMiddleware(IS_PROD, CORS_ORIGIN) {
    const corsOrigins = CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    const cspConnectSrc = [
        "'self'",
        'https://api.open-meteo.com',
        'https://geocoding-api.open-meteo.com',
        ...corsOrigins,
        ...(!IS_PROD
            ? [
                'http://localhost:3001',
                'http://localhost:5173',
                'http://127.0.0.1:3001',
                'http://127.0.0.1:5173',
            ]
            : []),
    ];
    const contentSecurityPolicy = [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https://unpkg.com https://server.arcgisonline.com",
        `connect-src ${[...new Set(cspConnectSrc)].join(' ')}`,
    ].join('; ');

    return (req, res, next) => {
        res.setHeader('Content-Security-Policy', contentSecurityPolicy);
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        if (IS_PROD && req.secure) {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        next();
    };
}
