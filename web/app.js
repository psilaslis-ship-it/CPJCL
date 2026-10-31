import { DmxOutput } from './dmx.js';

const STORAGE_KEY = 'lumen-dmx-config-v1';
const APP_VERSION = 'web-1.0.0';
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const uid = () => crypto.randomUUID();
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function initialState() {
  return {
    fixtures: [
      { id: uid(), name: 'Moving esquerdo', address: 1, channels: 14, type: 'Moving' },
      { id: uid(), name: 'Moving direito', address: 15, channels: 14, type: 'Moving' },
      { id: uid(), name: 'Ribalta 1', address: 29, channels: 4, type: 'Ribalta' },
      { id: uid(), name: 'Ribalta 2', address: 33, channels: 4, type: 'Ribalta' },
      { id: uid(), name: 'PAR LED 1', address: 37, channels: 6, type: 'PAR LED' },
      { id: uid(), name: 'PAR LED 2', address: 43, channels: 6, type: 'PAR LED' },
      { id: uid(), name: 'PAR LED 3', address: 49, channels: 6, type: 'PAR LED' },
      { id: uid(), name: 'PAR LED 4', address: 55, channels: 6, type: 'PAR LED' }
    ],
    scenes: [{ id: uid(), name: 'Minha primeira cena', color: '#865cff', channels: {} }],
    sequences: [],
    connection: { universe: 1 }
  };
}

