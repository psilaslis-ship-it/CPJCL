let state;
let availableVersion = null;

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.style.display = 'block';
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.style.display = 'none', 3600);
}

async function init() {
  state = await window.lumen.getState();
  render();
  window.lumen.onUpdate(version => {
    availableVersion = version;
    const badge = document.querySelector('#update');
    badge.style.display = 'block';
    badge.textContent = 'Atualização ' + version + ' disponível';
  });
  window.lumen.onStatus(info => {
    document.querySelector('#status').textContent = info.status === 'connected' ? 'Interface conectada' : info.status === 'error' ? 'Erro na interface' : info.status;
    toast(info.details || info.status);
  });
}

function render() {
  document.querySelector('#scenes').innerHTML = state.scenes.map(scene => `<button class="scene" onclick="playScene('${scene.id}')"><div class="bar" style="background:${scene.color}"></div><b>${scene.name}</b><small class="muted">Clique para ativar</small></button>`).join('');
  document.querySelector('#sequences').innerHTML = state.sequences.map(sequence => `<div class="seq"><b>${sequence.name}</b><small>${sequence.steps.length} cenas programadas</small><button style="margin-top:10px" onclick="runSequence('${sequence.id}')">Executar</button></div>`).join('');
  document.querySelector('#fixtures').innerHTML = state.fixtures.map(fixture => `<div class="fixture"><b>${fixture.name}</b><small>DMX ${String(fixture.address).padStart(3,'0')} · ${fixture.channels} canais</small></div>`).join('');
}

async function playScene(id) {
  const scene = state.scenes.find(item => item.id === id);
  try { await window.lumen.play(scene); toast('Cena ' + scene.name + ' ativada'); }
  catch (error) { toast(error.message); }
}
async function blackout() { try { await window.lumen.blackout(); toast('Saída DMX apagada'); } catch (error) { toast(error.message); } }
async function runSequence(id) { const sequence = state.sequences.find(item => item.id === id); toast('Sequência ' + sequence.name + ' iniciada'); for (const step of sequence.steps) { await playScene(step.sceneId); await new Promise(resolve => setTimeout(resolve, Math.min(step.hold * 1000, 5000))); } }
async function openConnect() { document.querySelector('#connect').classList.add('open'); const ports = await window.lumen.listPorts(); document.querySelector('#ports').innerHTML = ports.length ? ports.map(port => `<option value="${port.path}">${port.path} — ${port.label}</option>`).join('') : '<option value="">Nenhuma porta encontrada</option>'; }
function closeModal() { document.querySelector('#connect').classList.remove('open'); }
async function connect() { const selected = document.querySelector('#ports').value; if (!selected) return toast('Nenhuma porta selecionada'); try { await window.lumen.connect(selected); closeModal(); } catch (error) { toast(error.message); } }
async function exportConfig() { const destination = await window.lumen.exportConfig(); if (destination) toast('Configuração exportada'); }
async function importConfig() { try { const imported = await window.lumen.importConfig(); if (imported) { state = imported; render(); toast('Configuração importada'); } } catch { toast('Arquivo de configuração inválido'); } }
function configIO() { toast('Use os botões Exportar/Importar para transferir a configuração'); }
async function updates() {
  try {
    if (!availableVersion) {
      const version = await window.lumen.checkUpdate();
      if (!version) return toast('Você já está na versão mais recente.');
      availableVersion = version;
    }
    if (confirm('Baixar a atualização ' + availableVersion + '? O Lumen será reiniciado ao final.')) {
      toast('Baixando atualização...');
      await window.lumen.installUpdate();
    }
  } catch (error) { toast(error.message); }
}
init();
