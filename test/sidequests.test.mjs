import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, isAbsolute, join } from 'node:path';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = 'test-sidequest-key';
const seedA = { id: 'seed-a', name: 'Alpha', type: 'artist' };
const seedB = { id: 'seed-b', name: 'Beta', type: 'artist' };

async function start(port, withKey) {
  const isolated = await mkdtemp(join(tmpdir(), 'tastetrail-sidequest-'));
  const rel = relative(resolve(tmpdir()), resolve(isolated));
  if (!rel.startsWith('tastetrail-sidequest-') || isAbsolute(rel) || rel.includes('..')) throw new Error('Unexpected temporary directory');
  await mkdir(join(isolated, 'test'));
  await copyFile(join(root, 'server.mjs'), join(isolated, 'server.mjs'));
  await copyFile(join(root, 'sidequests.mjs'), join(isolated, 'sidequests.mjs'));
  await copyFile(join(root, 'test', 'mock-sidequests.mjs'), join(isolated, 'test', 'mock-sidequests.mjs'));
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1' };
  if (withKey) env.QLOO_API_KEY = key; else delete env.QLOO_API_KEY;
  const args = withKey ? ['--import', './test/mock-sidequests.mjs', 'server.mjs'] : ['server.mjs'];
  const child = spawn(process.execPath, args, { cwd: isolated, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error(stderr || 'Server exited early');
      try { if ((await fetch(`http://127.0.0.1:${port}/api/status`)).ok) return { child, isolated, port }; } catch {}
      await delay(100);
    }
    throw new Error('Server did not start');
  } catch (error) { child.kill(); await rm(isolated, { recursive: true, force: true }); throw error; }
}
async function stop({ child, isolated }) {
  child.kill();
  if (child.exitCode === null) await once(child, 'exit');
  await rm(isolated, { recursive: true, force: true });
}
async function post(port, endpoint, body) {
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}
function assertNoKey(value) { assert.doesNotMatch(JSON.stringify(value), /test-sidequest-key/); }

test('synthetic planning is visibly labeled and does not pretend to be Qloo data', async () => {
  const app = await start(31871, false);
  try {
    const status = await (await fetch(`http://127.0.0.1:${app.port}/api/status`)).json();
    assert.equal(status.configured, false);
    assert.equal(status.planner, 'deterministic');
    const found = await post(app.port, '/api/search', { query: 'Alpha' });
    assert.equal(found.status, 200);
    assert.equal(found.data.mode, 'demo');
    assert.ok(Array.isArray(found.data.entities));
    assert.match(JSON.stringify(found.data), /example|synthetic|fictional|demo/i);
    const plan = await post(app.port, '/api/plan', {a: found.data.entities[0], b: found.data.entities[1], style: 'exchange'});
    assert.equal(plan.status, 200);
    assert.equal(plan.data.mode, 'demo');
    assert.equal(plan.data.plan.length, 3);
    assert.ok(plan.data.plan.every(x => x.id.startsWith('demo-')));
    assert.match(plan.data.warning, /fictional/i);
    const replacement = await post(app.port, '/api/repair', {sessionId: plan.data.sessionId, locked: [plan.data.plan[0].id], rejected: [plan.data.plan[1].id], replaceSlots:['movie']});
    assert.equal(replacement.status, 200);
    assert.equal(replacement.data.mode, 'demo');
    assert.equal(replacement.data.plan[0].id, plan.data.plan[0].id);
    assert.notEqual(replacement.data.plan[1].id, plan.data.plan[1].id);
  } finally { await stop(app); }
});