function normalizedState(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.fixtures) || !Array.isArray(value.scenes) || !Array.isArray(value.sequences)) throw new Error('Arquivo sem formato de configuração Lumen.');
  return {
    fixtures: value.fixtures.map(fixture => ({ id: String(fixture.id || uid()), name: String(fixture.name || 'Equipamento'), type: String(fixture.type || 'Personalizado'), address: Number(fixture.address), channels: Number(fixture.channels) })),
    scenes: value.scenes.map(scene => ({ id: String(scene.id || uid()), name: String(scene.name || 'Cena'), color: /^#[0-9a-f]{6}$/i.test(scene.color) ? scene.color : '#865cff', channels: scene.channels && typeof scene.channels === 'object' ? scene.channels : {} })),
    sequences: value.sequences.map(sequence => ({ id: String(sequence.id || uid()), name: String(sequence.name || 'Sequência'), steps: Array.isArray(sequence.steps) ? sequence.steps.map(step => ({ sceneId: String(step.sceneId), hold: Math.max(1, Number(step.hold) || 1) })) : [] })),
    connection: { universe: 1 }
  };
}

let state;
try { state = normalizedState(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
catch { state = initialState(); }
let currentView = 'console';
let activeSceneId = null;
let activeSequenceToken = 0;
let activeSequenceName = '';
let serviceWorkerRegistration = null;
const dmx = new DmxOutput(onDmxState);

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.style.display = 'block';
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.style.display = 'none', 4300);
}

function onDmxState(status) {
  const element = $('#connectionStatus');
  element.classList.toggle('connected', Boolean(status.connected));
  element.textContent = status.connected ? `● Interface conectada (${status.stopBits === 2 ? '8N2' : '8N1'})` : '● Desconectado';
  $('#connectButton').textContent = status.connected ? 'Desconectar' : 'Conectar interface';
  if (status.error) toast(status.error);
  else if (status.connected) toast(status.stopBits === 1 ? 'Conectado em modo de compatibilidade 8N1. Confirme a resposta dos aparelhos.' : 'Interface DMX conectada.');
  render();
}

function header(title, description, action = '') {
  return `<div class="view-head"><div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}
function sceneCard(scene) {
  const count = Object.values(scene.channels || {}).filter(value => Number(value) > 0).length;
  return `<button class="scene-button ${scene.id === activeSceneId ? 'active' : ''}" data-action="play-scene" data-id="${escapeHtml(scene.id)}"><span class="accent" style="background:${escapeHtml(scene.color)}"></span><span><strong>${escapeHtml(scene.name)}</strong><small>${count ? `${count} canais ativos` : 'Configure os canais antes de usar'}</small></span></button>`;
}
function sequenceRow(sequence, editing = false) {
  const total = (sequence.steps || []).reduce((sum, step) => sum + Number(step.hold || 0), 0);
  return `<div class="sequence-item"><div><strong>${escapeHtml(sequence.name)}</strong><small>${sequence.steps.length} passos · ${Math.floor(total / 60)}min ${total % 60}s</small></div><div class="row"><button class="button small" data-action="run-sequence" data-id="${escapeHtml(sequence.id)}">▶ Executar</button>${editing ? `<button class="button small" data-action="edit-sequence" data-id="${escapeHtml(sequence.id)}">Editar</button>` : ''}</div></div>`;
}

function renderConsole() {
  const emptyScenes = !state.scenes.length ? '<div class="empty">Nenhuma cena. Crie uma cena para começar.</div>' : `<div class="scene-grid">${state.scenes.map(sceneCard).join('')}</div>`;
  return `${header('Console de iluminação', 'Escolha uma cena ou execute uma sequência. A janela deve permanecer aberta durante o uso.', '<button class="button danger" data-action="blackout">■ Apagar tudo</button>')}
    ${!dmx.connected ? '<div class="notice">Interface desconectada. Clique em “Conectar interface” e selecione a porta USB Serial da SL3000.</div>' : ''}
    <div class="grid"><section class="panel"><div class="panel-head"><h2>Cenas rápidas</h2><button class="button small" data-action="new-scene">+ Nova cena</button></div><div class="panel-body">${emptyScenes}</div></section>
    <section class="panel"><div class="panel-head"><h2>Sequências</h2><button class="button small" data-view="sequences">Gerenciar</button></div>${state.sequences.map(sequence => sequenceRow(sequence)).join('') || '<div class="empty">Nenhuma sequência cadastrada.</div>'}<div class="panel-body"><button class="button" data-action="stop-sequence" ${activeSequenceName ? '' : 'disabled'}>■ ${activeSequenceName ? `Parar ${escapeHtml(activeSequenceName)}` : 'Parar sequência'}</button></div></section></div>
    <section class="panel" style="margin-top:18px"><div class="panel-head"><h2>Equipamentos · Universo 1</h2><button class="button small" data-view="fixtures">Gerenciar</button></div><div>${state.fixtures.map(fixture => `<div class="fixture-item"><strong>${escapeHtml(fixture.name)}</strong><small>DMX ${String(fixture.address).padStart(3, '0')} · ${fixture.channels} canais</small></div>`).join('')}</div></section>`;
}
function renderScenes() {
  return `${header('Cenas', 'Edite o valor de cada canal DMX entre 0 e 255. Os canais não definidos ficam em zero.', '<button class="button primary" data-action="new-scene">+ Nova cena</button>')}
    <div class="notice">Os endereços e a ordem dos canais dos equipamentos precisam corresponder ao visor e ao manual de cada aparelho. As cenas iniciais são apenas rascunhos.</div>
    <section class="panel">${state.scenes.map(scene => `<div class="record-item"><div><strong>${escapeHtml(scene.name)}</strong><small>${Object.values(scene.channels || {}).filter(x => Number(x) > 0).length} canais ativos</small></div><div class="row"><button class="button small" data-action="play-scene" data-id="${escapeHtml(scene.id)}">Ativar</button><button class="button small" data-action="edit-scene" data-id="${escapeHtml(scene.id)}">Editar</button></div></div>`).join('') || '<div class="empty">Nenhuma cena cadastrada.</div>'}</section>`;
}
function renderSequences() {
  return `${header('Sequências', 'Organize cenas em passos e defina o tempo de permanência em segundos.', '<button class="button primary" data-action="new-sequence">+ Nova sequência</button>')}
    <section class="panel">${state.sequences.map(sequence => sequenceRow(sequence, true)).join('') || '<div class="empty">Nenhuma sequência cadastrada.</div>'}</section>
    <div class="toolbar" style="margin-top:15px"><button class="button" data-action="stop-sequence" ${activeSequenceName ? '' : 'disabled'}>■ Parar sequência em execução</button></div>`;
}
function renderFixtures() {
  const collisions = state.fixtures.filter((fixture, index) => state.fixtures.some((other, otherIndex) => index !== otherIndex && fixture.address <= other.address + other.channels - 1 && other.address <= fixture.address + fixture.channels - 1));
  return `${header('Equipamentos', 'Cadastre os endereços e canais reais dos aparelhos. Você poderá adicionar mais quando precisar.', '<button class="button primary" data-action="new-fixture">+ Adicionar equipamento</button>')}
    ${collisions.length ? '<div class="notice">Há endereços DMX sobrepostos. Confira se isso é intencional.</div>' : ''}
    <section class="panel">${state.fixtures.map(fixture => `<div class="record-item"><div><strong>${escapeHtml(fixture.name)}</strong><small>${escapeHtml(fixture.type)} · DMX ${String(fixture.address).padStart(3, '0')} a ${String(fixture.address + fixture.channels - 1).padStart(3, '0')} · ${fixture.channels} canais</small></div><button class="button small" data-action="edit-fixture" data-id="${escapeHtml(fixture.id)}">Editar</button></div>`).join('') || '<div class="empty">Nenhum equipamento cadastrado.</div>'}</section>`;
}
function renderSettings() {
  return `${header('Configurações', 'Conexão USB, cópia de segurança e atualização do aplicativo.')}
    <div class="stack"><section class="panel"><div class="panel-head"><h2>Interface DMX</h2></div><div class="panel-body"><p>Use o Microsoft Edge ou Google Chrome. Ao conectar, escolha a USB Serial Port do adaptador FTDI (COM17 neste computador). Feche o FreeStyler antes de conectar.</p><div class="toolbar"><button class="button primary" data-action="toggle-connect">${dmx.connected ? 'Desconectar' : 'Conectar interface'}</button><button class="button danger" data-action="blackout">■ Apagar tudo</button></div></div></section>
    <section class="panel"><div class="panel-head"><h2>Salvar e transferir dados</h2></div><div class="panel-body"><p>Cenas, sequências e equipamentos ficam salvos neste navegador. Exporte um arquivo JSON para levar a outra máquina.</p><div class="toolbar"><button class="button" data-action="export">Exportar configuração</button><button class="button" data-action="import">Importar configuração</button></div></div></section>
    <section class="panel"><div class="panel-head"><h2>Instalação e atualização</h2></div><div class="panel-body"><p>Versão ${APP_VERSION}. No Edge, use o menu ⋯ → Aplicativos → Instalar este site como aplicativo. Depois da primeira abertura, a interface fica disponível offline. O envio DMX termina quando a janela é fechada.</p><div class="toolbar"><button class="button" data-action="check-update">Buscar atualização</button><button class="button primary" data-action="apply-update" id="applyUpdate" hidden>Instalar atualização disponível</button></div></div></section></div>`;
}
function render() {
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === currentView));
  $('#mainContent').innerHTML = ({ console: renderConsole, scenes: renderScenes, sequences: renderSequences, fixtures: renderFixtures, settings: renderSettings }[currentView] || renderConsole)();
  const apply = $('#applyUpdate');
  if (apply) apply.hidden = !serviceWorkerRegistration?.waiting;
}

function showDialog(html) { $('#dialogContent').innerHTML = html; $('#editorDialog').showModal(); }
function closeDialog() { $('#editorDialog').close(); }
function field(label, id, value, type = 'text', extra = '') { return `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${escapeHtml(value)}" ${extra}></div>`; }
function footer(deleteAction = '') { return `<div class="footer-actions">${deleteAction}<button class="button" data-action="close-dialog">Cancelar</button><button class="button primary" type="submit">Salvar</button></div>`; }

function editFixture(fixtureId) {
  const existing = state.fixtures.find(item => item.id === fixtureId);
  const fixture = existing || { name: '', type: 'Personalizado', address: 1, channels: 6 };
  showDialog(`<h2>${existing ? 'Editar equipamento' : 'Novo equipamento'}</h2><p>Confirme o endereço inicial no visor e a quantidade de canais no modo DMX do aparelho.</p><form id="fixtureForm" data-id="${escapeHtml(existing?.id || '')}"><div class="form-grid">${field('Nome', 'fixtureName', fixture.name, 'text', 'required maxlength="80"')}${field('Tipo', 'fixtureType', fixture.type)}${field('Endereço inicial', 'fixtureAddress', fixture.address, 'number', 'required min="1" max="512"')}${field('Canais', 'fixtureChannels', fixture.channels, 'number', 'required min="1" max="512"')}</div>${footer(existing ? `<button class="button danger" type="button" data-action="delete-fixture" data-id="${escapeHtml(existing.id)}">Excluir</button>` : '')}</form>`);
}
function maxChannel() { return Math.min(512, Math.max(64, ...state.fixtures.map(f => f.address + f.channels - 1))); }
function editScene(sceneId) {
  const existing = state.scenes.find(item => item.id === sceneId);
  const scene = existing || { name: '', color: '#865cff', channels: {} };
  let rows = '';
  for (let number = 1; number <= maxChannel(); number++) {
    const fixture = state.fixtures.find(item => number >= item.address && number < item.address + item.channels);
    const value = Math.max(0, Math.min(255, Number(scene.channels?.[number]) || 0));
    rows += `<div class="channel-row" data-channel="${number}"><span>Canal ${String(number).padStart(3, '0')}<small>${fixture ? escapeHtml(fixture.name) : 'Livre'}</small></span><input type="range" min="0" max="255" value="${value}"><input type="number" min="0" max="255" value="${value}"></div>`;
  }
  showDialog(`<h2>${existing ? 'Editar cena' : 'Nova cena'}</h2><p>Defina os valores DMX. Uma cena envia um estado completo: todos os canais omitidos ficam em zero.</p><form id="sceneForm" data-id="${escapeHtml(existing?.id || '')}"><div class="form-grid">${field('Nome', 'sceneName', scene.name, 'text', 'required maxlength="80"')}${field('Cor do botão', 'sceneColor', scene.color, 'color')}</div><label class="label">Canais do universo 1</label><div class="channel-list">${rows}</div>${footer(existing ? `<button class="button danger" type="button" data-action="delete-scene" data-id="${escapeHtml(existing.id)}">Excluir</button>` : '')}</form>`);
}
function stepHtml(step = {}) {
  return `<div class="step-row"><select class="step-scene" aria-label="Cena">${state.scenes.map(scene => `<option value="${escapeHtml(scene.id)}" ${scene.id === step.sceneId ? 'selected' : ''}>${escapeHtml(scene.name)}</option>`).join('')}</select><input class="step-hold" aria-label="Duração em segundos" type="number" min="1" value="${Math.max(1, Number(step.hold) || 10)}"><button type="button" class="button" data-action="remove-step" title="Remover passo">×</button></div>`;
}
function editSequence(sequenceId) {
  if (!state.scenes.length) return toast('Crie uma cena antes de criar a sequência.');
  const existing = state.sequences.find(item => item.id === sequenceId);
  const sequence = existing || { name: '', steps: [{ sceneId: state.scenes[0].id, hold: 10 }] };
  showDialog(`<h2>${existing ? 'Editar sequência' : 'Nova sequência'}</h2><p>Passos executados na ordem abaixo. O tempo de cada passo é em segundos.</p><form id="sequenceForm" data-id="${escapeHtml(existing?.id || '')}">${field('Nome', 'sequenceName', sequence.name, 'text', 'required maxlength="80"')}<div class="form-grid"><span class="label">Cena</span><span class="label">Duração em segundos</span></div><div id="stepList">${sequence.steps.map(stepHtml).join('')}</div><button type="button" class="button small" data-action="add-step">+ Adicionar passo</button>${footer(existing ? `<button class="button danger" type="button" data-action="delete-sequence" data-id="${escapeHtml(existing.id)}">Excluir</button>` : '')}</form>`);
}

async function playScene(sceneId) {
  const scene = state.scenes.find(item => item.id === sceneId);
  if (!scene) return;
  if (!dmx.connected) return toast('Conecte a interface USB antes de ativar a cena.');
  if (!Object.values(scene.channels || {}).some(value => Number(value) > 0)) return toast('Esta cena ainda não possui valores DMX. Abra Cenas → Editar.');
  dmx.setChannels(scene.channels);
  activeSceneId = scene.id;
  render();
  toast(`Cena “${scene.name}” enviada.`);
}
function stopSequence(showMessage = true) { activeSequenceToken++; activeSequenceName = ''; render(); if (showMessage) toast('Sequência interrompida. A cena atual permanece ativa.'); }
async function runSequence(sequenceId) {
  const sequence = state.sequences.find(item => item.id === sequenceId);
  if (!sequence?.steps?.length) return toast('Adicione passos à sequência antes de executar.');
  if (!dmx.connected) return toast('Conecte a interface USB antes de executar.');
  if (sequence.steps.some(step => !state.scenes.some(scene => scene.id === step.sceneId && Object.values(scene.channels || {}).some(value => Number(value) > 0)))) return toast('Configure todas as cenas desta sequência antes de executar.');
  const token = ++activeSequenceToken;
  activeSequenceName = sequence.name;
  render();
  for (const step of sequence.steps) {
    if (token !== activeSequenceToken || !dmx.connected) break;
    await playScene(step.sceneId);
    const ends = Date.now() + Math.max(1, Number(step.hold) || 1) * 1000;
    while (token === activeSequenceToken && dmx.connected && Date.now() < ends) await wait(200);
  }
  if (token === activeSequenceToken) { activeSequenceName = ''; render(); toast('Sequência concluída. A última cena permanece ativa.'); }
}

function exportConfig() {
  const data = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lumen-config-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importConfig() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    if (!input.files?.[0]) return;
    try {
      const imported = normalizedState(JSON.parse(await input.files[0].text()));
      if (!confirm('Substituir as cenas, sequências e equipamentos deste navegador pelos dados do arquivo? Exporte antes uma cópia, se precisar.')) return;
      stopSequence(false);
      dmx.setChannels({});
      state = imported; save(); toast('Configuração importada.');
    } catch (error) { toast(`Não foi possível importar: ${error.message}`); }
  });
  input.click();
}

async function checkUpdate() {
  if (!serviceWorkerRegistration) return toast('Atualização offline indisponível neste navegador.');
  try {
    await serviceWorkerRegistration.update();
    if (serviceWorkerRegistration.waiting) showUpdateBadge();
    else toast('Nenhuma atualização nova disponível.');
  } catch (error) { toast(`Não foi possível verificar: ${error.message}`); }
}
function showUpdateBadge() { $('#updateBadge').hidden = false; const button = $('#applyUpdate'); if (button) button.hidden = false; }
function applyUpdate() { if (!serviceWorkerRegistration?.waiting) return; if (!confirm('Instalar a atualização agora? A página será recarregada e a transmissão DMX será interrompida.')) return; stopSequence(false); dmx.disconnect().finally(() => serviceWorkerRegistration.waiting?.postMessage('ACTIVATE_UPDATE')); }
async function registerOffline() {
  if (!('serviceWorker' in navigator)) return;
  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js');
    if (serviceWorkerRegistration.waiting) showUpdateBadge();
    serviceWorkerRegistration.addEventListener('updatefound', () => {
      const worker = serviceWorkerRegistration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBadge(); });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
    await serviceWorkerRegistration.update();
    setInterval(() => serviceWorkerRegistration.update().catch(() => {}), 6 * 60 * 60 * 1000);
  } catch (error) { toast(`Uso offline indisponível: ${error.message}`); }
}

