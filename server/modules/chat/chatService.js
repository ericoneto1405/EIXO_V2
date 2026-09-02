import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import {
    APP_BASE_URL,
    APP_RELEASE_SHA,
    SUPPORT_AI_PROVIDER,
    SUPPORT_AI_FALLBACK_PROVIDER,
    GROQ_API_KEY,
    GOOGLE_API_KEY,
    GOOGLE_CLOUD_PROJECT,
    GOOGLE_CLOUD_LOCATION,
    SUPPORT_MODEL_NAME,
    CHAT_RATE_WINDOW_MS,
    CHAT_RATE_MAX_PER_USER,
    CHAT_BURST_WINDOW_MS,
    CHAT_BURST_MAX_PER_USER,
    SUPPORT_ALERT_COOLDOWN_MS,
    SUPPORT_TELEGRAM_INCLUDE_MESSAGE,
    SUPPORT_ROLLOUT_MODE,
    SUPPORT_PILOT_ORGANIZATION_IDS,
} from '../config/env.js';
import { chatRateAttempts, chatBurstAttempts, isWindowRateLimited, registerWindowAttempt, getWindowRetryAfterSeconds } from '../middlewares/rateLimiter.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { normalizeUserModules, getDerivedAccessType } from '../utils/saasContext.js';
import { buildFarmScopeFilter } from '../middlewares/farmScope.js';
import {
    SUPPORT_KNOWLEDGE_VERSION,
    SUPPORT_KNOWLEDGE_UPDATED_AT,
    SUPPORT_KNOWLEDGE_QUALITY,
    buildSupportKnowledgeText,
    classifySupportSafety,
    findUnsupportedSupportLinks,
    selectSupportTopics,
    SUPPORT_MODULE_CATALOG,
    SUPPORT_INTERNAL_LINKS,
} from './supportKnowledge.js';
import {
    normalizeSupportConversationId,
    normalizeSupportMessage,
    normalizeSupportPath,
    supportOwnerMatches,
} from './supportRules.js';
import { getSupportRolloutDecision } from './supportRollout.js';
const prisma = new PrismaClient();

const SUPPORT_AI_PROVIDERS = new Set(['groq', 'gemini', 'vertex']);

const isSupportProviderAvailable = (provider) => {
    if (provider === 'groq') return Boolean(GROQ_API_KEY);
    if (provider === 'gemini') return Boolean(GOOGLE_API_KEY);
    if (provider === 'vertex') return Boolean(GOOGLE_CLOUD_PROJECT);
    return false;
};

const supportProviderOrder = Array.from(new Set([SUPPORT_AI_PROVIDER, SUPPORT_AI_FALLBACK_PROVIDER]))
    .filter((provider) => SUPPORT_AI_PROVIDERS.has(provider) && isSupportProviderAvailable(provider));

if (!SUPPORT_AI_PROVIDERS.has(SUPPORT_AI_PROVIDER)) {
    console.warn(`SUPPORT_AI_PROVIDER inválido: ${SUPPORT_AI_PROVIDER}.`);
}
if (!supportProviderOrder.length) {
    console.warn('Nenhum provedor de IA do EIXO Suporte está configurado.');
}
const EIXO_SUPORTE_SYSTEM_PROMPT = `Você é o Eixo Suporte, assistente virtual do sistema EIXO (pecuária de corte).

Seu objetivo é orientar o usuário no uso do sistema com respostas simples, práticas e curtas.

## Tom e estilo
- Use português do Brasil, linguagem simples e direta.
- Seja sempre cordial, solícito e positivo.
- Demonstre satisfação quando o cliente conseguir concluir a tarefa.
- Quando houver erro ou frustração, acolha primeiro e oriente sem alegria artificial.
- Cumprimente somente no início da conversa e evite frases repetitivas.
- Evite termos técnicos de software.
- Se for passo a passo, use lista numerada curta.
- Para listas com marcador, use sempre traço: "- item".
- Não invente tela, botão ou funcionalidade.

## Como responder
- Foque em "como fazer" dentro do EIXO.
- Quando possível, cite o caminho da tela (ex.: "Manejo do Rebanho > Animais").
- Quando houver link interno disponível no contexto, inclua um link em Markdown.
- O link deve entrar de forma natural na frase, como um atendente humano faria.
- Não crie uma lista de links no fim da resposta.
- Não mostre URLs cruas. Use o nome da tela como texto do link.
- Use apenas links internos informados no contexto. Não invente URL.
- Quando existir link mais específico para uma aba ou ação, prefira ele ao link genérico do módulo.
- Se a dúvida for ambígua, faça 1 pergunta curta para confirmar contexto.
- Se não tiver certeza, diga isso com transparência. Tente uma pergunta objetiva antes de encaminhar para a equipe.
- Use o contexto do atendimento para personalizar a resposta.
- Primeiro ajude o cliente a resolver a dúvida. Depois, se fizer sentido, sugira módulo pago.
- Seja vendedor consultivo: conecte a dor do cliente ao benefício real do módulo.
- Não seja insistente. Uma sugestão comercial curta é suficiente.
- Se a resposta já tiver link direto para a tela/aba certa, não pergunte "Quer que eu te mostre onde isso entra no EIXO?".
- Se o cliente responder apenas "sim", "quero" ou algo parecido depois dessa pergunta, não repita todo o passo a passo. Entregue o link direto e diga uma frase curta de orientação.

## Regras importantes para suporte
- Não informar preços ou condições comerciais de planos.
- Não prometer prazo de entrega de funcionalidades.
- Não pedir senha do usuário.
- Nunca expor dados sensíveis.
- Não diga que um módulo está liberado se o contexto indicar bloqueio.
- Não diga que um módulo está bloqueado se o contexto indicar que está ativo.
- Se o cliente perguntar por preço, planos ou contratação, explique o benefício e oriente clicar em "Ver planos" ou falar com o time comercial.

## Como vender sem atrapalhar
- Se o cliente demonstrar dor ligada a módulo bloqueado, explique o ganho prático do módulo.
- Use frases curtas com link natural, como: "Esse controle fica melhor no módulo [Nutrição](eixo:view:Nutri%C3%A7%C3%A3o)".
- Para upgrade, use algo natural como: "Você pode ver as opções em [Ver planos](/planos)".
- Use "Quer que eu te mostre onde isso entra no EIXO?" só quando ainda não houver link claro na resposta.
- Nunca invente desconto, preço, promoção ou condição comercial.

## Evite resposta ruim
- Não responda só "Acesse Manejo do Rebanho > Animais" se puder usar link.
- Não repita o mesmo passo a passo quando o cliente apenas confirmou "sim".
- Não finalize todas as respostas com pergunta genérica.
- Não coloque vários links soltos no fim da mensagem.

## Encerramento
- Se o usuário relatar erro técnico, peça print/etapas e oriente acionar o suporte humano.
- Foque sempre em ajudar a concluir a tarefa dentro do sistema EIXO.`;