test('live mocked plan retains locked item and excludes vetoes across repeated replanning', async () => {
  const app = await start(31872, true);
  try {
    const search = await post(app.port, '/api/search', { query: 'Alpha' });
    assert.equal(search.status, 200);
    assert.equal(search.data.mode, 'live');
    assert.ok(search.data.entities.some(entity => entity.id === seedA.id));
    const initial = await post(app.port, '/api/plan', { a: seedA, b: seedB, style: 'meet' });
    assert.equal(initial.status, 200, JSON.stringify(initial.data));
    assert.equal(initial.data.mode, 'live');
    assert.ok(initial.data.sessionId);
    assert.ok(Number.isInteger(initial.data.revision));
    assert.ok(Array.isArray(initial.data.trace));
    const candidates = initial.data.plan.filter(item => item.id && !item.unavailable);
    assert.ok(candidates.length >= 2, 'The fixture must yield at least two candidates');
    const locked = candidates[0], rejected = candidates[1];
    assert.notEqual(locked.id, rejected.id);
    const repaired = await post(app.port, '/api/repair', { sessionId: initial.data.sessionId, locked: [locked.id], rejected: [rejected.id] });
    assert.equal(repaired.status, 200, JSON.stringify(repaired.data));
    assert.equal(repaired.data.mode, 'live');
    assert.ok(repaired.data.revision > initial.data.revision);
    const kept = repaired.data.plan.find(item => item.id === locked.id);
    assert.ok(kept, 'A locked candidate must survive repair');
    assert.equal(kept.slot, locked.slot);
    assert.equal(kept.name, locked.name);
    assert.equal(kept.locked, true);
    assert.ok(repaired.data.plan.every(item => item.id !== rejected.id), 'Vetoed candidate must disappear');
    const second = await post(app.port, '/api/repair', { sessionId: initial.data.sessionId, locked: [locked.id], rejected: [] });
    assert.equal(second.status, 200, JSON.stringify(second.data));
    assert.ok(second.data.plan.some(item => item.id === locked.id && item.locked));
    assert.ok(second.data.plan.every(item => item.id !== rejected.id), 'Veto must remain cumulative');
    for (const result of [search, initial, repaired, second]) assertNoKey(result);
  } finally { await stop(app); }
});

test('invalid session and conflicting locked/veto choices cannot yield a plan', async () => {
  const app = await start(31873, true);
  try {
    const invalid = await post(app.port, '/api/repair', { sessionId: 'missing', locked: [], rejected: [] });
    assert.ok(invalid.status >= 400);
    assert.equal(invalid.data.plan, undefined);
    const initial = await post(app.port, '/api/plan', { a: seedA, b: seedB, style: 'meet' });
    assert.equal(initial.status, 200, JSON.stringify(initial.data));
    const id = initial.data.plan.find(item => item.id && !item.unavailable)?.id;
    assert.ok(id);
    const conflict = await post(app.port, '/api/repair', { sessionId: initial.data.sessionId, locked: [id], rejected: [id] });
    assert.ok(conflict.status >= 400, JSON.stringify(conflict.data));
    assert.equal(conflict.data.plan, undefined);
    assertNoKey(invalid);
    assertNoKey(conflict);
  } finally { await stop(app); }
});

test('all Qloo insights failing returns an error and never a fabricated live or demo plan', async () => {
  const app = await start(31874, true);
  try {
    const rate = { id: 'seed-rate', name: 'RateLimited', type: 'artist' };
    const broken = { id: 'seed-broken', name: 'Broken', type: 'artist' };
    const result = await post(app.port, '/api/plan', { a: rate, b: broken, style: 'meet' });
    assert.ok(result.status >= 400, JSON.stringify(result.data));
    assert.equal(result.data.plan, undefined);
    assert.notEqual(result.data.mode, 'demo');
    assert.ok(result.data.error, 'Expected a clear upstream error');
    assertNoKey(result);
  } finally { await stop(app); }
});

test('single-act swap preserves other scenes and a full remix excludes unlocked current picks', async () => {
  const app = await start(31875, true);
  try {
    const initial = await post(app.port, '/api/plan', { a: seedA, b: seedB, style: 'meet' });
    assert.equal(initial.status, 200);
    const before = initial.data.plan;
    const one = await post(app.port, '/api/repair', { sessionId: initial.data.sessionId, locked: [], rejected: [before[1].id], replaceSlots: ['movie'] });
    assert.equal(one.status, 200, JSON.stringify(one.data));
    assert.equal(one.data.plan[0].id, before[0].id);
    assert.equal(one.data.plan[2].id, before[2].id);
    assert.notEqual(one.data.plan[1].id, before[1].id);
    assert.ok(one.data.plan.every(x => !x.locked));
    const all = await post(app.port, '/api/repair', { sessionId: initial.data.sessionId, locked: [], rejected: [] });
    assert.equal(all.status, 200, JSON.stringify(all.data));
    const oldIds = new Set(one.data.plan.map(x => x.id));
    assert.ok(all.data.plan.every(x => !x.id || !oldIds.has(x.id)));
    const invalidLock = await post(app.port, '/api/repair', { sessionId: initial.data.sessionId, locked: ['foreign'], rejected: [] });
    assert.equal(invalidLock.status, 400);
    const ids = all.data.plan.filter(x => x.id).map(x => x.id);
    const allLocked = await post(app.port, '/api/repair', { sessionId: initial.data.sessionId, locked: ids, rejected: [] });
    assert.equal(allLocked.status, 400);
  } finally { await stop(app); }
});
