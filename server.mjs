import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createPlanner } from './sidequests.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const root = dirname(fileURLToPath(import.meta.url));
let localKey = '';
try {
  const text = readFileSync(join(root, 'Qloo-key.txt'), 'utf8');
  localKey = (text.split(/\r?\n/).map(line => line.trimStart()).find(line => line.startsWith('QLOO_API_KEY=')) || '').slice('QLOO_API_KEY='.length).trim();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const key = process.env.QLOO_API_KEY?.trim() || localKey;
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const allowedTypes = new Set(['movie', 'artist', 'book', 'tv_show']);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const staticFiles = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/app.js': 'app.js' };

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function normalize(value) { return String(value || '').trim().normalize('NFKC').toLocaleLowerCase(); }
function entityList(data) {
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.results?.entities)) return data.results.entities;
  if (Array.isArray(data?.entities)) return data.entities;
  return [];
}
function idOf(entity) { return entity?.entity_id || entity?.id; }
let nextRequest = 0;
async function qloo(path, params) {
  const scheduled = Math.max(Date.now(), nextRequest);
  nextRequest = scheduled + 260;
  if (scheduled > Date.now()) await delay(scheduled - Date.now());
  const url = new URL(path, 'https://hackathon.api.qloo.com');
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  let response;
  try {
    response = await fetch(url, { headers: { 'X-Api-Key': key, Accept: 'application/json' }, signal: AbortSignal.timeout(25000), redirect: 'error' });
  } catch {
    throw new Error('Could not reach Qloo. Check network access and try again.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('Qloo rejected the API credential. Check the server configuration.');
    if (response.status === 429) throw new Error('Qloo rate limit reached. Please try again later.');
    throw new Error(`Qloo returned an error (${response.status}). Please try again later.`);
  }
  let text;
  try { text = await response.text(); } catch { throw new Error('Qloo took too long to return this scene. Retry this act.'); }
  if (text.length > 1_000_000) throw new Error('Qloo response exceeded the allowed size.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Qloo returned an unreadable response.'); }
  if (data?.success === false) throw new Error('Qloo could not complete this request.');
  return data;
}
async function resolve(name) {
  const data = await qloo('/search', { query: name, types: 'urn:entity:artist,urn:entity:movie,urn:entity:book,urn:entity:tv_show', take: '20' });
  const matches = [...new Map(entityList(data).filter(item => normalize(item.name) === normalize(name) && idOf(item)).map(item => [String(idOf(item)), item])).values()];
  if (matches.length !== 1) {
    const alternatives = entityList(data).map(item => item?.name).filter(v => typeof v === 'string').slice(0, 4);
    const suggestion = alternatives.length ? ` Search returned: ${alternatives.join(', ')}.` : '';
    throw new Error(matches.length > 1
      ? `More than one Qloo entity is named “${name}”. Selection between same-name entities is not supported yet; try a different cultural entity.`
      : `No exact Qloo entity match for “${name}”.${suggestion}`);
  }
  return matches[0];
}
function demo(likes, other, target) {
  return {
    mode: 'demo', input: { likes, other, target },
    warning: 'Illustrative synthetic examples only. They are not Qloo results and are not derived from your inputs. Configure a Qloo API key for real comparisons.',
    steps: ['shared', 'from_a', 'from_b'].map((lane, index) => ({ lane, name: `Example ${target.replace('_', ' ')} ${index + 1}`, type: target, description: 'A fictional placeholder for the discovery experience.', reason: 'Illustration only — no real taste relationship has been measured.', source: 'Synthetic example' }))
  };
}
async function makeTrail(body) {
  const likes = typeof body.likes === 'string' ? body.likes.trim() : '';
  const other = typeof body.other === 'string' ? body.other.trim() : '';
  const target = typeof body.target === 'string' ? body.target : '';
  if (!likes || !other || likes.length > 100 || other.length > 100 || !allowedTypes.has(target)) throw new Error('Enter one cultural title or artist for each person and choose a supported category.');
  if (!key) return demo(likes, other, target);
  const [first, second] = await Promise.all([resolve(likes), resolve(other)]);
  const query = id => qloo('/v2/insights', { 'filter.type': `urn:entity:${target}`, 'signal.interests.entities': id, take: '20' });
  const [a, b] = await Promise.all([query(idOf(first)), query(idOf(second))]);
  const left = entityList(a).filter(item => idOf(item) && item.name);
  const right = entityList(b).filter(item => idOf(item) && item.name);
  const leftRanks = new Map(left.map((item, index) => [String(idOf(item)), index + 1]));
  const rightRanks = new Map(right.map((item, index) => [String(idOf(item)), index + 1]));
  const exclude = new Set([String(idOf(first)), String(idOf(second))]);
  const shared = left.map((item, index) => ({ item, leftRank: index + 1, rightRank: rightRanks.get(String(idOf(item))) }))
    .filter(x => x.rightRank && !exclude.has(String(idOf(x.item))))
    .sort((x, y) => (x.leftRank + x.rightRank) - (y.leftRank + y.rightRank)).slice(0, 4)
    .map(({item, leftRank, rightRank}) => ({ lane: 'shared', name: String(item.name), type: target, description: typeof item?.properties?.description === 'string' ? item.properties.description.slice(0, 350) : 'A shared candidate returned in both Qloo result lists.', reason: `Appeared in both independent Qloo result lists (positions ${leftRank} and ${rightRank}). This is aggregate affinity, not a prediction of either person's choice.`, source: 'Qloo Insights' }));
  const directional = (list, otherRanks, lane) => list.map((item, index) => ({item, rank: index + 1}))
    .filter(({item}) => !exclude.has(String(idOf(item))) && !otherRanks.has(String(idOf(item))))
    .slice(0, 2).map(({item, rank}) => ({ lane, name: String(item.name), type: target, description: typeof item?.properties?.description === 'string' ? item.properties.description.slice(0, 350) : 'A candidate for one person to introduce to the other.', reason: `Appeared at position ${rank} in one Qloo result list and not in the other returned list. This does not predict the other person's preference.`, source: 'Qloo Insights' }));
  const steps = [...shared, ...directional(left, rightRanks, 'from_a'), ...directional(right, leftRanks, 'from_b')];
  return { mode: 'live', input: { likes, other, target }, steps, warning: shared.length ? 'Shared candidates overlap in two returned lists; one-sided candidates are invitations to explore, not predictions.' : 'No overlap appeared in the two returned lists. Any one-sided candidates below are invitations to explore, not predictions.' };
}
async function readJson(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 8192) throw new Error('Request is too large.'); }
  try { return JSON.parse(body); } catch { throw new Error('Request must contain valid JSON.'); }
}

