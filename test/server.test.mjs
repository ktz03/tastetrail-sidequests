import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function start(port, withKey) {
  const isolated = await mkdtemp(join(tmpdir(), 'tastetrail-test-'));
  const rel = relative(resolve(tmpdir()), resolve(isolated));
  if (!rel.startsWith('tastetrail-test-') || isAbsolute(rel) || rel.includes('..')) throw new Error('Unexpected test directory');
  await mkdir(join(isolated, 'test'));
  await copyFile(join(root, 'server.mjs'), join(isolated, 'server.mjs'));
  await copyFile(join(root, 'sidequests.mjs'), join(isolated, 'sidequests.mjs'));
  await copyFile(join(root, 'test', 'mock-qloo.mjs'), join(isolated, 'test', 'mock-qloo.mjs'));
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1' };
  if (withKey) env.QLOO_API_KEY = 'test-key'; else delete env.QLOO_API_KEY;
  const args = withKey ? ['--import', './test/mock-qloo.mjs', 'server.mjs'] : ['server.mjs'];
  const processChild = spawn(process.execPath, args, { cwd: isolated, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  processChild.stderr.on('data', chunk => output += chunk);
  try {
    for (let i = 0; i < 50; i++) {
      if (processChild.exitCode !== null) throw new Error(output || 'Server exited early');
      try { if ((await fetch(`http://127.0.0.1:${port}/api/status`)).ok) return { processChild, isolated }; } catch {}
      await delay(100);
    }
    throw new Error('Server did not start');
  } catch (error) { processChild.kill(); await rm(isolated, { recursive: true, force: true }); throw error; }
}
async function stop({processChild, isolated}) { processChild.kill(); if (processChild.exitCode === null) await once(processChild, 'exit'); await rm(isolated, { recursive: true, force: true }); }
async function trail(port, body) {
  const response = await fetch(`http://127.0.0.1:${port}/api/trail`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
test('synthetic mode is labelled and invalid input is rejected', async () => {
  const child = await start(31761, false);
  try {
    const status = await (await fetch('http://127.0.0.1:31761/api/status')).json();
    assert.equal(status.configured, false);
    const result = await trail(31761, { likes: 'Alpha', other: 'Beta', target: 'movie' });
    assert.equal(result.body.mode, 'demo');
    assert.match(result.body.warning, /synthetic/i);
    assert.ok(result.body.steps.every(step => step.source === 'Synthetic example'));
    assert.equal((await trail(31761, { likes: '', other: 'Beta', target: 'movie' })).status, 400);
  } finally { await stop(child); }
});
test('live path intersects both independent result lists and never invents fallback', async () => {
  const child = await start(31762, true);
  try {
    const result = await trail(31762, { likes: 'Alpha', other: 'Beta', target: 'movie' });
    assert.equal(result.body.mode, 'live');
    assert.deepEqual(result.body.steps.map(step => [step.name, step.lane]), [['Shared candidate', 'shared'], ['Only Alpha', 'from_a'], ['Only Beta', 'from_b']]);
    assert.match(result.body.steps[0].reason, /positions 2 and 1/);
    assert.doesNotMatch(JSON.stringify(result), /test-key/);
    const disjoint = await trail(31762, { likes: 'Alpha', other: 'NoOverlap', target: 'movie' });
    assert.ok(disjoint.body.steps.every(step => step.lane !== 'shared'));
    assert.match(disjoint.body.warning, /No overlap/);
    assert.equal((await trail(31762, { likes: 'Unknown', other: 'Beta', target: 'movie' })).status, 400);
    assert.equal((await trail(31762, { likes: 'Duplicate', other: 'Beta', target: 'movie' })).status, 400);
    const failed = await trail(31762, { likes: 'Alpha', other: 'Beta', target: 'book' });
    assert.equal(failed.status, 400);
    assert.match(failed.body.error, /Qloo returned an error/);
    assert.equal(failed.body.mode, undefined);
  } finally { await stop(child); }
});
