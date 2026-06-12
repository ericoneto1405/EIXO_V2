import crypto from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PrismaClient } from '@prisma/client';
import { GOOGLE_API_KEY, CHAT_RATE_WINDOW_MS, CHAT_RATE_MAX_PER_USER, CHAT_BURST_WINDOW_MS, CHAT_BURST_MAX_PER_USER } from '../config/env.js';
import { chatRateAttempts, chatBurstAttempts, isWindowRateLimited, registerWindowAttempt, getWindowRetryAfterSeconds } from '../middlewares/rateLimiter.js';
import { escapeHtml } from '../utils/formatters.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { normalizeUserModules, getDerivedAccessType } from '../utils/saasContext.js';
import { buildFarmScopeFilter } from '../middlewares/farmScope.js';
const prisma = new PrismaClient();

if (!GOOGLE_API_KEY) {
    console.warn('GOOGLE_API_KEY is not set. Gemini API will not be available.');
}
const EIXO_SUPORTE_SYSTEM_PROMPT = `Você é o Eixo Suporte, assistente virtual do sistema EIXO (pecuária de corte).

Seu objetivo é orientar o usuário no uso do sistema com respostas simples, práticas e curtas.

## Tom e estilo
- Use português do Brasil, linguagem simples e direta.
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
- Se não tiver certeza, diga isso com transparência e oriente a falar com o suporte humano.
- Use o contexto do atendimento para personalizar a resposta.
- Primeiro ajude o cliente a resolver a dúvida. Depois, se fizer sentido, sugira módulo pago.
- Seja vendedor consultivo: conecte a dor do cliente ao benefício real do módulo.
- Não seja insistente. Uma sugestão comercial curta é suficiente.
- Se a resposta já tiver link direto para a tela/aba certa, não pergunte "Quer que eu te mostre onde isso entra no EIXO?".
- Se o cliente responder apenas "sim", "quero" ou algo parecido depois dessa pergunta, não repita todo o passo a passo. Entregue o link direto e diga uma frase curta de orientação.

## Escopo do sistema (resumo)
- Estrutura da Fazenda: cadastro de fazendas e pastos.
- Manejo do Rebanho: cadastro de animais, importação por planilha, pesagens, lotes e eventos.
- Financeiro: lançamentos, contas a pagar/receber, fluxo de caixa e DRE.
- Nutrição: disponível conforme plano.
- Reprodução e Eixo Acasalamento: disponíveis conforme plano.
- EIXO Campo: aplicativo de manejo no campo, conforme acesso configurado.
- Módulos bloqueados aparecem com cadeado e podem exigir upgrade.

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

## Exemplos de resposta boa
Cliente: "Como registro pesagem?"
Resposta: "Para registrar uma pesagem, vá em [Animais](eixo:view:Rebanho%20Comercial?tab=animals), localize o animal, clique no botão de ações e abra a aba Pesagens."

Cliente: "Como importar minha planilha?"
Resposta: "A importação fica em [Importar planilha](eixo:view:Rebanho%20Comercial?tab=animals), dentro da aba Animais. Depois revise as colunas e confirme a importação."

Cliente: "Comocontrolo dieta?"
Resposta: "Esse controle fica melhor em [Nutrição](eixo:view:Nutri%C3%A7%C3%A3o). Ele ajuda a acompanhar dieta, consumo e custo por lote. Se o módulo não estiver liberado, veja [Ver planos](/planos)."

Cliente: "Sim"
Resposta, se a conversa anterior pediu para mostrar o caminho: "Claro. Clique em [Animais](eixo:view:Rebanho%20Comercial?tab=animals) e localize o animal na lista."

## Evite resposta ruim
- Não responda só "Acesse Manejo do Rebanho > Animais" se puder usar link.
- Não repita o mesmo passo a passo quando o cliente apenas confirmou "sim".
- Não finalize todas as respostas com pergunta genérica.
- Não coloque vários links soltos no fim da mensagem.

## Dúvidas comuns (base de orientação)

**Como cadastrar uma fazenda?**
1. Acesse [Estrutura da Fazenda](eixo:view:Fazendas).
2. Clique em "Adicionar fazenda".
3. Preencha os dados básicos e salve.
4. Depois, cadastre os pastos da fazenda.

**Como importar animais por planilha?**
1. Acesse [Manejo do Rebanho](eixo:view:Rebanho%20Comercial) e vá para a aba [Animais](eixo:view:Rebanho%20Comercial?tab=animals).
2. Clique em "Importar planilha".
3. Revise o mapeamento das colunas.
4. Confirme a importação.

**Como registrar pesagem?**
1. Em [Manejo do Rebanho](eixo:view:Rebanho%20Comercial), vá para a aba [Animais](eixo:view:Rebanho%20Comercial?tab=animals) e localize o animal.
2. Clique no botão de ações (⋮).
3. Abra a aba "Pesagens".
4. Registre data e peso.

**Como lançar despesa?**
1. Acesse [Financeiro](eixo:view:Financeiro) > "Lançamentos".
2. Clique em "Novo lançamento".
3. Selecione tipo "Saída", informe categoria, valor e data.
4. Salve.

**Como funciona integração com Financeiro nos eventos do rebanho?**
- Eventos com valor informado (ex.: compra e venda) podem gerar lançamento financeiro automaticamente.

## Encerramento
- Se o usuário relatar erro técnico, peça print/etapas e oriente acionar o suporte humano.
- Foque sempre em ajudar a concluir a tarefa dentro do sistema EIXO.`;