const geminiAI = GOOGLE_API_KEY ? new GoogleGenAI({ apiKey: GOOGLE_API_KEY }) : null;
const vertexAI = GOOGLE_CLOUD_PROJECT
    ? new GoogleGenAI({
        vertexai: true,
        project: GOOGLE_CLOUD_PROJECT,
        location: GOOGLE_CLOUD_LOCATION,
    })
    : null;

const isSupportAiAvailable = supportProviderOrder.length > 0;

const toGroqHistory = (history) => (Array.isArray(history) ? history : [])
    .slice(-6)
    .map((item) => {
        const role = item?.role === 'model' ? 'assistant' : item?.role === 'user' ? 'user' : null;
        const text = Array.isArray(item?.parts)
            ? item.parts.map((part) => typeof part?.text === 'string' ? part.text : '').join('\n').trim()
            : '';
        return role && text ? { role, content: text.slice(0, 600) } : null;
    })
    .filter(Boolean);

const getSupportModelName = (provider) => provider === SUPPORT_AI_PROVIDER
    ? SUPPORT_MODEL_NAME
    : provider === 'groq' ? 'openai/gpt-oss-20b' : 'gemini-2.5-flash';

const generateGroqSupportAnswer = async ({ history, supportContext, message, modelName }) => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: EIXO_SUPORTE_SYSTEM_PROMPT },
                { role: 'system', content: supportContext },
                ...toGroqHistory(history),
                { role: 'user', content: `Mensagem do cliente:\n${String(message).slice(0, 2000)}` },
            ],
            temperature: 0.2,
            max_completion_tokens: 500,
        }),
        signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
        throw new Error(`Groq API retornou HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const text = typeof payload?.choices?.[0]?.message?.content === 'string'
        ? payload.choices[0].message.content.trim()
        : '';
    if (!text) {
        throw new Error('Groq API retornou uma resposta vazia.');
    }
    return text;
};

export const runSupportProviderChain = async (providers, generateForProvider) => {
    const errors = [];
    for (const provider of providers) {
        try {
            return await generateForProvider(provider);
        } catch (error) {
            errors.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    throw new Error(`Todos os provedores falharam. ${errors.join(' | ')}`);
};

const generateSupportAnswer = async ({ history, supportContext, message }) => runSupportProviderChain(
    supportProviderOrder,
    async (provider) => {
        if (provider === 'groq') {
            return {
                text: await generateGroqSupportAnswer({
                    history,
                    supportContext,
                    message,
                    modelName: getSupportModelName(provider),
                }),
                provider,
            };
        }
        const client = provider === 'vertex' ? vertexAI : geminiAI;
        const response = await client.chats.create({
            model: getSupportModelName(provider),
            history,
            config: { systemInstruction: EIXO_SUPORTE_SYSTEM_PROMPT },
        }).sendMessage({
            message: `${supportContext}\n\nMensagem do cliente:\n${message}`,
        });
        const text = String(response?.text || '').trim();
        if (!text) throw new Error('Resposta vazia.');
        return { text, provider };
    },
);

export const SUPPORT_ENTITY = 'SupportChat';
const SUPPORT_ACTION_USER = 'chat_message_user';
const SUPPORT_ACTION_AI = 'chat_message_ai';
export const SUPPORT_ACTION_ADMIN = 'chat_message_admin';
export const SUPPORT_ACTION_ASSUME = 'chat_assumed';
export const SUPPORT_ACTION_RELEASE = 'chat_released';
export const SUPPORT_ACTION_REQUEST = 'chat_human_requested';
export const SUPPORT_ACTION_REVIEWED = 'chat_marked_reviewed';
export const SUPPORT_ACTION_FEEDBACK_RESOLVED = 'chat_feedback_resolved';
export const SUPPORT_ACTION_FEEDBACK_UNRESOLVED = 'chat_feedback_unresolved';
export const SUPPORT_ACTION_SATISFACTION = 'chat_satisfaction_rated';
export const SUPPORT_ACTION_KNOWLEDGE_SUGGESTION = 'chat_knowledge_suggestion';
export const SUPPORT_ACTION_RESOLVED = 'chat_resolved';
export const SUPPORT_ACTION_SHADOW = 'chat_shadow_answer';
export const SUPPORT_CUSTOMER_VISIBLE_ACTIONS = [
    SUPPORT_ACTION_USER,
    SUPPORT_ACTION_AI,
    SUPPORT_ACTION_ADMIN,
    SUPPORT_ACTION_REQUEST,
    SUPPORT_ACTION_RESOLVED,
];
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const supportAlertCooldownStore = new Map();
const SUPPORT_PLAN_LABELS = {
    GRATIS: 'EIXO Essencial',
    EIXO_GESTAO: 'EIXO Gestão',
    EIXO_DECISAO: 'EIXO Performance',
};

const hasSupportModuleAccess = (module, entitlements) => {
    const normalized = new Set((entitlements || []).map((item) => String(item || '').trim().toUpperCase()));
    return module.entitlementCodes.some((code) => normalized.has(code));
};

const formatSupportList = (values) => {
    const filtered = (values || []).map((item) => String(item || '').trim()).filter(Boolean);
    return filtered.length ? filtered.join(', ') : 'não informado';
};

export const buildSupportAuditContext = (req, { farmId = null, currentPath = null } = {}) => ({
    organizationId: req.saas?.organizationId || null,
    farmId,
    currentPath,
    planCode: req.saas?.planCode || null,
    billingAccessState: req.saas?.billingAccessState || null,
    accessType: getDerivedAccessType(req.user),
    allowedModules: normalizeUserModules(req.user?.modules || [], req.user?.roles || [], getDerivedAccessType(req.user)),
    entitlements: Array.isArray(req.saas?.entitlements) ? req.saas.entitlements : [],
});

const buildSupportContextText = async (req, { farmId = null, currentPath = null, question = '' } = {}) => {
    const entitlements = Array.isArray(req.saas?.entitlements) ? req.saas.entitlements : [];
    const allowedModules = normalizeUserModules(req.user?.modules || [], req.user?.roles || [], getDerivedAccessType(req.user));
    const activeModules = SUPPORT_MODULE_CATALOG
        .filter((module) => hasSupportModuleAccess(module, entitlements))
        .map((module) => module.name);
    const lockedModules = SUPPORT_MODULE_CATALOG
        .filter((module) => !hasSupportModuleAccess(module, entitlements))
        .map((module) => `${module.name}: ${module.benefit}`);

    let subscription = null;
    if (req.saas?.organizationId) {
        subscription = await prisma.billingSubscription.findFirst({
            where: { organizationId: req.saas.organizationId },
            orderBy: { createdAt: 'desc' },
            select: { planCode: true, status: true },
        });
    }

    let farm = null;
    if (farmId) {
        farm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: farmId }),
            select: { id: true },
        });
    }

    const planCode = String(subscription?.planCode || '').trim().toUpperCase();
    const planLabel = SUPPORT_PLAN_LABELS[planCode] || planCode || 'não identificado';
    const salesPlaybook = SUPPORT_MODULE_CATALOG
        .map((module) => `- ${module.name}: vender quando houver dor sobre ${module.salesTrigger} Benefício: ${module.benefit}`)
        .join('\n');
    const internalLinks = SUPPORT_INTERNAL_LINKS
        .map((link) => `- [${link.label}](${link.href})`)
        .join('\n');

    return [
        'Contexto interno do atendimento. Use para responder, mas não copie como relatório para o cliente.',
        `Perfil de acesso: ${getDerivedAccessType(req.user) || 'não informado'}`,
        `Organização ativa: ${req.saas?.organizationId ? 'sim' : 'não'}`,
        `Plano atual: ${planLabel}`,
        `Status da assinatura: ${subscription?.status || req.saas?.billingAccessState || 'não informado'}`,
        `Entitlements ativos: ${formatSupportList(entitlements)}`,
        `Módulos do usuário: ${formatSupportList(allowedModules)}`,
        `Módulos ativos para orientar uso: ${formatSupportList(activeModules)}`,
        `Módulos bloqueados/oportunidade comercial: ${formatSupportList(lockedModules)}`,
        `Fazenda selecionada e autorizada: ${farm ? 'sim' : 'não'}`,
        `Tela atual: ${currentPath || 'não informada'}`,
        '',
        'Conhecimento específico para esta dúvida:',
        buildSupportKnowledgeText(question),
        '',
        'Links internos permitidos para usar em Markdown:',
        internalLinks,
        '',
        'Playbook comercial interno:',
        salesPlaybook,
        '',
        'Instrução final: responda curto, resolva a dúvida e use links internos de forma natural dentro da frase. Não liste links separados. Evite perguntas finais repetitivas quando o link já resolver o caminho. Só sugira upgrade quando a dor do cliente combinar com um módulo bloqueado.',
    ].join('\n');
};

export const createSupportLog = async (req, {
    conversationId,
    action,
    message = null,
    userIdOverride = null,
    organizationIdOverride = undefined,
    requestMeta = null,
    farmId = null,
    db = prisma,
}) => {
    try {
        return await db.activityLog.create({
            data: {
                id: crypto.randomUUID(),
                userId: userIdOverride || req.user.id,
                organizationId: organizationIdOverride !== undefined
                    ? organizationIdOverride
                    : req.saas?.organizationId || null,
                method: req.method,
                path: req.originalUrl || req.path || '',
                action,
                entity: SUPPORT_ENTITY,
                entityId: conversationId,
                description: message,
                farmId,
                requestMeta: {
                    knowledgeVersion: SUPPORT_KNOWLEDGE_VERSION,
                    ...(requestMeta && typeof requestMeta === 'object' ? requestMeta : {}),
                },
                statusCode: 200,
                ip: req.ip || null,
                userAgent: req.get('user-agent') || null,
            },
        });
    } catch (error) {
        console.error('Erro ao registrar log de suporte:', error);
        return null;
    }
};

const findSupportConversationOwner = async (conversationId) => prisma.activityLog.findFirst({
    where: {
        entity: SUPPORT_ENTITY,
        entityId: conversationId,
        action: { in: [SUPPORT_ACTION_USER, SUPPORT_ACTION_AI, SUPPORT_ACTION_ADMIN, SUPPORT_ACTION_REQUEST] },
    },
    orderBy: { createdAt: 'asc' },
    select: { userId: true, organizationId: true, farmId: true, requestMeta: true },
});

const getSupportOwnerFarmId = (owner) => owner?.farmId
    || (typeof owner?.requestMeta?.farmId === 'string' && owner.requestMeta.farmId.trim()
        ? owner.requestMeta.farmId.trim()
        : null);

const ensureSupportConversationAccess = async (req, conversationId) => {
    const owner = await findSupportConversationOwner(conversationId);
    let allowed = supportOwnerMatches(owner, {
        userId: req.user.id,
        organizationId: req.saas?.organizationId || null,
    });
    const ownerFarmId = getSupportOwnerFarmId(owner);
    if (allowed && ownerFarmId) {
        const allowedFarm = await prisma.farm.findFirst({
            where: buildFarmScopeFilter(req, { id: ownerFarmId }),
            select: { id: true },
        });
        allowed = Boolean(allowedFarm);
    }
    return { owner, ownerFarmId, allowed };
};

const resolveSupportFarmId = async (req, farmId) => {
    if (!farmId) return null;
    const farm = await prisma.farm.findFirst({
        where: buildFarmScopeFilter(req, { id: farmId }),
        select: { id: true },
    });
    return farm?.id || null;
};

const loadCanonicalSupportHistory = async (req, conversationId) => {
    const logs = await prisma.activityLog.findMany({
        where: {
            entity: SUPPORT_ENTITY,
            entityId: conversationId,
            userId: req.user.id,
            action: { in: [SUPPORT_ACTION_USER, SUPPORT_ACTION_AI, SUPPORT_ACTION_ADMIN] },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { action: true, description: true },
    });
    return logs.reverse().map((item) => ({
        role: item.action === SUPPORT_ACTION_USER ? 'user' : 'model',
        parts: [{ text: String(item.description || '').slice(0, 1000) }],
    }));
};

export const getSupportConversationState = async (conversationId, db = prisma) => {
    const latestControl = await db.activityLog.findFirst({
        where: {
            entity: SUPPORT_ENTITY,
            entityId: conversationId,
            action: { in: [SUPPORT_ACTION_REQUEST, SUPPORT_ACTION_ASSUME, SUPPORT_ACTION_RELEASE, SUPPORT_ACTION_RESOLVED] },
        },
        orderBy: { createdAt: 'desc' },
    });

    if (!latestControl || latestControl.action === SUPPORT_ACTION_RELEASE) {
        return { assumed: false, requested: false, resolved: false, assumedByUserId: null };
    }

    if (latestControl.action === SUPPORT_ACTION_RESOLVED) {
        return { assumed: false, requested: false, resolved: true, assumedByUserId: null };
    }

    if (latestControl.action === SUPPORT_ACTION_REQUEST) {
        return { assumed: false, requested: true, resolved: false, assumedByUserId: null };
    }

    const requestMeta = latestControl.requestMeta && typeof latestControl.requestMeta === 'object'
        ? latestControl.requestMeta
        : {};
    return {
        assumed: true,
        requested: false,
        resolved: false,
        assumedByUserId: requestMeta?.adminUserId || latestControl.userId || null,
    };
};

const shouldTriggerSupportNoAnswerFallback = (text) => {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return true;
    const weakPatterns = [
        'não sei',
        'nao sei',
        'não tenho certeza',
        'nao tenho certeza',
        'não consigo responder',
        'nao consigo responder',
        'não posso responder',
        'nao posso responder',
    ];
    return weakPatterns.some((pattern) => normalized.includes(pattern));
};

export const buildSupportAnswerMetadata = ({
    matchedTopics = [],
    confidence = 0,
    responseType = 'answer',
    provider = null,
    escalationReason = null,
    intentOverride = null,
} = {}) => ({
    intent: intentOverride || matchedTopics[0]?.id || 'needs_clarification',
    topicIds: matchedTopics.map((topic) => topic.id),
    knowledgeVersion: SUPPORT_KNOWLEDGE_VERSION,
    confidence,
    recommendedLink: matchedTopics[0]?.href || null,
    responseType,
    provider,
    escalationReason,
});

const sendSupportTelegramAlert = async (req, {
    conversationId,
    farmId = null,
    reason,
    userMessage,
}) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
    const cooldownKey = `${conversationId}:${reason}`;
    const lastSentAt = supportAlertCooldownStore.get(cooldownKey) || 0;
    if (Date.now() - lastSentAt < SUPPORT_ALERT_COOLDOWN_MS) return false;

    try {
        const text = [
            'EIXO Suporte — novo alerta',
            '',
            `Motivo: ${String(reason || 'não informado')}`,
            `Conversa: ${conversationId}`,
            ...(SUPPORT_TELEGRAM_INCLUDE_MESSAGE
                ? ['', `Mensagem: ${String(userMessage || '').slice(0, 300) || 'Sem mensagem.'}`]
                : []),
            '',
            `Abrir EIXO HQ: ${APP_BASE_URL}`,
        ].join('\n');
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text,
                disable_web_page_preview: true,
            }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok !== true) {
            throw new Error(payload?.description || 'Falha ao enviar alerta pelo Telegram.');
        }
        supportAlertCooldownStore.set(cooldownKey, Date.now());
        return true;
    } catch (error) {
        console.error('Erro ao enviar alerta de suporte pelo Telegram:', error);
        return false;
    }
};

const requestSupportHumanReview = async (req, {
    conversationId,
    farmId = null,
    currentPath = null,
    reason,
    userMessage,
}) => {
    const state = await getSupportConversationState(conversationId);
    if (!state.requested && !state.assumed) {
        const saved = await createSupportLog(req, {
            conversationId,
            action: SUPPORT_ACTION_REQUEST,
            message: 'Sua conversa foi encaminhada para a Equipe EIXO, que continuará o atendimento por aqui.',
            requestMeta: { role: 'system', currentPath, reason },
            farmId,
        });
        if (!saved) return false;
    }
    await sendSupportTelegramAlert(req, { conversationId, farmId, reason, userMessage });
    return true;
};

export function registerChatRoutes(app) {
    app.get('/api/chat/knowledge-status', (_req, res) => res.json({
        ok: true,
        releaseSha: APP_RELEASE_SHA,
        knowledgeVersion: SUPPORT_KNOWLEDGE_VERSION,
        knowledgeUpdatedAt: SUPPORT_KNOWLEDGE_UPDATED_AT,
        rolloutMode: SUPPORT_ROLLOUT_MODE,
        quality: SUPPORT_KNOWLEDGE_QUALITY,
    }));

    app.post('/api/chat/request-human', requireAuth, async (req, res) => {
        const { conversationId, farmId, currentPath } = req.body || {};
        const conversationKey = conversationId
            ? normalizeSupportConversationId(conversationId)
            : crypto.randomUUID();
        if (!conversationKey) {
            return res.status(400).json({ message: 'Conversa inválida.' });
        }
        const requestedFarmId = typeof farmId === 'string' && farmId.trim() ? farmId.trim() : null;
        const normalizedCurrentPath = normalizeSupportPath(currentPath);

        try {
            const normalizedFarmId = await resolveSupportFarmId(req, requestedFarmId);
            if (requestedFarmId && !normalizedFarmId) {
                return res.status(403).json({ message: 'Fazenda não permitida para este atendimento.' });
            }
            const [{ owner, allowed, ownerFarmId }, lastUserMessage] = await Promise.all([
                ensureSupportConversationAccess(req, conversationKey),
                prisma.activityLog.findFirst({
                    where: {
                        entity: SUPPORT_ENTITY,
                        entityId: conversationKey,
                        action: SUPPORT_ACTION_USER,
                        userId: req.user.id,
                    },
                    orderBy: { createdAt: 'desc' },
                    select: { description: true },
                }),
            ]);
            if (!allowed) {
                return res.status(403).json({ message: 'Conversa não pertence a este usuário.' });
            }
            if (owner && normalizedFarmId !== ownerFarmId) {
                return res.status(409).json({ message: 'Esta conversa pertence a outra fazenda. Inicie uma nova conversa.' });
            }

            const state = await getSupportConversationState(conversationKey);
            if (!state.requested && !state.assumed) {
                const confirmation = 'Sua solicitação foi enviada para a equipe EIXO. Um especialista continuará o atendimento por aqui.';
                const requestSaved = await createSupportLog(req, {
                    conversationId: conversationKey,
                    action: SUPPORT_ACTION_REQUEST,
                    message: confirmation,
                    requestMeta: {
                        role: 'system',
                        currentPath: normalizedCurrentPath,
                    },
                    farmId: normalizedFarmId,
                });
                if (!requestSaved) {
                    throw new Error('Não foi possível registrar a solicitação de atendimento.');
                }
                await sendSupportTelegramAlert(req, {
                    conversationId: conversationKey,
                    farmId: normalizedFarmId,
                    reason: 'human_requested',
                    userMessage: lastUserMessage?.description || 'O usuário solicitou falar com um especialista.',
                });
            }

            return res.json({
                ok: true,
                conversationId: conversationKey,
                humanRequested: !state.assumed,
                assumedByAdmin: state.assumed,
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao solicitar atendimento humano.' });
        }
    });

    app.post('/api/chat/send-message', requireAuth, async (req, res) => {
        const { message, conversationId, farmId, currentPath } = req.body || {};
        const normalizedMessage = normalizeSupportMessage(message);
        if (!normalizedMessage) {
            return res.status(400).json({ message: 'Mensagem vazia ou acima do limite permitido.' });
        }
        const chatRateKey = `user:${req.user.id}`;
        if (isWindowRateLimited(chatRateAttempts, chatRateKey, CHAT_RATE_MAX_PER_USER, CHAT_RATE_WINDOW_MS)) {
            const retryAfter = getWindowRetryAfterSeconds(chatRateAttempts, chatRateKey, CHAT_RATE_WINDOW_MS);
            return res
                .status(429)
                .set('Retry-After', String(retryAfter))
                .json({ message: 'Você enviou muitas mensagens. Aguarde alguns segundos e tente novamente.' });
        }
        if (isWindowRateLimited(chatBurstAttempts, chatRateKey, CHAT_BURST_MAX_PER_USER, CHAT_BURST_WINDOW_MS)) {
            const retryAfter = getWindowRetryAfterSeconds(chatBurstAttempts, chatRateKey, CHAT_BURST_WINDOW_MS);
            return res
                .status(429)
                .set('Retry-After', String(retryAfter))
                .json({ message: 'Muitas mensagens em pouco tempo. Aguarde alguns segundos e tente novamente.' });
        }
        registerWindowAttempt(chatRateAttempts, chatRateKey, CHAT_RATE_WINDOW_MS);
        registerWindowAttempt(chatBurstAttempts, chatRateKey, CHAT_BURST_WINDOW_MS);

        const conversationKey = conversationId
            ? normalizeSupportConversationId(conversationId)
            : crypto.randomUUID();
        if (!conversationKey) {
            return res.status(400).json({ message: 'Conversa inválida.' });
        }
        const requestedFarmId = typeof farmId === 'string' && farmId.trim() ? farmId.trim() : null;
        const normalizedCurrentPath = normalizeSupportPath(currentPath);

        let normalizedFarmId = null;
        let canonicalHistory = [];
        const matchedTopics = selectSupportTopics(normalizedMessage);
        const safetyDecision = classifySupportSafety(normalizedMessage);
        const knowledgeConfidence = matchedTopics.length
            ? Math.min(0.99, Number((0.55 + (matchedTopics[0].score * 0.03)).toFixed(2)))
            : 0.35;
        try {
            normalizedFarmId = await resolveSupportFarmId(req, requestedFarmId);
            if (requestedFarmId && !normalizedFarmId) {
                return res.status(403).json({ message: 'Fazenda não permitida para este atendimento.' });
            }
            const { owner, allowed, ownerFarmId } = await ensureSupportConversationAccess(req, conversationKey);
            if (!allowed) {
                return res.status(403).json({ message: 'Conversa não pertence a este usuário.' });
            }
            if (owner && normalizedFarmId !== ownerFarmId) {
                return res.status(409).json({ message: 'Esta conversa pertence a outra fazenda. Inicie uma nova conversa.' });
            }
            canonicalHistory = await loadCanonicalSupportHistory(req, conversationKey);
            const saved = await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_USER,
                message: normalizedMessage,
                requestMeta: {
                    role: 'user',
                    currentPath: normalizedCurrentPath,
                    context: buildSupportAuditContext(req, {
                        farmId: normalizedFarmId,
                        currentPath: normalizedCurrentPath,
                    }),
                },
                farmId: normalizedFarmId,
            });
            if (!saved) {
                return res.status(500).json({ message: 'Não foi possível salvar sua mensagem. Tente novamente.' });
            }
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao preparar o atendimento.' });
        }

        let state;
        try {
            state = await getSupportConversationState(conversationKey);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao consultar o estado do atendimento.' });
        }
        if (state.assumed || state.requested) {
            return res.json({
                response: state.assumed
                    ? 'Seu atendimento foi assumido por um especialista do suporte.'
                    : 'Sua solicitação está aguardando um especialista do suporte.',
                conversationId: conversationKey,
                assumedByAdmin: state.assumed,
                humanRequested: state.requested,
                resolved: state.resolved,
            });
        }

        if (safetyDecision) {
            const answerMetadata = buildSupportAnswerMetadata({
                matchedTopics,
                confidence: 1,
                responseType: safetyDecision.action === 'escalate' ? 'escalation' : 'refusal',
                escalationReason: safetyDecision.action === 'escalate' ? safetyDecision.policy : null,
                intentOverride: safetyDecision.policy,
            });
            const answerSaved = await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_AI,
                message: safetyDecision.message,
                requestMeta: {
                    role: 'ai',
                    safetyPolicy: safetyDecision.policy,
                    ...(safetyDecision.action === 'escalate' ? { fallbackReason: safetyDecision.policy } : {}),
                    ...answerMetadata,
                },
                farmId: normalizedFarmId,
            });
            if (!answerSaved) return res.status(500).json({ message: 'Não foi possível registrar a orientação de segurança.' });
            let humanRequested = false;
            if (safetyDecision.action === 'escalate') {
                humanRequested = await requestSupportHumanReview(req, {
                    conversationId: conversationKey,
                    farmId: normalizedFarmId,
                    currentPath: normalizedCurrentPath,
                    reason: safetyDecision.policy,
                    userMessage: normalizedMessage,
                });
                if (!humanRequested) return res.status(500).json({ message: 'Não foi possível encaminhar o caso de segurança.' });
            }
            return res.json({
                response: safetyDecision.message,
                conversationId: conversationKey,
                assumedByAdmin: false,
                humanRequested,
                messageId: answerSaved.id,
                metadata: answerMetadata,
            });
        }

        const rolloutDecision = getSupportRolloutDecision({
            mode: SUPPORT_ROLLOUT_MODE,
            organizationId: req.saas?.organizationId || null,
            pilotOrganizationIds: SUPPORT_PILOT_ORGANIZATION_IDS,
        });
        if (!rolloutDecision.live) {
            let candidateText = 'Dúvida sem cobertura suficiente para uma resposta automática.';
            let candidateResponseType = 'clarification';
            let candidateProvider = null;
            let candidateFallbackReason = null;
            if (matchedTopics.length && isSupportAiAvailable) {
                try {
                    const supportContext = await buildSupportContextText(req, {
                        farmId: normalizedFarmId,
                        currentPath: normalizedCurrentPath,
                        question: normalizedMessage,
                    });
                    const candidate = await generateSupportAnswer({
                        history: canonicalHistory,
                        supportContext,
                        message: normalizedMessage,
                    });
                    candidateText = String(candidate.text).slice(0, 2000);
                    candidateProvider = candidate.provider;
                    const unsupportedLinks = findUnsupportedSupportLinks(candidateText);
                    if (shouldTriggerSupportNoAnswerFallback(candidateText) || unsupportedLinks.length) {
                        candidateResponseType = 'escalation';
                        candidateFallbackReason = unsupportedLinks.length ? 'invalid_link' : 'low_confidence';
                    } else {
                        candidateResponseType = 'answer';
                    }
                } catch {
                    candidateText = 'A resposta candidata não pôde ser gerada.';
                    candidateResponseType = 'escalation';
                    candidateFallbackReason = 'ai_error';
                }
            } else if (matchedTopics.length) {
                candidateText = 'A resposta candidata não pôde ser gerada porque a IA está indisponível.';
                candidateResponseType = 'escalation';
                candidateFallbackReason = 'ai_unavailable';
            }
            const candidateMetadata = buildSupportAnswerMetadata({
                matchedTopics,
                confidence: knowledgeConfidence,
                provider: candidateProvider,
                responseType: 'shadow',
                escalationReason: rolloutDecision.reason,
            });
            const candidateSaved = await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_SHADOW,
                message: candidateText,
                requestMeta: {
                    role: 'shadow',
                    rolloutMode: rolloutDecision.mode,
                    candidateResponseType,
                    candidateFallbackReason,
                    ...candidateMetadata,
                },
                farmId: normalizedFarmId,
            });
            const reviewRequested = candidateSaved && await requestSupportHumanReview(req, {
                conversationId: conversationKey,
                farmId: normalizedFarmId,
                currentPath: normalizedCurrentPath,
                reason: rolloutDecision.reason,
                userMessage: normalizedMessage,
            });
            if (!candidateSaved || !reviewRequested) {
                return res.status(500).json({ message: 'Não foi possível registrar o atendimento em avaliação.' });
            }
            return res.json({
                response: 'Sua dúvida foi encaminhada para a Equipe EIXO, que continuará o atendimento por aqui.',
                conversationId: conversationKey,
                assumedByAdmin: false,
                humanRequested: true,
                rolloutMode: rolloutDecision.mode,
            });
        }

        if (!matchedTopics.length) {
            const clarificationText = 'Quero orientar você com segurança. Em qual tela do EIXO você está e o que deseja fazer?';
            const answerMetadata = buildSupportAnswerMetadata({
                confidence: knowledgeConfidence,
                responseType: 'clarification',
            });
            const clarificationSaved = await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_AI,
                message: clarificationText,
                requestMeta: { role: 'ai', ...answerMetadata },
                farmId: normalizedFarmId,
            });
            if (!clarificationSaved) {
                return res.status(500).json({ message: 'Não foi possível salvar o pedido de esclarecimento.' });
            }
            return res.json({
                response: clarificationText,
                conversationId: conversationKey,
                assumedByAdmin: false,
                humanRequested: false,
                messageId: clarificationSaved.id,
                metadata: answerMetadata,
            });
        }

        if (!isSupportAiAvailable) {
            const fallbackText = 'Suporte automático indisponível no momento. Nosso time foi avisado e responderá por aqui.';
            const answerMetadata = buildSupportAnswerMetadata({
                matchedTopics,
                confidence: knowledgeConfidence,
                responseType: 'escalation',
                escalationReason: 'ai_unavailable',
            });
            const fallbackSaved = await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_AI,
                message: fallbackText,
                requestMeta: { role: 'ai', fallbackReason: 'ai_unavailable', ...answerMetadata },
                farmId: normalizedFarmId,
            });
            const reviewRequested = fallbackSaved && await requestSupportHumanReview(req, {
                conversationId: conversationKey,
                farmId: normalizedFarmId,
                currentPath: normalizedCurrentPath,
                reason: 'ai_unavailable',
                userMessage: normalizedMessage,
            });
            if (!fallbackSaved || !reviewRequested) {
                return res.status(500).json({ message: 'O suporte está indisponível e não foi possível registrar o encaminhamento.' });
            }
            return res.json({
                response: fallbackText,
                conversationId: conversationKey,
                assumedByAdmin: false,
                humanRequested: true,
                messageId: fallbackSaved.id,
                metadata: answerMetadata,
            });
        }

        try {
            const supportContext = await buildSupportContextText(req, {
                farmId: normalizedFarmId,
                currentPath: normalizedCurrentPath,
                question: normalizedMessage,
            });
            const { text, provider: providerUsed } = await generateSupportAnswer({
                history: canonicalHistory,
                supportContext,
                message: normalizedMessage,
            });
            const unsupportedLinks = findUnsupportedSupportLinks(text);
            if (shouldTriggerSupportNoAnswerFallback(text) || unsupportedLinks.length > 0) {
                const fallbackText = 'Não consegui responder essa dúvida com segurança agora. Nosso time foi avisado e continuará seu atendimento por aqui.';
                const fallbackReason = unsupportedLinks.length > 0 ? 'invalid_link' : 'low_confidence';
                const answerMetadata = buildSupportAnswerMetadata({
                    matchedTopics,
                    confidence: knowledgeConfidence,
                    responseType: 'escalation',
                    provider: providerUsed,
                    escalationReason: fallbackReason,
                });
                const fallbackSaved = await createSupportLog(req, {
                    conversationId: conversationKey,
                    action: SUPPORT_ACTION_AI,
                    message: fallbackText,
                    requestMeta: { role: 'ai', fallbackReason, unsupportedLinks, ...answerMetadata },
                    farmId: normalizedFarmId,
                });
                const reviewRequested = fallbackSaved && await requestSupportHumanReview(req, {
                    conversationId: conversationKey,
                    farmId: normalizedFarmId,
                    currentPath: normalizedCurrentPath,
                    reason: fallbackReason,
                    userMessage: normalizedMessage,
                });
                if (!fallbackSaved || !reviewRequested) {
                    return res.status(500).json({ message: 'Não foi possível registrar o encaminhamento do atendimento.' });
                }
                return res.json({
                    response: fallbackText,
                    conversationId: conversationKey,
                    assumedByAdmin: false,
                    humanRequested: true,
                    messageId: fallbackSaved.id,
                    metadata: answerMetadata,
                });
            }

            const answerMetadata = buildSupportAnswerMetadata({
                matchedTopics,
                confidence: knowledgeConfidence,
                provider: providerUsed,
            });
            const answerSaved = await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_AI,
                message: String(text).slice(0, 2000),
                requestMeta: {
                    role: 'ai',
                    ...answerMetadata,
                },
                farmId: normalizedFarmId,
            });
            if (!answerSaved) {
                return res.status(500).json({ message: 'A resposta foi gerada, mas não pôde ser salva. Tente novamente.' });
            }

            return res.json({
                response: text,
                conversationId: conversationKey,
                assumedByAdmin: false,
                humanRequested: false,
                messageId: answerSaved.id,
                metadata: answerMetadata,
            });
        } catch (error) {
            console.error(`Erro ao comunicar com a IA do Suporte (${supportProviderOrder.join(', ') || 'sem provedor'}):`, error);
            const fallbackText = 'Suporte automático indisponível no momento. Nosso time foi avisado e responderá por aqui.';
            const answerMetadata = buildSupportAnswerMetadata({
                matchedTopics,
                confidence: knowledgeConfidence,
                responseType: 'escalation',
                escalationReason: 'ai_error',
            });
            const fallbackSaved = await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_AI,
                message: fallbackText,
                requestMeta: { role: 'ai', fallbackReason: 'ai_error', ...answerMetadata },
                farmId: normalizedFarmId,
            });
            const reviewRequested = fallbackSaved && await requestSupportHumanReview(req, {
                conversationId: conversationKey,
                farmId: normalizedFarmId,
                currentPath: normalizedCurrentPath,
                reason: 'ai_error',
                userMessage: normalizedMessage,
            });
            if (!fallbackSaved || !reviewRequested) {
                return res.status(500).json({ message: 'O suporte está indisponível e não foi possível registrar o encaminhamento.' });
            }
            return res.json({
                response: fallbackText,
                conversationId: conversationKey,
                assumedByAdmin: false,
                humanRequested: true,
                messageId: fallbackSaved.id,
                metadata: answerMetadata,
            });
        }
    });

    app.post('/api/chat/feedback', requireAuth, async (req, res) => {
        const { conversationId, messageId, resolved, reason } = req.body || {};
        const conversationKey = normalizeSupportConversationId(conversationId);
        const normalizedReason = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
        if (!conversationKey || !messageId || typeof resolved !== 'boolean') {
            return res.status(400).json({ message: 'Avaliação inválida.' });
        }

        try {
            const { owner, allowed } = await ensureSupportConversationAccess(req, conversationKey);
            if (!owner) return res.status(404).json({ message: 'Conversa não encontrada.' });
            if (!allowed) return res.status(403).json({ message: 'Conversa não pertence a este usuário.' });

            const [answer, existingFeedback] = await Promise.all([
                prisma.activityLog.findFirst({
                    where: {
                        id: String(messageId),
                        entity: SUPPORT_ENTITY,
                        entityId: conversationKey,
                        userId: req.user.id,
                        action: SUPPORT_ACTION_AI,
                    },
                    select: { id: true },
                }),
                prisma.activityLog.findFirst({
                    where: {
                        entity: SUPPORT_ENTITY,
                        entityId: conversationKey,
                        userId: req.user.id,
                        action: { in: [SUPPORT_ACTION_FEEDBACK_RESOLVED, SUPPORT_ACTION_FEEDBACK_UNRESOLVED] },
                        requestMeta: { path: ['messageId'], equals: String(messageId) },
                    },
                    select: { action: true },
                }),
            ]);
            if (!answer) return res.status(400).json({ message: 'Resposta avaliada não encontrada.' });
            if (existingFeedback) {
                return res.json({
                    ok: true,
                    resolved: existingFeedback.action === SUPPORT_ACTION_FEEDBACK_RESOLVED,
                    alreadyRegistered: true,
                });
            }

            const feedbackAction = resolved
                ? SUPPORT_ACTION_FEEDBACK_RESOLVED
                : SUPPORT_ACTION_FEEDBACK_UNRESOLVED;
            const feedbackSaved = await createSupportLog(req, {
                conversationId: conversationKey,
                action: feedbackAction,
                message: resolved ? 'Cliente informou que a resposta resolveu.' : 'Cliente informou que a resposta não resolveu.',
                requestMeta: {
                    messageId: String(messageId),
                    ...(resolved ? {} : { reason: normalizedReason || null }),
                },
                farmId: owner.farmId || null,
            });
            if (!feedbackSaved) {
                return res.status(500).json({ message: 'Não foi possível salvar sua avaliação.' });
            }

            if (resolved) {
                await createSupportLog(req, {
                    conversationId: conversationKey,
                    action: SUPPORT_ACTION_RESOLVED,
                    message: 'Conversa resolvida por autoatendimento.',
                    requestMeta: { source: 'customer_feedback' },
                    farmId: owner.farmId || null,
                });
                return res.json({ ok: true, resolved: true, humanRequested: false });
            }

            const unresolvedCount = await prisma.activityLog.count({
                where: {
                    entity: SUPPORT_ENTITY,
                    entityId: conversationKey,
                    userId: req.user.id,
                    action: SUPPORT_ACTION_FEEDBACK_UNRESOLVED,
                },
            });
            if (unresolvedCount >= 2) {
                const requested = await requestSupportHumanReview(req, {
                    conversationId: conversationKey,
                    farmId: owner.farmId || null,
                    reason: 'customer_unresolved_twice',
                    userMessage: 'O cliente informou duas vezes que a orientação não resolveu.',
                });
                if (!requested) {
                    return res.status(500).json({ message: 'A avaliação foi salva, mas o encaminhamento falhou.' });
                }
                return res.json({ ok: true, resolved: false, humanRequested: true });
            }

            return res.json({
                ok: true,
                resolved: false,
                humanRequested: false,
                askForDetails: true,
                message: 'Entendi. Conte o que aconteceu ou em qual etapa você parou para eu tentar de outro jeito.',
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao registrar avaliação do atendimento.' });
        }
    });

    app.post('/api/chat/satisfaction', requireAuth, async (req, res) => {
        const { conversationId, messageId, rating } = req.body || {};
        const conversationKey = normalizeSupportConversationId(conversationId);
        const normalizedRating = Number(rating);
        if (!conversationKey || !messageId || !Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
            return res.status(400).json({ message: 'Avaliação de satisfação inválida.' });
        }

        try {
            const { owner, allowed } = await ensureSupportConversationAccess(req, conversationKey);
            if (!owner) return res.status(404).json({ message: 'Conversa não encontrada.' });
            if (!allowed) return res.status(403).json({ message: 'Conversa não pertence a este usuário.' });

            const [answer, existingRating] = await Promise.all([
                prisma.activityLog.findFirst({
                    where: {
                        id: String(messageId),
                        entity: SUPPORT_ENTITY,
                        entityId: conversationKey,
                        userId: req.user.id,
                        action: SUPPORT_ACTION_AI,
                    },
                    select: { id: true },
                }),
                prisma.activityLog.findFirst({
                    where: {
                        entity: SUPPORT_ENTITY,
                        entityId: conversationKey,
                        userId: req.user.id,
                        action: SUPPORT_ACTION_SATISFACTION,
                        requestMeta: { path: ['messageId'], equals: String(messageId) },
                    },
                    select: { requestMeta: true },
                }),
            ]);
            if (!answer) return res.status(400).json({ message: 'Resposta avaliada não encontrada.' });
            if (existingRating) {
                return res.json({ ok: true, rating: Number(existingRating.requestMeta?.rating), alreadyRegistered: true });
            }

            const saved = await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_SATISFACTION,
                message: `Cliente avaliou o atendimento com ${normalizedRating} de 5.`,
                requestMeta: { messageId: String(messageId), rating: normalizedRating },
                farmId: owner.farmId || null,
            });
            if (!saved) return res.status(500).json({ message: 'Não foi possível salvar a satisfação.' });
            return res.json({ ok: true, rating: normalizedRating });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao registrar satisfação.' });
        }
    });

    app.get('/api/chat/conversations', requireAuth, async (req, res) => {
        const requestedFarmId = typeof req.query?.farmId === 'string' ? req.query.farmId.trim() : '';
        const normalizedFarmId = requestedFarmId || null;
        const parsedLimit = Number.parseInt(String(req.query?.limit || '3'), 10);
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 3) : 3;

        try {
            const logs = await prisma.activityLog.findMany({
                where: {
                    entity: SUPPORT_ENTITY,
                    action: { in: SUPPORT_CUSTOMER_VISIBLE_ACTIONS },
                    userId: req.user.id,
                    entityId: { not: null },
                    ...(normalizedFarmId
                        ? { OR: [{ farmId: normalizedFarmId }, { farmId: null }] }
                        : {}),
                },
                orderBy: { createdAt: 'desc' },
                take: 2000,
                select: {
                    id: true,
                    entityId: true,
                    description: true,
                    createdAt: true,
                    farmId: true,
                    requestMeta: true,
                },
            });

            const grouped = new Map();
            for (const log of logs) {
                const conversationId = String(log.entityId || '').trim();
                if (!conversationId) continue;

                const requestMeta = log.requestMeta && typeof log.requestMeta === 'object'
                    ? log.requestMeta
                    : {};
                const farmIdFromLog = log.farmId
                    || (typeof requestMeta?.farmId === 'string' && requestMeta.farmId.trim()
                        ? requestMeta.farmId.trim()
                        : null);

                if (normalizedFarmId && farmIdFromLog !== normalizedFarmId) {
                    continue;
                }

                if (grouped.has(conversationId)) {
                    continue;
                }

                grouped.set(conversationId, {
                    conversationId,
                    lastAt: log.createdAt,
                    preview: String(log.description || '').slice(0, 140),
                    farmId: farmIdFromLog,
                });

                if (grouped.size >= limit) {
                    break;
                }
            }

            return res.json({ conversations: Array.from(grouped.values()) });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar conversas.' });
        }
    });

    app.get('/api/chat/conversations/:conversationId/messages', requireAuth, async (req, res) => {
        const conversationId = normalizeSupportConversationId(req.params?.conversationId);
        if (!conversationId) {
            return res.status(400).json({ message: 'Conversa inválida.' });
        }
        try {
            const { owner, allowed } = await ensureSupportConversationAccess(req, conversationId);
            if (!owner) return res.status(404).json({ message: 'Conversa não encontrada.' });
            if (!allowed) return res.status(403).json({ message: 'Conversa não pertence a este usuário.' });
            const [messages, state, feedbackLogs, satisfactionLogs] = await Promise.all([
                prisma.activityLog.findMany({
                    where: {
                        entity: SUPPORT_ENTITY,
                        entityId: conversationId,
                        action: { in: SUPPORT_CUSTOMER_VISIBLE_ACTIONS },
                        userId: req.user.id,
                    },
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        action: true,
                        description: true,
                        createdAt: true,
                    },
                }),
                getSupportConversationState(conversationId),
                prisma.activityLog.findMany({
                    where: {
                        entity: SUPPORT_ENTITY,
                        entityId: conversationId,
                        userId: req.user.id,
                        action: { in: [SUPPORT_ACTION_FEEDBACK_RESOLVED, SUPPORT_ACTION_FEEDBACK_UNRESOLVED] },
                    },
                    orderBy: { createdAt: 'asc' },
                    select: { action: true, requestMeta: true },
                }),
                prisma.activityLog.findMany({
                    where: {
                        entity: SUPPORT_ENTITY,
                        entityId: conversationId,
                        userId: req.user.id,
                        action: SUPPORT_ACTION_SATISFACTION,
                    },
                    orderBy: { createdAt: 'asc' },
                    select: { requestMeta: true },
                }),
            ]);

            const feedbackByMessage = {};
            for (const feedback of feedbackLogs) {
                const messageId = typeof feedback.requestMeta?.messageId === 'string'
                    ? feedback.requestMeta.messageId
                    : null;
                if (!messageId) continue;
                feedbackByMessage[messageId] = feedback.action === SUPPORT_ACTION_FEEDBACK_RESOLVED
                    ? 'resolved'
                    : 'unresolved';
            }
            const satisfactionByMessage = {};
            for (const ratingLog of satisfactionLogs) {
                const messageId = typeof ratingLog.requestMeta?.messageId === 'string'
                    ? ratingLog.requestMeta.messageId
                    : null;
                const rating = Number(ratingLog.requestMeta?.rating);
                if (messageId && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
                    satisfactionByMessage[messageId] = rating;
                }
            }

            return res.json({
                conversationId,
                assumedByAdmin: state.assumed,
                humanRequested: state.requested,
                resolved: state.resolved,
                knowledgeVersion: SUPPORT_KNOWLEDGE_VERSION,
                feedbackByMessage,
                satisfactionByMessage,
                messages: messages.map((item) => ({
                    id: item.id,
                    role: item.action === SUPPORT_ACTION_USER ? 'user' : 'model',
                    source: item.action === SUPPORT_ACTION_ADMIN
                        ? 'specialist'
                        : [SUPPORT_ACTION_REQUEST, SUPPORT_ACTION_RESOLVED].includes(item.action) ? 'system' : item.action === SUPPORT_ACTION_AI ? 'ai' : 'user',
                    text: item.description || '',
                    createdAt: item.createdAt,
                })),
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: 'Erro ao carregar conversa.' });
        }
    });
}
