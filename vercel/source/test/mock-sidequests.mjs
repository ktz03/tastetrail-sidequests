// A strictly local stand-in: no request may leave the test process.
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  if (u.hostname !== 'hackathon.api.qloo.com') throw new Error('Unexpected upstream host');
  if (options.headers?.['X-Api-Key'] !== 'test-sidequest-key') return new Response('', { status: 401 });

  if (u.pathname === '/search') {
    const query = u.searchParams.get('query') || '';
    const seeds = { Alpha: 'seed-a', Beta: 'seed-b', RateLimited: 'seed-rate', Broken: 'seed-broken' };
    return Response.json({ results: seeds[query] ? [{ entity_id: seeds[query], name: query, type: 'urn:entity:artist' }] : [] });
  }
  if (u.pathname === '/v2/insights') {
    const seed = u.searchParams.get('signal.interests.entities');
    if (seed === 'seed-rate') return new Response('', { status: 429 });
    if (seed === 'seed-broken') return new Response('not-json', { status: 200 });
    const type = (u.searchParams.get('filter.type') || '').split(':').at(-1);
    if (!['artist', 'movie', 'book'].includes(type)) return new Response('', { status: 400 });
    const excluded = new Set((u.searchParams.get('filter.exclude.entities') || '').split(',').filter(Boolean));
    const suffix = seed === 'seed-a' ? 'a' : 'b';
    const entities = [
      { entity_id: `${type}-shared-1`, name: `${type} Shared One`, type: `urn:entity:${type}` },
      { entity_id: `${type}-shared-2`, name: `${type} Shared Two`, type: `urn:entity:${type}` },
      { entity_id: `${type}-shared-3`, name: `${type} Shared Three`, type: `urn:entity:${type}` },
      { entity_id: `${type}-${suffix}-1`, name: `${type} Only ${suffix.toUpperCase()}`, type: `urn:entity:${type}` },
      { entity_id: `${type}-${suffix}-2`, name: `${type} Alternate ${suffix.toUpperCase()}`, type: `urn:entity:${type}` }
    ].filter(item => !excluded.has(item.entity_id));
    return Response.json({ results: { entities } });
  }
  return new Response('', { status: 404 });
};