$('#connectButton').addEventListener('click', async () => {
  try { if (dmx.connected) { stopSequence(false); await dmx.disconnect(); } else await dmx.connect(); }
  catch (error) { if (error.name !== 'NotFoundError') toast(error.message); }
});
$('#updateBadge').addEventListener('click', applyUpdate);
$('.sidebar').addEventListener('click', event => { const item = event.target.closest('[data-view]'); if (!item) return; currentView = item.dataset.view; render(); });
$('#mainContent').addEventListener('click', async event => {
  const view = event.target.closest('[data-view]');
  if (view) { currentView = view.dataset.view; render(); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'toggle-connect') $('#connectButton').click();
  if (action === 'blackout') { stopSequence(false); dmx.setChannels({}); activeSceneId = null; render(); toast(dmx.connected ? 'Todos os canais enviados em zero.' : 'Interface desconectada.'); }
  if (action === 'new-scene' || action === 'edit-scene') editScene(id);
  if (action === 'play-scene') playScene(id);
  if (action === 'new-sequence' || action === 'edit-sequence') editSequence(id);
  if (action === 'run-sequence') runSequence(id);
  if (action === 'stop-sequence') stopSequence();
  if (action === 'new-fixture' || action === 'edit-fixture') editFixture(id);
  if (action === 'export') exportConfig();
  if (action === 'import') importConfig();
  if (action === 'check-update') checkUpdate();
  if (action === 'apply-update') applyUpdate();
});
$('#editorDialog').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'close-dialog') closeDialog();
  if (action === 'add-step') $('#stepList').insertAdjacentHTML('beforeend', stepHtml({ sceneId: state.scenes[0].id, hold: 10 }));
  if (action === 'remove-step') button.closest('.step-row').remove();
  if (action.startsWith('delete-')) {
    if (!confirm('Excluir este item?')) return;
    if (action === 'delete-scene') { state.scenes = state.scenes.filter(x => x.id !== id); state.sequences.forEach(sequence => sequence.steps = sequence.steps.filter(step => step.sceneId !== id)); }
    if (action === 'delete-sequence') state.sequences = state.sequences.filter(x => x.id !== id);
    if (action === 'delete-fixture') state.fixtures = state.fixtures.filter(x => x.id !== id);
    save(); closeDialog();
  }
});
$('#editorDialog').addEventListener('input', event => {
  const row = event.target.closest('.channel-row');
  if (!row) return;
  if (event.target.type === 'range') row.querySelector('input[type=number]').value = event.target.value;
  if (event.target.type === 'number') row.querySelector('input[type=range]').value = event.target.value;
});
$('#editorDialog').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const existingId = form.dataset.id;
  if (form.id === 'fixtureForm') {
    const address = Number($('#fixtureAddress').value), channels = Number($('#fixtureChannels').value);
    if (!Number.isInteger(address) || !Number.isInteger(channels) || address < 1 || channels < 1 || address + channels - 1 > 512) return toast('O equipamento deve ocupar apenas canais de 1 a 512.');
    const fixture = { id: existingId || uid(), name: $('#fixtureName').value.trim(), type: $('#fixtureType').value.trim() || 'Personalizado', address, channels };
    const index = state.fixtures.findIndex(x => x.id === existingId);
    if (index >= 0) state.fixtures[index] = fixture; else state.fixtures.push(fixture);
  }
  if (form.id === 'sceneForm') {
    const channels = {};
    form.querySelectorAll('.channel-row').forEach(row => { const value = Math.max(0, Math.min(255, Number(row.querySelector('input[type=number]').value) || 0)); if (value) channels[row.dataset.channel] = value; });
    const scene = { id: existingId || uid(), name: $('#sceneName').value.trim(), color: $('#sceneColor').value, channels };
    const index = state.scenes.findIndex(x => x.id === existingId);
    if (index >= 0) state.scenes[index] = scene; else state.scenes.push(scene);
  }
  if (form.id === 'sequenceForm') {
    const steps = [...form.querySelectorAll('.step-row')].map(row => ({ sceneId: row.querySelector('.step-scene').value, hold: Math.max(1, Math.floor(Number(row.querySelector('.step-hold').value) || 1)) }));
    if (!steps.length) return toast('Adicione ao menos um passo.');
    const sequence = { id: existingId || uid(), name: $('#sequenceName').value.trim(), steps };
    const index = state.sequences.findIndex(x => x.id === existingId);
    if (index >= 0) state.sequences[index] = sequence; else state.sequences.push(sequence);
  }
  save(); closeDialog(); toast('Salvo neste computador.');
});

$('#browserStatus').textContent = navigator.serial ? 'Web Serial disponível' : 'Use Edge ou Chrome';
render();
registerOffline();
