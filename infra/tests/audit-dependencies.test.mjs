import test from 'node:test';
import assert from 'node:assert/strict';
import { advisory, evaluate, contextDigest, contextPaths } from '../audit-dependencies.mjs';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const policy = JSON.parse(readFileSync(new URL('../audit-exception.json', import.meta.url)));
const now = Date.parse(policy.approvedAt) + 1000;
function fixture() {
  const vulnerabilities = {};
  const edges = { braces:[{ name:'braces', dependency:'braces', url:advisory, severity:'high' }],
    chokidar:['braces'],micromatch:['braces'],'fast-glob':['micromatch'],nodemon:['chokidar'],tailwindcss:['chokidar','fast-glob','micromatch'] };
  const lock = { packages:{} };
  for (const [name, nodes] of Object.entries(policy.nodes)) {
    vulnerabilities[name] = { name, severity:'high', nodes, via:structuredClone(edges[name]) };
    for (const node of nodes) lock.packages[node] = {dev:true};
  }
  return { report:{auditReportVersion:2,vulnerabilities,metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:6,critical:0,total:6}}},lock };
}
function check(f, p = policy, digest = policy.contextSha256, date = now, status = 1) {
  return evaluate(f.report,status,p,f.lock,digest,date);
}
test('aceita exclusivamente a cadeia aprovada dentro do prazo', () => assert.equal(check(fixture()).length,6));
test('vence exatamente no prazo e não aceita aprovação futura', () => {
  for (const date of [Date.parse(policy.expiresAt),Date.parse(policy.approvedAt)-1]) assert.throws(()=>check(fixture(),policy,policy.contextSha256,date),/vencida/);
});
test('rejeita prazo maior que sete dias', () => assert.throws(()=>check(fixture(),{...policy,expiresAt:'2099-01-01T00:00:00Z'}),/período/));
test('mudança de contexto bloqueia', () => assert.throws(()=>check(fixture(),policy,'changed'),/Contexto/));
test('outro alerta na mesma biblioteca bloqueia também os pais', () => {
  const f=fixture(); f.report.vulnerabilities.braces.via.push({name:'braces',url:'https://github.com/advisories/OTHER',severity:'high'});
  assert.throws(()=>check(f),/não autorizadas/);
});
test('URL parecida não pode passar', () => {
  const f=fixture(); f.report.vulnerabilities.braces.via[0].url += '/fake'; assert.throws(()=>check(f));
});
test('outra causa no pacote transitivo bloqueia', () => {
  const f=fixture(); f.report.vulnerabilities.tailwindcss.via.push({url:'other',severity:'high'}); assert.throws(()=>check(f));
});
test('dependência de produção não recebe exceção', () => {
  const f=fixture(); f.lock.packages['node_modules/braces'].dev=false; assert.throws(()=>check(f));
});
test('novo caminho de dependência exige revisão', () => {
  const f=fixture(); f.report.vulnerabilities.braces.nodes=['node_modules/other/node_modules/braces']; assert.throws(()=>check(f));
});
test('referência ausente ou ciclo não são ignorados', () => {
  for (const via of [['missing'],['tailwindcss']]) { const f=fixture(); f.report.vulnerabilities.braces.via=via; assert.throws(()=>check(f)); }
});
test('rede e formatos desconhecidos bloqueiam', () => {
  const f=fixture(); for(const status of [null,2,19]) assert.throws(()=>check(f,policy,policy.contextSha256,now,status));
  for (const report of [{}, {...f.report,error:{code:'ENOTFOUND'}},{...f.report,auditReportVersion:3}]) assert.throws(()=>check({...f,report}));
});
test('registros e contagens incompletos bloqueiam', () => {
  const f=fixture(); f.report.vulnerabilities.braces.via=[]; assert.throws(()=>check(f));
  const g=fixture(); g.report.metadata.vulnerabilities.total=0; assert.throws(()=>check(g));
});
test('severidade maior exige revisão', () => {
  const f=fixture(); f.report.vulnerabilities.braces.severity='critical'; f.report.metadata.vulnerabilities.high--; f.report.metadata.vulnerabilities.critical++; assert.throws(()=>check(f));
});
test('sem vulnerabilidades passa sem usar exceção vencida', () => {
  const f=fixture(); f.report.vulnerabilities={};f.report.metadata.vulnerabilities={info:0,low:0,moderate:0,high:0,critical:0,total:0};
  assert.deepEqual(check(f,policy,'changed',Date.parse(policy.expiresAt)+1,0),[]);
});
test('saída de sucesso não pode esconder vulnerabilidades', () => assert.throws(()=>check(fixture(),policy,policy.contextSha256,now,0)));
test('hash inclui conteúdo e nomes; escopo contém proteções analisadas', () => {
  assert.notEqual(contextDigest(['a'],()=> 'old'),contextDigest(['a'],()=> 'new'));
  assert.notEqual(contextDigest(['a'],()=> 'same'),contextDigest(['b'],()=> 'same'));
  const paths=contextPaths(new URL('../..',import.meta.url));
  for(const p of ['package-lock.json','frontend/tailwind.config.cjs','ecosystem.config.js','server/index.js','infra/deploy.sh']) assert.ok(paths.includes(p));
});

test('CLI executa via caminho simbólico e falha com JSON inválido', () => {
  const temp=mkdtempSync(join(tmpdir(),'eixo-audit-cli-'));
  try {
    const root=join(temp,'repo'); mkdirSync(join(root,'infra'),{recursive:true});
    const bin=join(temp,'bin'); mkdirSync(bin);
    const f=fixture();
    writeFileSync(join(root,'package-lock.json'),JSON.stringify(f.lock));
    execFileSync('git',['init','-q'],{cwd:root});
    execFileSync('git',['add','package-lock.json'],{cwd:root});
    const start=Date.now()-1000;
    const localPolicy={...policy,approvedAt:new Date(start).toISOString(),expiresAt:new Date(start+7*86400000).toISOString(),contextSha256:contextDigest(contextPaths(root),p=>readFileSync(join(root,p)))};
    writeFileSync(join(root,'infra/audit-exception.json'),JSON.stringify(localPolicy));
    copyFileSync(new URL('../audit-dependencies.mjs',import.meta.url),join(root,'infra/audit-dependencies.mjs'));
    const report=join(temp,'report.json');writeFileSync(report,JSON.stringify(f.report));
    writeFileSync(join(bin,'npm'),'#!/bin/sh\ncat "$AUDIT_FIXTURE"\nexit 1\n',{mode:0o755});
    const alias=join(temp,'alias');symlinkSync(root,alias,'dir');
    const run=()=>spawnSync(process.execPath,[join(alias,'infra/audit-dependencies.mjs')],{env:{...process.env,PATH:bin+':'+process.env.PATH,AUDIT_FIXTURE:report},encoding:'utf8'});
    const good=run();assert.equal(good.status,0,good.stderr);assert.match(good.stdout,/EXCEÇÃO TEMPORÁRIA/);
    writeFileSync(report,'invalid json');const bad=run();assert.equal(bad.status,1);assert.match(bad.stderr,/ERRO na auditoria/);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
