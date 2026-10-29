import assert from 'node:assert/strict';
import './source/test/mock-sidequests.mjs';
import search from './api/search.js';
import plan from './api/plan.js';
import repair from './api/repair.js';
import status from './api/status.js';

process.env.QLOO_API_KEY = 'test-sidequest-key';
const base = 'https://tastetrail.example';
async function send(handler, path, data) {
  const req = new Request(base + path, { method:'POST', headers:{'content-type':'application/json', origin:base,'x-vercel-forwarded-for':'198.51.100.5'}, body:JSON.stringify(data) });
  const res = await handler.fetch(req);
  return [res.status, await res.json()];
}
const check = await status.fetch(new Request(base + '/api/status'));
assert.deepEqual(await check.json(), {configured:true, planner:'deterministic'});
const [as,a] = await send(search, '/api/search', {query:'Alpha'});
const [bs,b] = await send(search, '/api/search', {query:'Beta'});
assert.equal(as,200); assert.equal(bs,200); assert.equal(a.mode,'live');
const [ps,p] = await send(plan, '/api/plan', {a:a.entities[0],b:b.entities[0],style:'exchange'});
assert.equal(ps,200); assert.equal(p.plan.length,3);
const [rs,r] = await send(repair, '/api/repair', {sessionId:p.sessionId,locked:[p.plan[0].id],rejected:[],replaceSlots:['movie']});
assert.equal(rs,200); assert.equal(r.plan[0].id,p.plan[0].id); assert.equal(r.plan[2].id,p.plan[2].id); assert.notEqual(r.plan[1].id,p.plan[1].id);
const [invalid] = await send(repair, '/api/repair', {sessionId:p.sessionId.slice(0,-5)+'aaaaa',locked:[],rejected:[]});
assert.equal(invalid,400);
delete process.env.QLOO_API_KEY;
const [ds,d] = await send(search, '/api/search', {query:'Alpha'});
assert.equal(ds,200); assert.equal(d.mode,'demo');
const blocked = await search.fetch(new Request(base+'/api/search', {method:'POST',headers:{origin:'https://other.example','content-type':'application/json'},body:JSON.stringify({query:'Alpha'})}));
assert.equal(blocked.status,403);
console.log('Vercel adapters: simulated search, plan, lock/swap, token tampering, demo mode and origin rejection passed.');
