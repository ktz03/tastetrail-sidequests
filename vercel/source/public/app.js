'use strict';

const selections = {a: null, b: null};
const searchTraces = {a: [], b: []};
let current = null;
let busy = false;
const $ = (selector) => document.querySelector(selector);
const makeButton = $('#make-plan');
const repairButton = $('#repair-all');
const exportButton = $('#export-plan');
const cards = $('#programme-cards');
const planMessage = $('#plan-message');
const modeBadge = $('#mode-badge');

function el(tag, className, content) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function imageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function updateControls() {
  document.querySelectorAll('.setup input, .setup button').forEach(control => { control.disabled = busy; });
  makeButton.disabled = busy || !selections.a || !selections.b;
  exportButton.disabled = busy || !current;
  repairButton.disabled = busy || !current || !current.plan.some(item => !item.locked);
  document.querySelectorAll('.act-controls button').forEach(button => { button.disabled = busy || button.dataset.lockedSkip === 'true'; });
}

function setMessage(value, error = false) {
  planMessage.textContent = value || '';
  planMessage.classList.toggle('error', error);
  planMessage.hidden = !value;
}

function invalidatePlan() {
  if (!current) return;
  current = null;
  modeBadge.hidden = true;
  cards.replaceChildren();
  for (const [number, label, detail] of [['01', 'Listen', 'A sound to discover together.'], ['02', 'Watch', 'A story for your screen.'], ['03', 'Read', 'A page into a new world.']]) {
    const card = el('div', 'empty-card');
    const inner = el('div'); inner.append(el('strong', '', label), el('p', '', detail));
    const star = el('span', 'empty-star', '✳'); star.setAttribute('aria-hidden', 'true');
    card.append(el('span', '', number), inner, star); cards.append(card);
  }
  $('#revision-label').textContent = 'Ready when you are.';
  $('#trace-list').replaceChildren();
  setMessage('Your starting points changed. Make a new sidequest.');
  updateControls();
}

async function post(url, payload) {
  let response;
  try { response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)}); }
  catch { throw new Error('Could not reach the server. Check the connection and try again.'); }
  let body;
  try { body = await response.json(); }
  catch { throw new Error('The server returned an unreadable response. Try again.'); }
  if (!response.ok) throw new Error(body.error || 'The request could not be completed. Try again.');
  return body;
}

function showSearchMessage(side, text, error = false) {
  const result = $(`#search-results-${side}`);
  result.replaceChildren(el('p', `search-message${error ? ' error' : ''}`, text));
}

function selectedView(side, entity, mode) {
  const result = $(`#search-results-${side}`);
  const selected = el('div', 'chosen');
  const content = el('div');
  content.append(el('strong', '', entity.name), el('small', '', [entity.type.replace(/^urn:entity:/, '').replaceAll('_', ' '), typeof entity.disambiguation === 'string' ? entity.disambiguation : '', mode === 'demo' ? 'synthetic example' : ''].filter(Boolean).join(' · ')));
  const change = el('button', '', 'Change'); change.type = 'button';
  change.addEventListener('click', () => { selections[side] = null; result.replaceChildren(); invalidatePlan(); updateControls(); $(`#query-${side}`).focus(); });
  selected.append(content, change); result.replaceChildren(selected);
}

