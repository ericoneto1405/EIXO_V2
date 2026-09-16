import test from 'node:test';
import assert from 'node:assert/strict';

// Opt-in: servidor local iniciado exclusivamente com o banco descartável.
const base = process.env.EIXO_PO_TEST_URL;
test('cadastro único, estoque e rejeição de referências legadas pela API', { skip: !base }, async () => {
    assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):3021$/);
    const login = await fetch(`${base}/auth/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'po-cleanup@example.invalid',password:'TestePO2026!'}) });
    assert.equal(login.status,200, await login.clone().text());
    const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
    async function request(path,body,method=body?'POST':'GET') {
        const r=await fetch(base+path,{method,headers:{cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
        const data=await r.json().catch(()=>null); return {status:r.status,data};
    }
    const farmId='po-test-farm';
    for(const path of [`/animals?farmId=${farmId}`,`/lots?farmId=${farmId}`,`/po/semen?farmId=${farmId}`,`/po/embryos?farmId=${farmId}`,`/farms/${farmId}/weighing-sessions`,`/farms/${farmId}/weighings`]) {
        const r=await request(path);assert.equal(r.status,200,JSON.stringify({path,...r}));
    }
    assert.equal((await request('/po/animals?farmId='+farmId)).status,404);
    assert.equal((await request('/po/semen',{farmId,bullPoAnimalId:'old-animal'})).status,400);
    assert.equal((await request(`/farms/${farmId}/weighings?herdType=PO`)).status,400);
    assert.equal((await request('/animals?farmId=unowned-farm')).status,404);
    const suffix=Date.now();
    for(const tipoCadastro of ['PO','MESTICO']) {
        const r=await request('/animals',{farmId,brinco:`TEST-${tipoCadastro}-${suffix}`,raca:'Nelore',sexo:'MACHO',tipoCadastro,dataNascimento:'2025-01-10'});
        assert.equal(r.status,201,JSON.stringify(r));
        const list=await request('/animals?farmId='+farmId);
        assert.ok(list.data.animals.some(a=>a.brinco===`TEST-${tipoCadastro}-${suffix}`&&a.tipoCadastro===tipoCadastro));
    }
    const semen=await request('/po/semen',{farmId,lote:`TEST-${suffix}`,bullAnimalId:'keep-po',dosesTotal:5,dosesDisponiveis:5});
    assert.equal(semen.status,201,JSON.stringify(semen));
    assert.equal((await request(`/po/semen/${semen.data.batch.id}`,{bullPoAnimalId:'old'},'PATCH')).status,400);
    const template=await fetch(base+`/herd/import/template?farmId=${farmId}`,{headers:{cookie}});
    assert.equal(template.status,200);
});
