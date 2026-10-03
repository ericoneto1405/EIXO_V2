#!/usr/bin/env node
// A auditoria continua completa; somente a causa aprovada pode ser tolerada.
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const advisory = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const configuration = new Set([
  'package.json', 'package-lock.json', 'frontend/package.json', 'server/package.json',
  'frontend/tailwind.config.cjs', 'frontend/postcss.config.cjs', 'frontend/vite.config.ts',
  'ecosystem.config.js', 'infra/deploy.sh', 'infra/deploy-plan.sh',
  '.github/workflows/ci.yml', '.github/workflows/deploy.yml',
]);

export function contextPaths(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(p => configuration.has(p) || /^server\/.*\.(?:js|mjs|cjs)$/.test(p)).sort();
}
export function contextDigest(paths, read) {
  const hash = createHash('sha256');
  for (const path of paths) hash.update(path).update('\0').update(read(path)).update('\0');
  return hash.digest('hex');
}

export function evaluate(report, status, policy, lock, digest, now = Date.now()) {
  if (![0, 1].includes(status) || report?.error || report?.auditReportVersion !== 2
      || !report.vulnerabilities || Array.isArray(report.vulnerabilities)
      || typeof report.vulnerabilities !== 'object') throw new Error('Auditoria falhou ou retornou formato inválido.');
  const entries = Object.entries(report.vulnerabilities);
  const counts = report.metadata?.vulnerabilities;
  if (!counts || counts.total !== entries.length
      || levels.some(level => counts[level] !== entries.filter(([, v]) => v.severity === level).length)) {
    throw new Error('Contagens da auditoria inconsistentes.');
  }
  if ((status === 0 && entries.some(([, v]) => levels.indexOf(v.severity) >= 2))
      || (status === 1 && entries.length === 0)) throw new Error('Código de saída inconsistente.');
  for (const [name, value] of entries) {
    if (value.name !== name || !levels.includes(value.severity) || !Array.isArray(value.via)
        || !value.via.length || !Array.isArray(value.nodes) || !value.nodes.length) {
      throw new Error('Registro incompleto na auditoria.');
    }
  }
  const onlyApprovedCause = (name, seen = new Set()) => {
    if (seen.has(name)) return false;
    const value = report.vulnerabilities[name];
    const allowed = policy.nodes?.[name];
    if (!value || value.severity !== 'high' || !allowed || !value.nodes.every(node => allowed.includes(node)
        && lock.packages?.[node]?.dev === true)) return false;
    const next = new Set([...seen, name]);
    return value.via.every(cause => typeof cause === 'string'
      ? onlyApprovedCause(cause, next)
      : name === 'braces' && cause?.name === 'braces' && cause?.dependency === 'braces'
        && cause?.url === advisory && cause?.severity === 'high');
  };
  const waived = [];
  const blocked = [];
  for (const [name, value] of entries) {
    if (levels.indexOf(value.severity) < 2) continue; // Mantém o limiar moderate existente.
    (onlyApprovedCause(name) ? waived : blocked).push(name);
  }
  if (blocked.length) throw new Error(`Vulnerabilidades não autorizadas: ${blocked.join(', ')}.`);
  if (waived.length) {
    const start = Date.parse(policy.approvedAt);
    const end = Date.parse(policy.expiresAt);
    if (policy.advisory !== advisory || !Number.isFinite(start) || !Number.isFinite(end)
        || end - start !== 7 * 24 * 60 * 60 * 1000 || now < start || now >= end) {
      throw new Error('Exceção vencida ou período inválido; nova decisão humana obrigatória.');
    }
    if (digest !== policy.contextSha256) throw new Error('Contexto alterado; revisar exposição antes de aplicar a exceção.');
  }
  return waived;
}

export function main(root = resolve(fileURLToPath(new URL('..', import.meta.url)))) {
  try {
    const policy = JSON.parse(readFileSync(resolve(root, 'infra/audit-exception.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
    const digest = contextDigest(contextPaths(root), p => readFileSync(resolve(root, p)));
    const result = spawnSync('npm', ['audit', '--json', '--audit-level=moderate', '--fetch-retries=0', '--fetch-timeout=15000'],
      { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.signal) throw new Error('Não foi possível concluir a auditoria npm.');
    const waived = evaluate(JSON.parse(result.stdout), result.status, policy, lock, digest);
    console.log(waived.length
      ? `EXCEÇÃO TEMPORÁRIA GHSA-vfj7-8cjw-p6xm: ${waived.length} dependências; vence ${policy.expiresAt}. VPS ainda exige conferência antes de publicar.`
      : 'Auditoria OK: nenhuma exceção utilizada.');
    return 0;
  } catch (error) {
    console.error(`ERRO na auditoria: ${error.message}`);
    return 1;
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