const genAI = GOOGLE_API_KEY ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: EIXO_SUPORTE_SYSTEM_PROMPT,
}) : null;

export const SUPPORT_ENTITY = 'SupportChat';
const SUPPORT_ACTION_USER = 'chat_message_user';
const SUPPORT_ACTION_AI = 'chat_message_ai';
export const SUPPORT_ACTION_ADMIN = 'chat_message_admin';
export const SUPPORT_ACTION_ASSUME = 'chat_assumed';
export const SUPPORT_ACTION_RELEASE = 'chat_released';
const SUPPORT_ALERT_TO_EMAIL = process.env.SUPPORT_ALERT_TO_EMAIL || process.env.RESEND_FROM_EMAIL || '';
const SUPPORT_ALERT_COOLDOWN_MS = Number(process.env.SUPPORT_ALERT_COOLDOWN_MS) || 15 * 60 * 1000;
const supportAlertCooldownStore = new Map();
const SUPPORT_MODULE_CATALOG = [
    {
        name: 'Estrutura da Fazenda',
        href: 'eixo:view:Fazendas',
        entitlementCodes: ['CORE'],
        benefit: 'organiza fazendas, pastos e base operacional.',
        salesTrigger: 'cadastro de fazenda, pasto, mapa ou estrutura.',
    },
    {
        name: 'Manejo do Rebanho',
        href: 'eixo:view:Rebanho%20Comercial',
        entitlementCodes: ['CORE'],
        benefit: 'centraliza animais, lotes, importação, pesagens e eventos.',
        salesTrigger: 'controle de animais, planilhas, peso, compra, venda ou lotes.',
    },
    {
        name: 'Financeiro',
        href: 'eixo:view:Financeiro',
        entitlementCodes: ['CORE', 'EIXO_GESTAO', 'EIXO_DECISAO'],
        benefit: 'liga lançamentos, despesas, receitas e visão econômica da fazenda.',
        salesTrigger: 'despesas, receitas, lucro, fluxo de caixa, compra ou venda.',
    },
    {
        name: 'Nutrição',
        href: 'eixo:view:Nutri%C3%A7%C3%A3o',
        entitlementCodes: ['NUTRITION', 'EIXO_NUTRITION', 'EIXO_GESTAO', 'EIXO_DECISAO'],
        benefit: 'controla dieta, consumo, custo por lote e ingredientes em risco.',
        salesTrigger: 'cocho, dieta, trato, consumo, suplemento, ração ou custo alimentar.',
    },
    {
        name: 'Reprodução',
        href: '/genetics/reproducao',
        entitlementCodes: ['GENETICS', 'PO', 'EIXO_DECISAO'],
        benefit: 'organiza coberturas, diagnósticos, partos e KPIs reprodutivos.',
        salesTrigger: 'prenhez, parto, matriz, cobertura, IATF ou estação de monta.',
    },
    {
        name: 'Eixo Acasalamento',
        href: '/genetics/acasalamento',
        entitlementCodes: ['GENETICS', 'EIXO_DECISAO'],
        benefit: 'apoia decisões de acasalamento com histórico e objetivo produtivo.',
        salesTrigger: 'acasalamento, touro, sêmen, botijão, matriz ou genética.',
    },
    {
        name: 'Gestão Comercial',
        href: 'eixo:view:Gest%C3%A3o%20Comercial',
        entitlementCodes: ['EIXO_DECISAO'],
        benefit: 'apoia negociação, mercado, oportunidades e decisão de venda.',
        salesTrigger: 'venda, mercado, comprador, negociação, arroba ou margem.',
    },
    {
        name: 'Botijão de Sêmen',
        href: 'eixo:view:Estoque%20e%20Equipamentos',
        entitlementCodes: ['CORE', 'GENETICS', 'EIXO_DECISAO'],
        benefit: 'organiza estoque de sêmen usado no Eixo Acasalamento.',
        salesTrigger: 'sêmen, botijão, doses, estoque de touro ou acasalamento.',
    },
];
const SUPPORT_INTERNAL_LINKS = [
    ...SUPPORT_MODULE_CATALOG.map((module) => ({ label: module.name, href: module.href })),
    { label: 'Animais', href: 'eixo:view:Rebanho%20Comercial?tab=animals' },
    { label: 'Adicionar animal', href: 'eixo:view:Rebanho%20Comercial?tab=animals' },
    { label: 'Importar planilha', href: 'eixo:view:Rebanho%20Comercial?tab=animals' },
    { label: 'Lotes', href: 'eixo:view:Rebanho%20Comercial?tab=lots' },
    { label: 'Criar lote', href: 'eixo:view:Rebanho%20Comercial?tab=lots' },
    { label: 'Pesagens', href: 'eixo:view:Rebanho%20Comercial?tab=weighings' },
    { label: 'Registrar pesagem', href: 'eixo:view:Rebanho%20Comercial?tab=animals' },
    { label: 'Visão geral do rebanho', href: 'eixo:view:Rebanho%20Comercial?tab=overview' },
    { label: 'Cadastrar fazenda', href: 'eixo:view:Fazendas' },
    { label: 'Cadastrar pasto', href: 'eixo:view:Fazendas' },
    { label: 'Lançar despesa', href: 'eixo:view:Financeiro' },
    { label: 'Fluxo de caixa', href: 'eixo:view:Financeiro' },
    { label: 'Ver planos', href: '/planos' },
];