for (const side of ['a', 'b']) {
  const form = $(`#search-${side}`);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const query = form.elements.query.value.trim();
    if (!query || busy) return;
    selections[side] = null; invalidatePlan();
    busy = true; updateControls(); showSearchMessage(side, 'Searching for a starting point…');
    try {
      const data = await post('/api/search', {query});
      if (!Array.isArray(data.entities) || !['live', 'demo'].includes(data.mode)) throw new Error('The search returned an unexpected response.');
      searchTraces[side] = Array.isArray(data.trace) ? data.trace : [];
      const result = $(`#search-results-${side}`); result.replaceChildren();
      if (data.mode === 'demo') result.append(el('p', 'search-message', 'Synthetic examples, not Qloo results.'));
      if (data.warning) result.append(el('p', 'search-message', data.warning));
      if (!data.entities.length) result.append(el('p', 'search-message', 'No matches found. Try another name.'));
      else {
        result.append(el('p', 'search-message', 'Select the right match:'));
        const choices = el('div', 'choices');
        data.entities.forEach(entity => {
          if (!entity || typeof entity.id !== 'string' || typeof entity.name !== 'string' || typeof entity.type !== 'string') return;
          const choice = el('button', 'choice'); choice.type = 'button';
          const url = imageUrl(entity.image);
          if (url) { const img = el('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.addEventListener('error', () => img.remove(), {once: true}); choice.append(img); }
          const content = el('span'); content.append(el('strong', '', entity.name), el('small', '', [entity.type.replace(/^urn:entity:/, '').replaceAll('_', ' '), typeof entity.disambiguation === 'string' ? entity.disambiguation : ''].filter(Boolean).join(' · '))); choice.append(content);
          choice.addEventListener('click', () => { selections[side] = {id: entity.id, name: entity.name, type: entity.type}; selectedView(side, entity, data.mode); updateControls(); }); choices.append(choice);
        });
        result.append(choices);
      }
    } catch (error) { showSearchMessage(side, error.message, true); }
    finally { busy = false; updateControls(); }
  });
  form.elements.query.addEventListener('input', () => {
    if (selections[side]) { selections[side] = null; $(`#search-results-${side}`).replaceChildren(); invalidatePlan(); updateControls(); }
  });
}

const actNames = {artist: ['01', 'Listen'], movie: ['02', 'Watch'], book: ['03', 'Read']};
const lanes = {shared: 'Shared ground', from_a: 'From person one', from_b: 'From person two'};

function artwork(item) {
  const url = imageUrl(item.image);
  if (!url) return el('div', 'act-image-placeholder', '✳');
  const img = el('img', 'act-image'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.replaceWith(el('div', 'act-image-placeholder', '✳')), {once: true});
  return img;
}

function renderPlan(data) {
  current = data;
  modeBadge.hidden = false; modeBadge.className = `mode-badge ${data.mode}`;
  modeBadge.textContent = data.mode === 'live' ? 'Live Qloo results' : 'Synthetic example';
  setMessage(data.warning || (data.mode === 'demo' ? 'Synthetic example: not Qloo results or predictions.' : ''));
  cards.replaceChildren();
  for (const item of data.plan) {
    const [number, title] = actNames[item.slot] || ['', item.slot || 'Explore'];
    const card = el('article', 'act'); card.append(el('span', 'act-index', number));
    if (item.unavailable || !item.id) {
      const empty = el('div', 'act-unavailable'); empty.append(el('strong', '', title), el('span', '', item.description || 'No candidate is available for this act.')); if (item.evidence) empty.append(el('p', 'act-evidence', item.evidence));
      const controls = el('div', 'act-controls'); const retry = el('button', '', 'Retry this act'); retry.type = 'button'; retry.addEventListener('click', () => repair([], [item.slot])); controls.append(retry); empty.append(controls); card.append(empty); cards.append(card); continue;
    }
    card.append(artwork(item));
    const content = el('div', 'act-content'); const top = el('div', 'act-top');
    top.append(el('span', 'act-kind', title), el('span', `lane ${item.lane || ''}`, lanes[item.lane] || 'Discovery')); content.append(top);
    content.append(el('h3', '', item.name || 'Untitled'));
    if (item.description) content.append(el('p', 'act-description', item.description));
    if (item.evidence) content.append(el('p', 'act-evidence', item.evidence));
    if (item.ranks) {
      const rank = n => Number.isFinite(n) ? `#${n}` : 'not in returned list';
      content.append(el('p', 'rank-row', `Person one: ${rank(item.ranks.a)}  ·  Person two: ${rank(item.ranks.b)}`));
    }
    const controls = el('div', 'act-controls');
    const lock = el('button', item.locked ? 'locked' : '', item.locked ? '✓ Locked' : 'Lock this act'); lock.type = 'button'; lock.setAttribute('aria-pressed', item.locked ? 'true' : 'false');
    lock.addEventListener('click', () => { item.locked = !item.locked; renderPlan(current); });
    const skip = el('button', '', 'Swap this act'); skip.type = 'button';
    skip.disabled = Boolean(item.locked); skip.title = item.locked ? 'Unlock this act before swapping it' : 'Find another candidate for this act';
    skip.dataset.lockedSkip = String(Boolean(item.locked));
    skip.addEventListener('click', () => repair([item.id], [item.slot]));
    controls.append(lock, skip); content.append(controls); card.append(content); cards.append(card);
  }
  $('#revision-label').textContent = `Programme ${data.revision} · ${data.style === 'exchange' ? 'Trade worlds' : 'Meet in the middle'}`;
  const traceList = $('#trace-list'); traceList.replaceChildren();
  const traces = [...searchTraces.a, ...searchTraces.b, ...(Array.isArray(data.trace) ? data.trace : [])];
  if (!traces.length) traceList.append(el('li', '', 'No tool steps were returned.'));
  traces.forEach(trace => { const li = el('li'); li.append(el('span', '', `${trace.label || trace.tool || 'Step'}${trace.tool ? ` (${trace.tool})` : ''}`), el('span', '', `${trace.status || 'unknown'}${Number.isFinite(trace.elapsedMs) ? ` · ${trace.elapsedMs} ms` : ''}`)); traceList.append(li); });
  updateControls();
}

