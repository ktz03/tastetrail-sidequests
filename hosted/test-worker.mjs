import assert from 'node:assert/strict';
import './source/test/mock-sidequests.mjs';
import worker from './worker/index.js';

const env={QLOO_API_KEY:'test-sidequest-key'};
for (const path of ['/','/index.html','/style.css','/app.js']) {
  const get=await worker.fetch(new Request('https://tastetrail.example'+path),env);
  const head=await worker.fetch(new Request('https://tastetrail.example'+path,{method:'HEAD'}),env);
  assert.equal(head.status,get.status); assert.equal(head.headers.get('content-type'),get.headers.get('content-type')); assert.equal(await head.text(),'');
}
async function call(path,body,customEnv=env){ const req=new Request('https://tastetrail.example'+path,{method:'POST',headers:{'content-type':'application/json','origin':'https://tastetrail.example'},body:JSON.stringify(body)}); const res=await worker.fetch(req,customEnv); return [res.status,await res.json()]; }
const [s1,a]=await call('/api/search',{query:'Alpha'});
const [s2,b]=await call('/api/search',{query:'Beta'});
assert.equal(s1,200); assert.equal(s2,200); assert.equal(a.mode,'live');
const [ps,p]=await call('/api/plan',{a:a.entities[0],b:b.entities[0],style:'exchange'});
assert.equal(ps,200); assert.equal(p.mode,'live'); assert.equal(p.plan.length,3);
const [rs,r]=await call('/api/repair',{sessionId:p.sessionId,locked:[p.plan[0].id],rejected:[],replaceSlots:['movie']});
assert.equal(rs,200); assert.equal(r.plan[0].id,p.plan[0].id); assert.equal(r.plan[2].id,p.plan[2].id); assert.notEqual(r.plan[1].id,p.plan[1].id); assert.equal(r.revision,2); assert.notEqual(r.sessionId,p.sessionId);
const [bad]=await call('/api/repair',{sessionId:p.sessionId.slice(0,-5)+'aaaaa',locked:[],rejected:[]}); assert.equal(bad,400);
const [ds,d]=await call('/api/search',{query:'Alpha'},{}); assert.equal(ds,200); assert.equal(d.mode,'demo');
console.log('Worker mock: live search, plan, cross-request lock/swap, token tamper rejection, and synthetic mode passed.');
