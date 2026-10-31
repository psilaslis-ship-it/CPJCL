import { DmxOutput } from './dmx.js';
import { ROLES, PROFILE_CHANNELS, imageFixtures, channelDefinitions, channelForRole, continuousChannelAddresses } from './profiles.js';

const STORAGE_KEY = 'lumen-dmx-config-v1';
const APP_VERSION = 'web-1.2.0';
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const uid = () => crypto.randomUUID();
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function initialState() {
  return {
    fixtures: imageFixtures(),
    scenes: [{ id: uid(), name: 'Minha primeira cena', color: '#865cff', channels: {} }],
    sequences: [],
    connection: { universe: 1 }
  };
}

function normalizedState(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.fixtures) || !Array.isArray(value.scenes) || !Array.isArray(value.sequences)) throw new Error('Arquivo sem formato de configuração Lumen.');
  return {
    fixtures: value.fixtures.map(fixture => ({ id: String(fixture.id || uid()), name: String(fixture.name || 'Equipamento'), type: String(fixture.type || 'Personalizado'), address: Number(fixture.address), channels: Number(fixture.channels), channelDefs: Array.isArray(fixture.channelDefs) ? fixture.channelDefs : undefined })),
    scenes: value.scenes.map(scene => ({ id: String(scene.id || uid()), name: String(scene.name || 'Cena'), color: /^#[0-9a-f]{6}$/i.test(scene.color) ? scene.color : '#865cff', channels: scene.channels && typeof scene.channels === 'object' ? scene.channels : {} })),
    sequences: value.sequences.map(sequence => ({ id: String(sequence.id || uid()), name: String(sequence.name || 'Sequência'), steps: Array.isArray(sequence.steps) ? sequence.steps.map(step => ({ sceneId: String(step.sceneId), hold: Math.max(1, Number(step.hold) || 1), fade: Math.max(0, Number(step.fade) || 0) })) : [] })),
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
  const total = (sequence.steps || []).reduce((sum, step) => sum + Number(step.hold || 0) + Number(step.fade || 0), 0);
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
  const needsMap = state.fixtures.some(fixture => (fixture.type === 'PAR LED' && fixture.channels !== 8) || (fixture.type === 'Moving' && fixture.channels !== 12) || (fixture.type === 'Ribalta' && fixture.channels !== 2));
  return `${header('Cenas', 'Monte posições, cores e efeitos por equipamento. Os valores DMX continuam disponíveis para ajuste fino.', '<button class="button primary" data-action="new-scene">+ Nova cena</button>')}
    ${needsMap ? '<div class="notice">Seu cadastro ainda usa o mapa de canais antigo. Os painéis facilitados dependem do modo correto dos aparelhos. Confira em <button class="button small" data-view="fixtures">Equipamentos</button> antes de montar a cena.</div>' : ''}
    <div class="notice">Confirme os endereços e os modos DMX nos aparelhos antes de acionar uma cena. Para rodas de cor, gobos e efeitos, cadastre os valores conforme o manual do seu equipamento.</div>
    <section class="panel">${state.scenes.map(scene => `<div class="record-item"><div><strong>${escapeHtml(scene.name)}</strong><small>${Object.values(scene.channels || {}).filter(x => Number(x) > 0).length} canais ativos</small></div><div class="row"><button class="button small" data-action="play-scene" data-id="${escapeHtml(scene.id)}">Ativar</button><button class="button small" data-action="edit-scene" data-id="${escapeHtml(scene.id)}">Editar</button></div></div>`).join('') || '<div class="empty">Nenhuma cena cadastrada.</div>'}</section>`;
}
function renderSequences() {
  return `${header('Sequências', 'Organize cenas, tempo de transição e permanência. Transições suaves movem pan/tilt e misturam intensidade/RGB.', '<button class="button primary" data-action="new-sequence">+ Nova sequência</button>')}
    <section class="panel">${state.sequences.map(sequence => sequenceRow(sequence, true)).join('') || '<div class="empty">Nenhuma sequência cadastrada.</div>'}</section>
    <div class="toolbar" style="margin-top:15px"><button class="button" data-action="stop-sequence" ${activeSequenceName ? '' : 'disabled'}>■ Parar sequência em execução</button></div>`;
}
function renderFixtures() {
  const collisions = state.fixtures.filter((fixture, index) => state.fixtures.some((other, otherIndex) => index !== otherIndex && fixture.address <= other.address + other.channels - 1 && other.address <= fixture.address + fixture.channels - 1));
  return `${header('Equipamentos', 'Edite endereço, função e nome de cada canal. Você pode adicionar mais aparelhos quando precisar.', '<div class="toolbar"><button class="button" data-action="apply-image-map">Usar mapa das imagens</button><button class="button primary" data-action="new-fixture">+ Adicionar equipamento</button></div>')}
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
function footer(deleteAction = '', previewAction = '') { return `<div class="footer-actions">${deleteAction}${previewAction}<button class="button" data-action="close-dialog">Cancelar</button><button class="button primary" type="submit">Salvar</button></div>`; }

function fixtureChannelRows(fixture) {
  return channelDefinitions(fixture).map((definition, index) => `<div class="fixture-channel-row" data-index="${index}"><strong>${index + 1}</strong><input class="channel-label" aria-label="Nome do canal ${index + 1}" value="${escapeHtml(definition.label)}" maxlength="60"><select class="channel-role" aria-label="Função do canal ${index + 1}">${ROLES.map(([role, label]) => `<option value="${role}" ${definition.role === role ? 'selected' : ''}>${label}</option>`).join('')}</select><input class="channel-presets" aria-label="Valores nomeados do canal ${index + 1}" placeholder="Ex.: Azul=40; Verde=75" value="${escapeHtml(definition.presets.map(p => `${p.name}=${p.value}`).join('; '))}"></div>`).join('');
}
function editFixture(fixtureId) {
  const existing = state.fixtures.find(item => item.id === fixtureId);
  const fixture = existing || { name: '', type: 'Personalizado', address: 1, channels: 6 };
  showDialog(`<h2>${existing ? 'Editar equipamento' : 'Novo equipamento'}</h2><p>Confirme endereço e modo DMX no aparelho. Dê nomes e funções aos canais; valores nomeados são opcionais para cor, gobo e efeitos.</p><form id="fixtureForm" data-id="${escapeHtml(existing?.id || '')}"><div class="form-grid">${field('Nome', 'fixtureName', fixture.name, 'text', 'required maxlength="80"')}${field('Tipo / perfil', 'fixtureType', fixture.type)}${field('Endereço inicial', 'fixtureAddress', fixture.address, 'number', 'required min="1" max="512"')}${field('Canais', 'fixtureChannels', fixture.channels, 'number', 'required min="1" max="512"')}</div><div class="toolbar"><button class="button small" type="button" data-action="load-profile">Carregar perfil desse tipo</button><button class="button small" type="button" data-action="generate-channels">Ajustar quantidade de canais</button></div><p class="helper">Tipos disponíveis: Moving, Ribalta, PAR LED. Para valores nomeados, use Nome=valor, separados por ponto e vírgula (0 a 255). Confira os valores no manual.</p><details class="channel-map" open><summary>Mapa e nomes dos canais</summary><div class="fixture-channel-head"><span>#</span><span>Nome</span><span>Função</span><span>Valores nomeados</span></div><div id="fixtureChannelList">${fixtureChannelRows(fixture)}</div></details>${footer(existing ? `<button class="button danger" type="button" data-action="delete-fixture" data-id="${escapeHtml(existing.id)}">Excluir</button>` : '')}</form>`);
}
function channelRow(number, label, value) {
  return `<div class="channel-row" data-channel="${number}"><span>${escapeHtml(label)}<small>DMX ${String(number).padStart(3, '0')}</small></span><input type="range" min="0" max="255" value="${value}"><input type="number" min="0" max="255" value="${value}"></div>`;
}
function controlPanel(title, icon, content, note = '') {
  return `<section class="control-window"><div class="control-window-head"><span class="control-window-icon">${icon}</span><h3>${title}</h3></div><div class="control-window-body">${content}${note ? `<p class="control-note">${note}</p>` : ''}</div></section>`;
}
function choices(entry, options) {
  if (!entry) return '';
  return `<div class="choice-row">${options.map(([label, value]) => `<button class="choice-button" type="button" data-action="set-channel" data-channel="${entry.number}" data-value="${value}" aria-pressed="${entry.value === value}">${label}</button>`).join('')}</div>`;
}
function namedChoices(entry) {
  if (!entry?.presets.length) return '';
  return `<div class="choice-row">${entry.presets.map(preset => `<button class="choice-button" type="button" data-action="set-channel" data-channel="${entry.number}" data-value="${preset.value}" aria-pressed="${entry.value === preset.value}">${escapeHtml(preset.name)}</button>`).join('')}</div>`;
}
function fixtureSceneCard(fixture, scene) {
  const defs = channelDefinitions(fixture);
  const entries = defs.map((def, index) => ({ ...def, number: fixture.address + index, value: Math.max(0, Math.min(255, Number(scene.channels?.[fixture.address + index]) || 0)) }));
  const byRole = role => entries.find(entry => entry.role === role);
  const row = (role, label) => { const entry = byRole(role); return entry ? channelRow(entry.number, label || entry.label, entry.value) : ''; };
  const manualNote = 'Para botões de cor, gobo ou efeito com nomes, cadastre os valores uma vez em Equipamentos → Editar.';
  const rgb = ['red', 'green', 'blue'].map(byRole);
  const hasRgb = rgb.every(Boolean);
  const rgbHex = hasRgb ? `#${rgb.map(entry => entry.value.toString(16).padStart(2, '0')).join('')}` : '#ffffff';
  const pan = byRole('pan'), tilt = byRole('tilt');
  const positionPad = pan && tilt ? `<div class="position-pad" data-pan="${pan.number}" data-tilt="${tilt.number}" title="Clique para definir a posição"><span class="position-dot" style="left:${pan.value / 255 * 100}%;top:${(255 - tilt.value) / 255 * 100}%"></span></div>` : '';
  let panels = '';
  if (fixture.type === 'PAR LED' && hasRgb) {
    const dimmer = byRole('dimmer');
    panels += controlPanel('Luz', '◉', `${choices(dimmer, [['Apagada', 0], ['Fraca', 64], ['Média', 140], ['Forte', 255]])}${row('dimmer', 'Intensidade')}`, 'Apagar conserva a cor escolhida para você reacender depois.');
    const swatches = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#a000ff', '#ff00aa', '#ffffff'];
    const palette = `<div class="rgb-control"><div class="color-swatches">${swatches.map(color => `<button type="button" class="color-swatch" style="--swatch:${color}" data-action="apply-rgb" data-id="${escapeHtml(fixture.id)}" data-color="${color}" aria-label="Escolher cor ${color}"></button>`).join('')}</div><div class="color-picker-line"><input class="rgb-picker" type="color" value="${rgbHex}" aria-label="Escolher qualquer cor"><button class="button small" type="button" data-action="apply-rgb" data-id="${escapeHtml(fixture.id)}">Aplicar cor</button></div></div>`;
    panels += controlPanel('Cores', '◈', `${palette}<div class="rgb-sliders">${row('red', 'Vermelho')}${row('green', 'Verde')}${row('blue', 'Azul')}</div><div class="control-divider"></div>${row('white', 'Branco')}${row('whiteStrobe', 'Branco com strobo')}${row('effect', 'Cores sortidas')}`, 'Escolher uma cor acende a luz, desliga branco, strobo e cores sortidas. Esses três modos também podem ser ajustados separadamente.');
  } else if (fixture.type === 'Moving' && pan && tilt) {
    const lamp = byRole('lamp');
    panels += controlPanel('Lâmpada', '◉', `${choices(lamp, [['Fechada', 0]])}${row('lamp', 'Abertura / lâmpada')}${row('strobe', 'Estrobo')}`, 'O valor para abrir pode variar por modelo. Ajuste a barra até encontrar o ponto correto e salve a cena.');
    panels += controlPanel('Cores e gobos', '◈', `${namedChoices(byRole('colorWheel'))}${row('colorWheel', 'Cor')}${namedChoices(byRole('gobo'))}${row('gobo', 'Gobo')}`, manualNote);
    panels += controlPanel('Posição e movimento', '✣', `${positionPad}${row('pan', 'Horizontal')}${row('tilt', 'Vertical')}${row('speed', 'Velocidade')}${namedChoices(byRole('macro'))}${row('macro', 'Movimento automático / macro')}`, 'Clique no quadro para apontar o moving. A transição suave é definida na sequência de cenas.');
  } else if (fixture.type === 'Ribalta' && byRole('effect')) {
    panels += controlPanel('Cores e efeitos', '◈', `${choices(byRole('effect'), [['Apagar', 0]])}${namedChoices(byRole('effect'))}${row('effect', 'Escolher cor / efeito')}`, manualNote);
    panels += controlPanel('Velocidade', '↝', `${row('speed', 'Velocidade do efeito')}`, 'A velocidade faz diferença nos efeitos automáticos da ribalta.');
  } else {
    panels += controlPanel('Controles', '◉', entries.map(entry => `${namedChoices(entry)}${channelRow(entry.number, entry.label, entry.value)}`).join(''), 'Este aparelho usa um perfil personalizado. Nomeie os canais em Equipamentos para tornar os controles mais claros.');
  }
  return `<section class="fixture-scene"><div class="fixture-scene-head"><strong>${escapeHtml(fixture.name)}</strong><small>${escapeHtml(fixture.type)} · DMX ${fixture.address}–${fixture.address + fixture.channels - 1}</small></div><div class="control-windows">${panels}</div><details class="advanced-channels"><summary>Valores DMX avançados</summary><div class="channel-list">${entries.map(entry => channelRow(entry.number, `${entry.label} · canal ${entry.number - fixture.address + 1}`, entry.value)).join('')}</div></details></section>`;
}
function editScene(sceneId) {
  const existing = state.scenes.find(item => item.id === sceneId);
  const scene = existing || { name: '', color: '#865cff', channels: {} };
  const covered = new Set(state.fixtures.flatMap(fixture => Array.from({ length: fixture.channels }, (_, index) => fixture.address + index)));
  const free = Object.entries(scene.channels || {}).filter(([number]) => !covered.has(Number(number)) && Number(number) >= 1 && Number(number) <= 512).map(([number, value]) => channelRow(Number(number), 'Canal livre', Math.max(0, Math.min(255, Number(value) || 0)))).join('');
  showDialog(`<h2>${existing ? 'Editar cena' : 'Nova cena'}</h2><p>Monte a cena por aparelho. Uma cena envia o estado completo; canais não definidos ficam em zero.</p><form id="sceneForm" data-id="${escapeHtml(existing?.id || '')}"><div class="form-grid">${field('Nome', 'sceneName', scene.name, 'text', 'required maxlength="80"')}${field('Cor do botão', 'sceneColor', scene.color, 'color')}</div><div class="scene-fixtures">${state.fixtures.map(fixture => fixtureSceneCard(fixture, scene)).join('') || '<p>Cadastre equipamentos antes de criar a cena.</p>'}</div>${free ? `<details><summary>Canais fora do cadastro atual</summary><div class="channel-list">${free}</div></details>` : ''}${footer(existing ? `<button class="button danger" type="button" data-action="delete-scene" data-id="${escapeHtml(existing.id)}">Excluir</button>` : '', '<button class="button" type="button" data-action="preview-scene">Testar luz sem salvar</button>')}</form>`);
}
function sceneChannelsFromForm(form) {
  const channels = {};
  form.querySelectorAll('.channel-row').forEach(row => {
    const value = Math.max(0, Math.min(255, Number(row.querySelector('input[type=number]').value) || 0));
    if (value) channels[row.dataset.channel] = value;
  });
  return channels;
}
function stepHtml(step = {}) {
  return `<div class="step-row"><select class="step-scene" aria-label="Cena">${state.scenes.map(scene => `<option value="${escapeHtml(scene.id)}" ${scene.id === step.sceneId ? 'selected' : ''}>${escapeHtml(scene.name)}</option>`).join('')}</select><input class="step-fade" aria-label="Transição em segundos" type="number" min="0" max="600" step="0.1" value="${Math.max(0, Number(step.fade) || 0)}"><input class="step-hold" aria-label="Permanência em segundos" type="number" min="1" value="${Math.max(1, Number(step.hold) || 10)}"><button type="button" class="button" data-action="remove-step" title="Remover passo">×</button></div>`;
}
function editSequence(sequenceId) {
  if (!state.scenes.length) return toast('Crie uma cena antes de criar a sequência.');
  const existing = state.sequences.find(item => item.id === sequenceId);
  const sequence = existing || { name: '', steps: [{ sceneId: state.scenes[0].id, hold: 10 }] };
  showDialog(`<h2>${existing ? 'Editar sequência' : 'Nova sequência'}</h2><p>Transição move posição e mistura intensidade/RGB; cor de roda, gobo e efeitos mudam diretamente. Depois da transição, a cena permanece pelo tempo indicado.</p><form id="sequenceForm" data-id="${escapeHtml(existing?.id || '')}">${field('Nome', 'sequenceName', sequence.name, 'text', 'required maxlength="80"')}<div class="step-head"><span>Cena</span><span>Transição (s)</span><span>Permanência (s)</span><span></span></div><div id="stepList">${sequence.steps.map(stepHtml).join('')}</div><button type="button" class="button small" data-action="add-step">+ Adicionar passo</button>${footer(existing ? `<button class="button danger" type="button" data-action="delete-sequence" data-id="${escapeHtml(existing.id)}">Excluir</button>` : '')}</form>`);
}

async function playScene(sceneId, fromSequence = false) {
  const scene = state.scenes.find(item => item.id === sceneId);
  if (!scene) return;
  if (!dmx.connected) return toast('Conecte a interface USB antes de ativar a cena.');
  if (!Object.values(scene.channels || {}).some(value => Number(value) > 0)) return toast('Esta cena ainda não possui valores DMX. Abra Cenas → Editar.');
  if (!fromSequence && activeSequenceName) stopSequence(false);
  dmx.setChannels(scene.channels);
  activeSceneId = scene.id;
  render();
  toast(`Cena “${scene.name}” enviada.`);
}
function stopSequence(showMessage = true) { activeSequenceToken++; activeSequenceName = ''; render(); if (showMessage) toast('Sequência interrompida. A cena atual permanece ativa.'); }
async function transitionTo(scene, seconds, token) {
  const duration = Math.min(600, Math.max(0, Number(seconds) || 0)) * 1000;
  if (!duration) { dmx.setChannels(scene.channels); return; }
  const starting = Uint8Array.from(dmx.frame);
  const target = new Uint8Array(513);
  for (const [address, value] of Object.entries(scene.channels || {})) if (Number(address) >= 1 && Number(address) <= 512) target[Number(address)] = Math.max(0, Math.min(255, Number(value) || 0));
  const continuous = continuousChannelAddresses(state.fixtures);
  const began = performance.now();
  while (token === activeSequenceToken && dmx.connected) {
    const progress = Math.min(1, (performance.now() - began) / duration);
    const frame = {};
    for (let channel = 1; channel <= 512; channel++) {
      const value = continuous.has(channel) ? Math.round(starting[channel] + (target[channel] - starting[channel]) * progress) : target[channel];
      if (value) frame[channel] = value;
    }
    dmx.setChannels(frame);
    if (progress >= 1) break;
    await wait(40);
  }
}
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
    const scene = state.scenes.find(item => item.id === step.sceneId);
    await transitionTo(scene, step.fade, token);
    if (token !== activeSequenceToken || !dmx.connected) break;
    activeSceneId = scene.id;
    render();
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
  if (action === 'apply-image-map') {
    if (!confirm('Substituir apenas o cadastro dos equipamentos pelo mapa das imagens do FreeStyler (12/2/8 canais, DMX 1–60)? As cenas atuais serão mantidas, mas os endereços delas talvez precisem de revisão. Exporte um backup antes de continuar.')) return;
    state.fixtures = imageFixtures(); save(); toast('Mapa das imagens aplicado. Revise os canais das cenas existentes.');
  }
  if (action === 'export') exportConfig();
  if (action === 'import') importConfig();
  if (action === 'check-update') checkUpdate();
  if (action === 'apply-update') applyUpdate();
});
$('#editorDialog').addEventListener('click', event => {
  const pad = event.target.closest('.position-pad');
  if (pad) {
    const rect = pad.getBoundingClientRect();
    setEditorChannel(Number(pad.dataset.pan), Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 255));
    setEditorChannel(Number(pad.dataset.tilt), Math.round((1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))) * 255));
    updatePositionDots();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'close-dialog') closeDialog();
  if (action === 'add-step') $('#stepList').insertAdjacentHTML('beforeend', stepHtml({ sceneId: state.scenes[0].id, hold: 10 }));
  if (action === 'remove-step') button.closest('.step-row').remove();
  if (action === 'set-channel') setEditorChannel(Number(button.dataset.channel), Number(button.dataset.value));
  if (action === 'load-profile' || action === 'generate-channels') {
    const type = $('#fixtureType').value.trim();
    const template = PROFILE_CHANNELS[type];
    if (action === 'load-profile' && !template) return toast('Digite Moving, Ribalta ou PAR LED para carregar um perfil.');
    const channels = action === 'load-profile' ? template.length : Number($('#fixtureChannels').value);
    if (!Number.isInteger(channels) || channels < 1 || channels > 512) return toast('Informe entre 1 e 512 canais.');
    if (!confirm('Recriar os nomes e funções dos canais? Alterações ainda não salvas nesse mapa serão descartadas.')) return;
    $('#fixtureChannels').value = channels;
    $('#fixtureChannelList').innerHTML = fixtureChannelRows({ type: action === 'load-profile' ? type : 'Personalizado', channels });
  }
  if (action === 'apply-rgb') {
    const fixture = state.fixtures.find(item => item.id === id);
    if (!fixture) return;
    const hex = button.dataset.color || button.closest('.rgb-control').querySelector('.rgb-picker').value;
    for (const [index, role] of ['red', 'green', 'blue'].entries()) setEditorChannel(channelForRole(fixture, role), parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16));
    const dimmer = channelForRole(fixture, 'dimmer');
    if (dimmer !== null) setEditorChannel(dimmer, 255);
    channelDefinitions(fixture).forEach((def, index) => { if (['white', 'whiteStrobe', 'effect'].includes(def.role)) setEditorChannel(fixture.address + index, 0); });
    button.closest('.control-window').querySelector('.rgb-picker').value = hex;
    toast('Cor aplicada à cena. Salve a cena para guardar.');
  }
  if (action === 'preview-scene') {
    if (!dmx.connected) return toast('Conecte a interface antes de testar a luz.');
    stopSequence(false);
    dmx.setChannels(sceneChannelsFromForm($('#sceneForm')));
    activeSceneId = null;
    toast('Valores enviados aos aparelhos sem salvar a cena.');
  }
  if (action.startsWith('delete-')) {
    if (!confirm('Excluir este item?')) return;
    if (action === 'delete-scene') { state.scenes = state.scenes.filter(x => x.id !== id); state.sequences.forEach(sequence => sequence.steps = sequence.steps.filter(step => step.sceneId !== id)); }
    if (action === 'delete-sequence') state.sequences = state.sequences.filter(x => x.id !== id);
    if (action === 'delete-fixture') state.fixtures = state.fixtures.filter(x => x.id !== id);
    save(); closeDialog();
  }
});
function readEditorChannel(number) { return Number(document.querySelector(`#sceneForm .channel-row[data-channel="${number}"] input[type=number]`)?.value || 0); }
function setEditorChannel(number, value) {
  if (number === null || number === undefined) return;
  const safe = Math.max(0, Math.min(255, Number(value) || 0));
  document.querySelectorAll(`#sceneForm .channel-row[data-channel="${number}"]`).forEach(row => {
    row.querySelector('input[type=range]').value = safe;
    row.querySelector('input[type=number]').value = safe;
  });
  document.querySelectorAll(`#sceneForm .choice-button[data-channel="${number}"]`).forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.value) === safe)));
  updatePositionDots();
}
function updatePositionDots() {
  document.querySelectorAll('#sceneForm .position-pad').forEach(pad => {
    const dot = pad.querySelector('.position-dot');
    dot.style.left = `${readEditorChannel(pad.dataset.pan) / 255 * 100}%`;
    dot.style.top = `${(255 - readEditorChannel(pad.dataset.tilt)) / 255 * 100}%`;
  });
}
$('#editorDialog').addEventListener('input', event => {
  const row = event.target.closest('.channel-row');
  if (!row) return;
  setEditorChannel(Number(row.dataset.channel), Number(event.target.value));
});
$('#editorDialog').addEventListener('change', event => {
  const picker = event.target.closest('.preset-picker');
  if (picker && picker.value !== '') setEditorChannel(Number(picker.dataset.channel), Number(picker.value));
});
$('#editorDialog').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const existingId = form.dataset.id;
  if (form.id === 'fixtureForm') {
    const address = Number($('#fixtureAddress').value), channels = Number($('#fixtureChannels').value);
    if (!Number.isInteger(address) || !Number.isInteger(channels) || address < 1 || channels < 1 || address + channels - 1 > 512) return toast('O equipamento deve ocupar apenas canais de 1 a 512.');
    const rows = [...form.querySelectorAll('.fixture-channel-row')];
    if (rows.length !== channels) return toast('Clique em “Ajustar quantidade de canais” antes de salvar.');
    let channelDefs;
    try {
      channelDefs = rows.map((row, index) => ({
        label: row.querySelector('.channel-label').value.trim() || `Canal ${index + 1}`,
        role: row.querySelector('.channel-role').value,
        presets: row.querySelector('.channel-presets').value.split(/[;\n]+/).map(text => text.trim()).filter(Boolean).map(text => {
          const match = text.match(/^([^=]+)=\s*(\d{1,3})$/);
          if (!match || Number(match[2]) > 255) throw new Error(`Valor nomeado inválido no canal ${index + 1}: ${text}`);
          return { name: match[1].trim(), value: Number(match[2]) };
        })
      }));
    } catch (error) { return toast(error.message); }
    const fixture = { id: existingId || uid(), name: $('#fixtureName').value.trim(), type: $('#fixtureType').value.trim() || 'Personalizado', address, channels, channelDefs };
    const index = state.fixtures.findIndex(x => x.id === existingId);
    if (index >= 0) state.fixtures[index] = fixture; else state.fixtures.push(fixture);
  }
  if (form.id === 'sceneForm') {
    const channels = sceneChannelsFromForm(form);
    const scene = { id: existingId || uid(), name: $('#sceneName').value.trim(), color: $('#sceneColor').value, channels };
    const index = state.scenes.findIndex(x => x.id === existingId);
    if (index >= 0) state.scenes[index] = scene; else state.scenes.push(scene);
  }
  if (form.id === 'sequenceForm') {
    const steps = [...form.querySelectorAll('.step-row')].map(row => ({ sceneId: row.querySelector('.step-scene').value, hold: Math.max(1, Math.floor(Number(row.querySelector('.step-hold').value) || 1)), fade: Math.max(0, Math.min(600, Number(row.querySelector('.step-fade').value) || 0)) }));
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