const requests = new Map();
const planner = createPlanner({ request: qloo, configured: Boolean(key) });
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && pathname === '/api/status') return send(res, 200, { configured: Boolean(key), planner: 'deterministic' });
  if (req.method === 'POST' && ['/api/trail', '/api/search', '/api/plan', '/api/repair'].includes(pathname)) {
    const now = Date.now(), ip = req.socket.remoteAddress || 'local';
    const recent = (requests.get(ip) || []).filter(t => now - t < 60_000);
    if (recent.length >= 20) return send(res, 429, { error: 'Too many requests. Please wait a minute.' });
    recent.push(now); requests.set(ip, recent);
    if (requests.size > 1000) for (const [address, times] of requests) if (now - times.at(-1) >= 60_000) requests.delete(address);
    try {
      const body = await readJson(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Request must contain a JSON object.');
      const action = pathname === '/api/trail' ? makeTrail : planner[pathname.split('/').at(-1)];
      return send(res, 200, await action(body));
    }
    catch (error) { return send(res, 400, { error: error.message || 'Could not create the bridge.' }); }
  }
  const name = staticFiles[pathname];
  if (req.method !== 'GET' || !name) return send(res, 404, { error: 'Not found.' });
  try {
    const data = await readFile(join(root, 'public', name));
    const ext = name.slice(name.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': contentTypes[ext], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { send(res, 500, { error: 'Application files are unavailable.' }); }
});
server.listen(port, host, () => console.log(`TasteTrail / Sidequests listening on http://${host}:${port} (${key ? 'Qloo key configured; connectivity unverified' : 'synthetic demo mode'})`));