function style() { return document.querySelector('input[name="style"]:checked').value; }
function validPlan(data) { return data && ['live', 'demo'].includes(data.mode) && typeof data.sessionId === 'string' && Array.isArray(data.plan); }

makeButton.addEventListener('click', async () => {
  if (busy || !selections.a || !selections.b) return;
  busy = true; updateControls(); setMessage('Building your three-part programme…');
  try {
    const data = await post('/api/plan', {a: selections.a, b: selections.b, style: style()});
    if (!validPlan(data)) throw new Error('The programme response was incomplete. Try again.');
    renderPlan(data);
  } catch (error) { setMessage(error.message, true); }
  finally { busy = false; updateControls(); if (current) { const visibleError = planMessage.classList.contains('error') ? planMessage.textContent : null; renderPlan(current); if (visibleError) setMessage(visibleError, true); } }
});

async function repair(rejected = [], replaceSlots = []) {
  if (busy || !current) return;
  busy = true; updateControls(); setMessage('Finding another route…');
  try {
    const locked = current.plan.filter(item => item.locked && item.id).map(item => item.id);
    const payload = {sessionId: current.sessionId, locked, rejected, style: style()};
    if (replaceSlots.length) payload.replaceSlots = replaceSlots;
    const data = await post('/api/repair', payload);
    if (!validPlan(data)) throw new Error('The revised programme response was incomplete. Try again.');
    renderPlan(data);
  } catch (error) { setMessage(error.message, true); }
  finally { busy = false; updateControls(); if (current) { const visibleError = planMessage.classList.contains('error') ? planMessage.textContent : null; renderPlan(current); if (visibleError) setMessage(visibleError, true); } }
}
repairButton.addEventListener('click', () => repair());

exportButton.addEventListener('click', () => {
  if (!current) return;
  const copy = {...current, trace: [...searchTraces.a, ...searchTraces.b, ...(current.trace || [])]};
  const blob = new Blob([JSON.stringify(copy, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'tastetrail-sidequest.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});

fetch('/api/status').then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => {
  const status = $('#connection-status'); status.textContent = data.configured ? 'Qloo key configured' : 'Synthetic example mode'; status.classList.toggle('configured', Boolean(data.configured));
}).catch(() => { $('#connection-status').textContent = 'Connection unavailable'; });