const SUPPORT_PLAN_LABELS = {
    GRATIS: 'Grátis',
    EIXO_GESTAO: 'EIXO Gestão',
    EIXO_DECISAO: 'EIXO Decisão',
};

const hasSupportModuleAccess = (module, entitlements) => {
    const normalized = new Set((entitlements || []).map((item) => String(item || '').trim().toUpperCase()));
    return module.entitlementCodes.some((code) => normalized.has(code));
};

const formatSupportList = (values) => {
    const filtered = (values || []).map((item) => String(item || '').trim()).filter(Boolean);
    return filtered.length ? filtered.join(', ') : 'não informado';
};

const buildSupportContextText = async (req, { farmId = null, currentPath = null } = {}) => {
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
            select: { id: true, name: true, city: true },
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
        `Usuário: ${req.user?.name || 'não informado'} (${req.user?.email || 'sem e-mail'})`,
        `Organização: ${req.saas?.organization?.name || 'não informada'}`,
        `Plano atual: ${planLabel}`,
        `Status da assinatura: ${subscription?.status || req.saas?.billingAccessState || 'não informado'}`,
        `Entitlements ativos: ${formatSupportList(entitlements)}`,
        `Módulos do usuário: ${formatSupportList(allowedModules)}`,
        `Módulos ativos para orientar uso: ${formatSupportList(activeModules)}`,
        `Módulos bloqueados/oportunidade comercial: ${formatSupportList(lockedModules)}`,
        `Fazenda selecionada: ${farm ? `${farm.name}${farm.city ? ` (${farm.city})` : ''}` : 'não selecionada ou não encontrada'}`,
        `Tela atual: ${currentPath || 'não informada'}`,
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
    requestMeta = null,
}) => {
    try {
        await prisma.activityLog.create({
            data: {
                id: crypto.randomUUID(),
                userId: userIdOverride || req.user.id,
                organizationId: req.saas?.organizationId || null,
                method: req.method,
                path: req.originalUrl || req.path || '',
                action,
                entity: SUPPORT_ENTITY,
                entityId: conversationId,
                description: message,
                requestMeta: requestMeta || undefined,
                statusCode: 200,
                ip: req.ip || null,
                userAgent: req.get('user-agent') || null,
            },
        });
    } catch (error) {
        console.error('Erro ao registrar log de suporte:', error);
    }
};

