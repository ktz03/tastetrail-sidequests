import { randomUUID } from 'node:crypto';

const categories = ['artist', 'movie', 'book'];
const seedTypes = [...categories, 'tv_show'];
const list = data => Array.isArray(data?.results) ? data.results : Array.isArray(data?.results?.entities) ? data.results.entities : [];
const id = item => String(item?.entity_id || item?.id || '');
const trim = value => typeof value === 'string' ? value.trim() : '';
function imageUrl(value) {
  try { const u = new URL(typeof value === 'string' ? value : value?.url); return u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
function entity(item, fallback) {
  const types = [item.subtype, item.type, ...(Array.isArray(item.types) ? item.types : [])].filter(x => typeof x === 'string').map(x => x.split(':').at(-1));
  const type = types.find(x => seedTypes.includes(x)) || (seedTypes.includes(fallback) ? fallback : 'unknown');
  return { id: id(item), name: String(item.name || '').slice(0, 180), type,
    description: String(item.properties?.short_description || item.properties?.description || '').slice(0, 380), image: imageUrl(item.properties?.image),
    disambiguation: typeof item.disambiguation === 'string' ? item.disambiguation.slice(0, 200) : '' };
}
const warning = 'Qloo describes aggregate cultural affinity. List overlap and rank are evidence for discovery, not a prediction of what either person will enjoy. No availability, duration or streaming access is verified.';
const demoWarning = 'Illustrative fictional examples only. No Qloo request was made and these suggestions are not derived from your interests.';

export function createPlanner({ request, configured }) {
  const sessions = new Map();
  async function tool(trace, name, label, path, params) {
    const start = Date.now();
    try { const data = await request(path, params); trace.push({ tool: name, label, status: 'complete', elapsedMs: Date.now() - start }); return data; }
    catch (error) { trace.push({ tool: name, label, status: 'error', elapsedMs: Date.now() - start }); throw error; }
  }
  async function search(body, trace = []) {
    const query = trim(body?.query);
    const type = body?.type;
    if (!query || query.length > 100 || (type && !seedTypes.includes(type))) throw new Error('Enter an artist, film, book or show name (up to 100 characters).');
    if (!configured) return { mode: 'demo', entities: [{ id: 'demo-a', name: 'Fictional starting point A', type: 'artist', description: 'An illustrative seed, not a real Qloo entity.' }, { id: 'demo-b', name: 'Fictional starting point B', type: 'movie', description: 'An illustrative seed, not a real Qloo entity.' }], trace, warning: demoWarning };
    const result = await tool(trace, 'qloo.search', `Find “${query}”`, '/search', { query, take: '12', types: (type ? [type] : seedTypes).map(s => `urn:entity:${s}`).join(',') });
    const entities = [...new Map(list(result).filter(x => id(x) && x.name).map(x => [id(x), entity(x, type)])).values()].filter(x => x.type !== 'unknown');
    return { mode: 'live', entities, trace, warning: entities.length ? 'Choose the intended entity before planning.' : 'No entities found. Try the original title or a different name.' };
  }
  async function confirm(seed, trace) {
    if (!seed || typeof seed.id !== 'string' || seed.id.length > 120 || !trim(seed.name)) throw new Error('Search and select one starting point for each person.');
    if (!configured) {
      if (!['demo-a', 'demo-b'].includes(seed.id)) throw new Error('Select one of the fictional example seeds.');
      return { id: seed.id, name: seed.id === 'demo-a' ? 'Fictional starting point A' : 'Fictional starting point B', type: seed.id === 'demo-a' ? 'artist' : 'movie', description: 'Illustrative seed.' };
    }
    const result = await search({ query: seed.name, type: seed.type }, trace);
    const match = result.entities.find(e => e.id === seed.id);
    if (!match) throw new Error('That starting point could not be confirmed. Search and select it again.');
    return match;
  }
  function prune() {
    const now = Date.now();
    for (const [key, value] of sessions) if (now - value.updated > 3_600_000) sessions.delete(key);
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
  }
  async function pools(slot, seeds, exclude, trace, revision) {
    if (!configured) {
      const sample = n => ({ entity_id: `demo-${slot}-${n}`, name: `Fictional ${slot === 'artist' ? 'artist' : slot} ${n}`, properties: { short_description: 'A synthetic placeholder for the cultural exchange flow.' } });
      return { a: [sample(revision * 4), sample(revision * 4 + 1)], b: [sample(revision * 4), sample(revision * 4 + 2)] };
    }
    const query = (seed, side) => tool(trace, 'qloo.insights', `${slot === 'artist' ? 'Music' : slot === 'movie' ? 'Film' : 'Book'} discoveries for person ${side}`, '/v2/insights', { 'filter.type': `urn:entity:${slot}`, 'signal.interests.entities': seed.id, take: '20', ...(exclude.size ? { 'filter.exclude.entities': [...exclude].join(',') } : {}) });
    const responses = await Promise.allSettled([query(seeds.a, 'A'), query(seeds.b, 'B')]);
    const failed = responses.find(x => x.status === 'rejected');
    if (failed) throw failed.reason;
    return { a: list(responses[0].value), b: list(responses[1].value) };
  }
  function choose(slot, pool, style, exclude) {
    const clean = items => [...new Map(items.filter(x => id(x) && x.name).map(x => [id(x), x])).values()];
    const a = clean(pool.a), b = clean(pool.b);
    const ar = new Map(a.map((x, n) => [id(x), n + 1])), br = new Map(b.map((x, n) => [id(x), n + 1]));
    const shared = a.filter(x => br.has(id(x))).sort((x, y) => ar.get(id(x)) + br.get(id(x)) - ar.get(id(y)) - br.get(id(y)));
    const fromA = a.filter(x => !br.has(id(x))), fromB = b.filter(x => !ar.has(id(x)));
    const desired = style === 'exchange' ? (slot === 'artist' ? 'from_a' : slot === 'movie' ? 'from_b' : 'shared') : 'shared';
    const lanes = desired === 'from_a' ? [[fromA, 'from_a'], [shared, 'shared'], [fromB, 'from_b']] : desired === 'from_b' ? [[fromB, 'from_b'], [shared, 'shared'], [fromA, 'from_a']] : [[shared, 'shared'], [fromA, 'from_a'], [fromB, 'from_b']];
    for (const [items, lane] of lanes) {
      const pick = items.find(x => !exclude.has(id(x)));
      if (!pick) continue;
      const ranks = { a: ar.get(id(pick)) || null, b: br.get(id(pick)) || null };
      return { ...entity(pick, slot), type: slot, slot, lane, ranks, locked: false,
        evidence: lane === 'shared' ? `Returned in both lists: A #${ranks.a}, B #${ranks.b}. Shared candidates are ordered by the sum of these positions.` : `Returned in ${lane === 'from_a' ? 'A' : 'B'}'s list at #${ranks.a || ranks.b}, outside the other returned list. An invitation to explore, not evidence of the other person's preference.` };
    }
    return { slot, type: slot, unavailable: true, locked: false, evidence: 'No unexcluded candidates were returned for this scene. Try different seeds or release an exclusion by starting a new mix.' };
  }
  async function compose({ seeds, style, previous = [], locked = new Set(), rejected = new Set(), replaceSlots = categories, trace, revision }) {
    const keptIds = previous.filter(x => x.id && (!replaceSlots.includes(x.slot) || locked.has(x.id))).map(x => x.id);
    const excluded = new Set([seeds.a.id, seeds.b.id, ...rejected, ...keptIds]);
    const plan = [];
    let success = 0;
    for (const slot of categories) {
      const kept = previous.find(x => x.slot === slot && (locked.has(x.id) || !replaceSlots.includes(slot)));
      if (kept) { plan.push({ ...kept, locked: locked.has(kept.id) }); trace.push({ tool: 'planner.keep', label: `Kept your ${locked.has(kept.id) ? 'locked ' : ''}${slot} scene`, status: 'complete', elapsedMs: 0 }); if (kept.id) success++; continue; }
      try {
        const pool = await pools(slot, seeds, excluded, trace, revision);
        success++;
        const pick = choose(slot, pool, style, excluded);
        plan.push(pick); if (pick.id) excluded.add(pick.id);
      } catch (error) {
        plan.push({ slot, type: slot, unavailable: true, locked: false, evidence: `This scene could not be retrieved. ${error.message}` });
      }
    }
    if (!success) throw new Error('Qloo could not retrieve any scenes. Check connection or credential and retry. No example results have been substituted.');
    trace.push({ tool: 'planner.compose', label: `Arranged ${plan.filter(x => x.id).length} scenes with your ${style === 'exchange' ? 'exchange' : 'shared discovery'} preference`, status: 'complete', elapsedMs: 0 });
    return plan;
  }
  const snapshot = session => ({ sessionId: session.id, revision: session.revision, mode: configured ? 'live' : 'demo', style: session.style, seeds: session.seeds, plan: session.plan, trace: session.trace, warning: configured ? warning : demoWarning });
  async function plan(body) {
    if (!body || !['meet', 'exchange'].includes(body.style)) throw new Error('Choose shared discovery or exchange mode.');
    const trace = [];
    const [a, b] = await Promise.all([confirm(body.a, trace), confirm(body.b, trace)]);
    const seeds = { a, b };
    const picks = await compose({ seeds, style: body.style, trace, revision: 1 });
    prune();
    const session = { id: randomUUID(), seeds, style: body.style, plan: picks, rejected: new Set(), trace, revision: 1, updated: Date.now(), busy: false };
    sessions.set(session.id, session);
    return snapshot(session);
  }
  async function repair(body) {
    const session = sessions.get(body?.sessionId);
    if (!session || Date.now() - session.updated > 3_600_000) throw new Error('This mix has expired or the server restarted. Create a new mix.');
    if (session.busy) throw new Error('This mix is already being updated. Wait for the current request.');
    if (session.revision >= 12) throw new Error('This mix reached its revision limit. Start a new mix to continue.');
    if (!Array.isArray(body.locked) || !Array.isArray(body.rejected) || body.locked.length > 3 || body.rejected.length > 3) throw new Error('Invalid scene selection.');
    const known = new Set(session.plan.filter(x => x.id).map(x => x.id));
    if ([...body.locked, ...body.rejected].some(x => typeof x !== 'string' || !known.has(x))) throw new Error('A selected scene does not belong to the current mix.');
    const locked = new Set(body.locked), rejected = new Set([...session.rejected, ...body.rejected]);
    if ([...locked].some(x => rejected.has(x))) throw new Error('A scene cannot be locked and skipped at the same time.');
    if (locked.size === categories.length) throw new Error('Unlock at least one scene to remix.');
    const replaceSlots = body.replaceSlots ?? categories;
    if (!Array.isArray(replaceSlots) || !replaceSlots.length || replaceSlots.some(x => !categories.includes(x))) throw new Error('Invalid scenes to replace.');
    for (const item of session.plan) if (item.id && !locked.has(item.id) && replaceSlots.includes(item.slot)) rejected.add(item.id);
    const style = body.style ?? session.style;
    if (!['meet', 'exchange'].includes(style)) throw new Error('Invalid discovery style.');
    session.busy = true;
    try {
      const trace = [];
      const picks = await compose({ seeds: session.seeds, style, previous: session.plan, locked, rejected, replaceSlots, trace, revision: session.revision + 1 });
      Object.assign(session, { style, plan: picks, rejected, trace, revision: session.revision + 1, updated: Date.now() });
      return snapshot(session);
    } finally { session.busy = false; }
  }
  return { search, plan, repair };
}
