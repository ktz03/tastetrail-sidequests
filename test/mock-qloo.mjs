globalThis.fetch = async (url, options) => {
  const u = new URL(url);
  if (u.hostname !== 'hackathon.api.qloo.com') throw new Error('Unexpected upstream');
  if (options.headers['X-Api-Key'] !== 'test-key') return new Response('', { status: 401 });
  if (u.pathname === '/search') {
    const query = u.searchParams.get('query');
    if (query === 'Unknown') return Response.json({ results: [] });
    if (query === 'Duplicate') return Response.json({ results: [{ entity_id: 'x', name: query }, { entity_id: 'y', name: query }] });
    return Response.json({ results: [{ entity_id: query === 'Alpha' ? 'a' : query === 'NoOverlap' ? 'c' : 'b', name: query }] });
  }
  if (u.pathname === '/v2/insights') {
    if (u.searchParams.get('filter.type') !== 'urn:entity:movie') return new Response('', { status: 503 });
    const id = u.searchParams.get('signal.interests.entities');
    const entities = id === 'c' ? [{ entity_id: 'three', name: 'Only Gamma' }] : id === 'a'
      ? [{ entity_id: 'one', name: 'Only Alpha' }, { entity_id: 'shared', name: 'Shared candidate' }]
      : [{ entity_id: 'shared', name: 'Shared candidate' }, { entity_id: 'two', name: 'Only Beta' }];
    return Response.json({ results: { entities } });
  }
  return new Response('', { status: 404 });
};