export const getSupportConversationState = async (conversationId) => {
    const latestControl = await prisma.activityLog.findFirst({
        where: {
            entity: SUPPORT_ENTITY,
            entityId: conversationId,
            action: { in: [SUPPORT_ACTION_ASSUME, SUPPORT_ACTION_RELEASE] },
        },
        orderBy: { createdAt: 'desc' },
    });

    if (!latestControl || latestControl.action === SUPPORT_ACTION_RELEASE) {
        return { assumed: false, assumedByUserId: null };
    }

    const requestMeta = latestControl.requestMeta && typeof latestControl.requestMeta === 'object'
        ? latestControl.requestMeta
        : {};
    return {
        assumed: true,
        assumedByUserId: requestMeta?.adminUserId || latestControl.userId || null,
    };
};

const shouldTriggerSupportNoAnswerFallback = (text) => {
    const normalized = String(text || '').trim().toLowerCase();
    if (!normalized) return true;
    if (normalized.length < 20) return true;
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

const sendSupportAlertEmail = async (req, {
    conversationId,
    farmId = null,
    reason,
    userMessage,
}) => {
    if (!SUPPORT_ALERT_TO_EMAIL) return;
    const cooldownKey = `${conversationId}:${reason}`;
    const lastSentAt = supportAlertCooldownStore.get(cooldownKey) || 0;
    if (Date.now() - lastSentAt < SUPPORT_ALERT_COOLDOWN_MS) return;

    try {
        const subject = `[EIXO] Alerta de suporte (${reason})`;
        const safeMessage = escapeHtml(String(userMessage || '').slice(0, 2000));
        const userEmail = escapeHtml(String(req.user?.email || 'não informado'));
        const orgId = escapeHtml(String(req.saas?.organizationId || 'não informado'));
        const farmLabel = farmId ? escapeHtml(String(farmId)) : 'chat genérico';
        const body = `
            <div style="font-family: Arial, sans-serif; color: #1f2937;">
                <h2 style="margin: 0 0 12px;">Alerta automático do EIXO Suporte</h2>
                <p><strong>Motivo:</strong> ${escapeHtml(reason)}</p>
                <p><strong>Conversa:</strong> ${escapeHtml(conversationId)}</p>
                <p><strong>Usuário:</strong> ${userEmail}</p>
                <p><strong>Organização:</strong> ${orgId}</p>
                <p><strong>Fazenda:</strong> ${farmLabel}</p>
                <p><strong>Mensagem do usuário:</strong></p>
                <blockquote style="margin: 0; padding: 10px; border-left: 3px solid #d1d5db; background: #f9fafb;">
                    ${safeMessage}
                </blockquote>
            </div>
        `;
        supportAlertCooldownStore.set(cooldownKey, Date.now());
    } catch (error) {
        console.error('Erro ao enviar alerta de suporte por e-mail:', error);
    }
};

export function registerChatRoutes(app) {
    app.post('/api/chat/send-message', requireAuth, async (req, res) => {
        const { message, history, conversationId, farmId, currentPath } = req.body || {};
        if (!message) {
            return res.status(400).json({ message: 'Mensagem vazia.' });
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

        const conversationKey = String(conversationId || '').trim() || crypto.randomUUID();
        const normalizedFarmId = typeof farmId === 'string' && farmId.trim() ? farmId.trim() : null;
        const normalizedCurrentPath = typeof currentPath === 'string' && currentPath.trim()
            ? currentPath.trim().slice(0, 160)
            : null;

        await createSupportLog(req, {
            conversationId: conversationKey,
            action: SUPPORT_ACTION_USER,
            message: String(message).slice(0, 2000),
            requestMeta: { role: 'user', farmId: normalizedFarmId, currentPath: normalizedCurrentPath },
        });

        if (!model) {
            const fallbackText = 'Suporte automático indisponível no momento. Nosso time foi avisado e responderá por aqui.';
            await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_AI,
                message: fallbackText,
                requestMeta: { role: 'ai', farmId: normalizedFarmId, fallbackReason: 'ai_unavailable' },
            });
            await sendSupportAlertEmail(req, {
                conversationId: conversationKey,
                farmId: normalizedFarmId,
                reason: 'ai_unavailable',
                userMessage: String(message),
            });
            return res.json({ response: fallbackText, conversationId: conversationKey, assumedByAdmin: false });
        }

        try {
            const state = await getSupportConversationState(conversationKey);
            if (state.assumed) {
                return res.json({
                    response: 'Seu atendimento foi assumido por um especialista do suporte. Aguarde a resposta aqui no chat.',
                    conversationId: conversationKey,
                    assumedByAdmin: true,
                });
            }

            const supportContext = await buildSupportContextText(req, {
                farmId: normalizedFarmId,
                currentPath: normalizedCurrentPath,
            });
            const chat = model.startChat({
                history: history || [],
            });

            const result = await chat.sendMessage(`${supportContext}\n\nMensagem do cliente:\n${message}`);
            const response = await result.response;
            const text = response.text();
            if (shouldTriggerSupportNoAnswerFallback(text)) {
                const fallbackText = 'Não consegui responder essa dúvida com segurança agora. Nosso time foi avisado e continuará seu atendimento por aqui.';
                await createSupportLog(req, {
                    conversationId: conversationKey,
                    action: SUPPORT_ACTION_AI,
                    message: fallbackText,
                    requestMeta: { role: 'ai', farmId: normalizedFarmId, fallbackReason: 'low_confidence' },
                });
                await sendSupportAlertEmail(req, {
                    conversationId: conversationKey,
                    farmId: normalizedFarmId,
                    reason: 'low_confidence',
                    userMessage: String(message),
                });
                return res.json({ response: fallbackText, conversationId: conversationKey, assumedByAdmin: false });
            }

            await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_AI,
                message: String(text).slice(0, 2000),
                requestMeta: { role: 'ai', farmId: normalizedFarmId },
            });

            return res.json({ response: text, conversationId: conversationKey, assumedByAdmin: false });
        } catch (error) {
            console.error('Erro ao comunicar com a API do Gemini:', error);
            const fallbackText = 'Suporte automático indisponível no momento. Nosso time foi avisado e responderá por aqui.';
            await createSupportLog(req, {
                conversationId: conversationKey,
                action: SUPPORT_ACTION_AI,
                message: fallbackText,
                requestMeta: { role: 'ai', farmId: normalizedFarmId, fallbackReason: 'ai_error' },
            });
            await sendSupportAlertEmail(req, {
                conversationId: conversationKey,
                farmId: normalizedFarmId,
                reason: 'ai_error',
                userMessage: String(message),
            });
            return res.json({ response: fallbackText, conversationId: conversationKey, assumedByAdmin: false });
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
                    action: { in: [SUPPORT_ACTION_USER, SUPPORT_ACTION_AI, SUPPORT_ACTION_ADMIN] },
                    userId: req.user.id,
                    entityId: { not: null },
                },
                orderBy: { createdAt: 'desc' },
                take: 2000,
                select: {
                    id: true,
                    entityId: true,
                    description: true,
                    createdAt: true,
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
                const farmIdFromLog = typeof requestMeta?.farmId === 'string' && requestMeta.farmId.trim()
                    ? requestMeta.farmId.trim()
                    : null;

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
        const { conversationId } = req.params;
        if (!conversationId) {
            return res.status(400).json({ message: 'Conversa inválida.' });
        }
        try {
            const [messages, state] = await Promise.all([
                prisma.activityLog.findMany({
                    where: {
                        entity: SUPPORT_ENTITY,
                        entityId: conversationId,
                        action: { in: [SUPPORT_ACTION_USER, SUPPORT_ACTION_AI, SUPPORT_ACTION_ADMIN] },
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
            ]);

            return res.json({
                conversationId,
                assumedByAdmin: state.assumed,
                messages: messages.map((item) => ({
                    id: item.id,
                    role: item.action === SUPPORT_ACTION_USER ? 'user' : 'model',
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
