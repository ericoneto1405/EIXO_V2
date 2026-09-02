import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    SUPPORT_KNOWLEDGE_UPDATED_AT,
    SUPPORT_KNOWLEDGE_VERSION,
    SUPPORT_MODULE_CATALOG,
    SUPPORT_TOPICS,
} from '../modules/chat/supportKnowledge.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const appSource = readFileSync(path.join(repositoryRoot, 'frontend/App.tsx'), 'utf8');
const sidebarSource = readFileSync(path.join(repositoryRoot, 'frontend/components/Sidebar.tsx'), 'utf8');
const navigationSource = `${appSource}\n${sidebarSource}`;
const errors = [];

const ids = new Set();
for (const topic of SUPPORT_TOPICS) {
    if (!topic.id || ids.has(topic.id)) errors.push(`ID ausente ou repetido: ${topic.id || '(vazio)'}`);
    ids.add(topic.id);
    if (!topic.title || !topic.href || !topic.keywords?.length || !topic.guidance?.length
        || !topic.intent || !topic.requiredModules?.length || !topic.prerequisites?.length
        || !topic.acceptedLinks?.length || !topic.forbiddenElements?.length) {
        errors.push(`Tópico incompleto: ${topic.id}`);
    }

    if (topic.href.startsWith('eixo:view:')) {
        const target = decodeURIComponent(topic.href.slice('eixo:view:'.length).split('?')[0]);
        if (!navigationSource.includes(`'${target}'`) && !navigationSource.includes(`"${target}"`)) {
            errors.push(`Visão interna não encontrada no frontend: ${topic.id} -> ${target}`);
        }
    } else if (topic.href.startsWith('/')) {
        const routePattern = new RegExp(`path=["']${topic.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
        const routeReferenced = appSource.includes(`'${topic.href}'`) || appSource.includes(`"${topic.href}"`);
        if (!routePattern.test(appSource) && !routeReferenced) {
            errors.push(`Rota não encontrada no frontend: ${topic.id} -> ${topic.href}`);
        }
    } else {
        errors.push(`Link não permitido: ${topic.id} -> ${topic.href}`);
    }
}

for (const module of SUPPORT_MODULE_CATALOG) {
    if (!module.name || !module.href || !module.entitlementCodes?.length || !module.benefit) {
        errors.push(`Módulo incompleto no catálogo: ${module.name || '(sem nome)'}`);
    }
    if (!SUPPORT_TOPICS.some((topic) => topic.href === module.href || topic.href.startsWith(`${module.href}?`))) {
        errors.push(`Módulo sem tópico de suporte correspondente: ${module.name}`);
    }
}

const baseSha = String(process.env.SUPPORT_BASE_SHA || '').trim();
if (baseSha && !/^0+$/.test(baseSha)) {
    try {
        const changedFiles = execFileSync('git', ['diff', '--name-only', `${baseSha}...HEAD`], {
            cwd: repositoryRoot,
            encoding: 'utf8',
        }).trim().split('\n').filter(Boolean);
        const knowledgeChanged = changedFiles.includes('server/modules/chat/supportKnowledge.js');
        const supportSensitivePatterns = [
            /^frontend\/App\.tsx$/,
            /^frontend\/components\/PublicLanding\.tsx$/,
            /^frontend\/components\/(Sidebar|Farms|HerdModule|FinanceModule|NutritionModule|ReproModule|EixoAcasalamento)\.tsx$/,
            /^frontend\/components\/(ImportHerdModal|WeighingsTab|AnimalDetailModal|LotDetailModal|TeamPermissions|FieldOccurrences|Operations|ConfinementContracts|PlansPage)\.tsx$/,
            /^server\/modules\/(auth|animals|farms|field|herd|financial|overview|pharmacy|repro|po|users)\//,
            /^server\/modules\/utils\/saasContext\.js$/,
        ];
        const sensitiveChanges = changedFiles.filter((file) => supportSensitivePatterns.some((pattern) => pattern.test(file)));
        if (sensitiveChanges.length && !knowledgeChanged) {
            errors.push(`Mudanças de produto exigem revisão do conhecimento: ${sensitiveChanges.join(', ')}`);
        }
    } catch (error) {
        errors.push(`Não foi possível comparar a base de conhecimento com o commit-base: ${error.message}`);
    }
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(SUPPORT_KNOWLEDGE_UPDATED_AT)) {
    errors.push('SUPPORT_KNOWLEDGE_UPDATED_AT deve usar AAAA-MM-DD.');
}

if (errors.length) {
    console.error('Validação do conhecimento do EIXO Suporte falhou:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
}

console.log(`Conhecimento do EIXO Suporte válido: ${SUPPORT_KNOWLEDGE_VERSION} (${SUPPORT_TOPICS.length} tópicos).`);
