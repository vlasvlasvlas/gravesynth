import { STATE, getSelectedObject, updateObjectData } from './state.js';
import * as yaml from 'js-yaml';

const PRESETS = {
  moog: `
type: "MonoSynth"
oscillator:
  type: "sawtooth"
envelope:
  attack: 0.001
  decay: 0.1
  sustain: 0.5
  release: 1
filter:
  Q: 2
  type: "lowpass"
  rolloff: -24
filterEnvelope:
  attack: 0.001
  decay: 0.2
  sustain: 0.5
  release: 2
  baseFrequency: 200
  octaves: 4
`.trim(),

  spacelady: `
type: "FMSynth"
harmonicity: 3
modulationIndex: 10
oscillator:
  type: "sine"
modulation:
  type: "square"
envelope:
  attack: 0.01
  decay: 0.5
  sustain: 0.2
  release: 2
modulationEnvelope:
  attack: 0.5
  decay: 0.1
  sustain: 0.2
  release: 0.5
`.trim(),

  cosmos: `
type: "AMSynth"
harmonicity: 0.5
oscillator:
  type: "triangle"
modulation:
  type: "sine"
envelope:
  attack: 0.5
  decay: 1
  sustain: 0.8
  release: 4
modulationEnvelope:
  attack: 0.5
  decay: 0.1
  sustain: 1
  release: 0.5
`.trim(),

  vangelis: `
type: "MonoSynth"
oscillator:
  type: "sawtooth"
envelope:
  attack: 1.0
  decay: 2.0
  sustain: 0.8
  release: 3.0
filter:
  type: "lowpass"
  Q: 1
filterEnvelope:
  attack: 1.0
  decay: 2.0
  sustain: 0.5
  release: 3.0
  baseFrequency: 300
  octaves: 3
`.trim(),

  daftpunk: `
type: "MonoSynth"
oscillator:
  type: "square"
envelope:
  attack: 0.005
  decay: 0.1
  sustain: 0.1
  release: 0.5
filter:
  type: "lowpass"
  Q: 5
filterEnvelope:
  attack: 0.005
  decay: 0.1
  sustain: 0
  release: 0.1
  baseFrequency: 100
  octaves: 5
`.trim()
};

export function initUI() {
  const body = document.body;

  // Theme toggle
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'icon-btn';
  toggleBtn.id = 'btn-theme';
  toggleBtn.title = 'Toggle Dark Mode';
  toggleBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="9" cy="9" r="3.5"/>
    <line x1="9" y1="1" x2="9" y2="3"/>
    <line x1="9" y1="15" x2="9" y2="17"/>
    <line x1="1" y1="9" x2="3" y2="9"/>
    <line x1="15" y1="9" x2="17" y2="9"/>
    <line x1="3.05" y1="3.05" x2="4.46" y2="4.46"/>
    <line x1="13.54" y1="13.54" x2="14.95" y2="14.95"/>
    <line x1="14.95" y1="3.05" x2="13.54" y2="4.46"/>
    <line x1="4.46" y1="13.54" x2="3.05" y2="14.95"/>
  </svg>`;
  document.querySelector('.nav-right').prepend(toggleBtn);

  toggleBtn.addEventListener('click', () => {
    STATE.darkMode = !STATE.darkMode;
    body.classList.toggle('dark-mode', STATE.darkMode);
    toggleBtn.innerHTML = STATE.darkMode
      ? `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 9.5A6 6 0 1 1 8.5 3a4.5 4.5 0 0 0 6.5 6.5z"/></svg>`
      : `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="9" cy="9" r="3.5"/>
          <line x1="9" y1="1" x2="9" y2="3"/><line x1="9" y1="15" x2="9" y2="17"/>
          <line x1="1" y1="9" x2="3" y2="9"/><line x1="15" y1="9" x2="17" y2="9"/>
          <line x1="3.05" y1="3.05" x2="4.46" y2="4.46"/><line x1="13.54" y1="13.54" x2="14.95" y2="14.95"/>
          <line x1="14.95" y1="3.05" x2="13.54" y2="4.46"/><line x1="4.46" y1="13.54" x2="3.05" y2="14.95"/>
        </svg>`;
  });

  // Toolbar
  const toolBtns = document.querySelectorAll('.tool-btn');
  toolBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      toolBtns.forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      STATE.activeTool = target.getAttribute('data-tool');
      document.body.dataset.tool = STATE.activeTool;
      STATE.selectedObjectId = null;
      closeSidebar();
    });
  });
  // Set initial cursor
  document.body.dataset.tool = STATE.activeTool;

  // Sidebar & Modal
  document.getElementById('btn-settings').addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('hidden')) openSidebar();
    else closeSidebar();
  });
  document.getElementById('btn-close-sidebar').addEventListener('click', closeSidebar);
  document.getElementById('btn-help').addEventListener('click', () =>
    document.getElementById('modal-help').classList.remove('hidden'));
  document.getElementById('btn-close-modal').addEventListener('click', () =>
    document.getElementById('modal-help').classList.add('hidden'));
  document.getElementById('btn-close-yaml-modal')?.addEventListener('click', () =>
    document.getElementById('modal-yaml-help').classList.add('hidden'));
  document.getElementById('modal-yaml-help')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-yaml-help') e.currentTarget.classList.add('hidden');
  });

  // Panic button
  document.getElementById('btn-panic')?.addEventListener('click', () => {
    if (window.panicClear) window.panicClear();
  });

  // Keyboard shortcuts — only when not typing in inputs
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.metaKey || e.ctrlKey) return;
    const map = { s: 'select', l: 'line', p: 'portal', v: 'vacuum', e: 'eraser' };
    const tool = map[e.key.toLowerCase()];
    if (!tool) return;
    const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
    if (btn) btn.click();
  });
}

export function resetToolToSelect() {
  STATE.activeTool = 'select';
  document.body.dataset.tool = 'select';
  document.querySelectorAll('.tool-btn').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tool') === 'select');
  });
}

export function openSidebar() {
  const sidebar       = document.getElementById('sidebar');
  const sidebarContent = document.getElementById('sidebar-content');
  const sidebarTitle  = document.getElementById('sidebar-title');
  sidebar.classList.remove('hidden');

  const selected = getSelectedObject();
  if (!selected) {
    sidebarTitle.innerText = 'Configuración Global';
    const masterVol = STATE.masterVolume ?? -6;
    sidebarContent.innerHTML = `
      <div class="form-group">
        <label>Tempo (BPM)</label>
        <div class="bpm-row">
          <input type="range" id="global-bpm" value="${STATE.bpm}" min="40" max="240" />
          <span id="bpm-display">${STATE.bpm}</span>
        </div>
      </div>
      <div class="form-group">
        <label>Volumen Master</label>
        <div class="bpm-row">
          <input type="range" id="global-volume" value="${masterVol}" min="-40" max="0" step="0.5" />
          <span id="vol-display">${masterVol} dB</span>
        </div>
      </div>
      <div class="form-group" style="margin-top:20px; opacity:0.6; font-size:0.8rem;">
        Selecciona un Portal o Aspiradora en el canvas para editar sus propiedades.
      </div>`;
    const bpmInput   = document.getElementById('global-bpm');
    const bpmDisplay = document.getElementById('bpm-display');
    bpmInput.addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value);
      bpmDisplay.textContent = bpm;
      if (window.notifyBpmUpdate) window.notifyBpmUpdate(bpm);
    });
    const volInput   = document.getElementById('global-volume');
    const volDisplay = document.getElementById('vol-display');
    volInput.addEventListener('input', (e) => {
      const db = parseFloat(e.target.value);
      volDisplay.textContent = db + ' dB';
      STATE.masterVolume = db;
      if (window.notifyMasterVolumeUpdate) window.notifyMasterVolumeUpdate(db);
    });
    return;
  }

  if (selected.type === 'portal') {
    sidebarTitle.innerText = 'Portal';
    renderPortalForm(sidebarContent, selected.data);
  } else if (selected.type === 'vacuum') {
    sidebarTitle.innerText = 'Aspiradora';
    renderVacuumForm(sidebarContent, selected.data);
  } else if (selected.type === 'line') {
    sidebarTitle.innerText = 'Línea';
    renderLineForm(sidebarContent, selected.data);
  }
}

export function closeSidebar() {
  document.getElementById('sidebar').classList.add('hidden');
}

function renderPortalForm(container, data) {
  const d = {
    note: 'C', scale: 'pentatonic', mode: 'random', rpm: 60, size: 15, volume: -6,
    synthPreset: 'moog', yamlConfig: PRESETS.moog,
    ...data
  };

  container.innerHTML = `
    <div class="form-group">
      <label>Volumen</label>
      <div class="bpm-row">
        <input type="range" id="prop-volume" value="${d.volume}" min="-40" max="0" step="0.5" />
        <span id="pvol-display">${d.volume} dB</span>
      </div>
    </div>
    <div class="form-group">
      <label>Nota Raíz</label>
      <select id="prop-note">${STATE.NOTES.map(n =>
        `<option value="${n}" ${n === d.note ? 'selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div class="form-group">
      <label>Escala</label>
      <select id="prop-scale">${Object.keys(STATE.SCALES).map(s =>
        `<option value="${s}" ${s === d.scale ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select>
    </div>
    <div class="form-group">
      <label>Modo de Emisión</label>
      <select id="prop-mode">
        <option value="random" ${d.mode === 'random' ? 'selected' : ''}>Aleatorio</option>
        <option value="up"     ${d.mode === 'up'     ? 'selected' : ''}>Arpegio ↑</option>
        <option value="down"   ${d.mode === 'down'   ? 'selected' : ''}>Arpegio ↓</option>
      </select>
    </div>
    <div class="form-group">
      <label>Velocidad (RPM)</label>
      <div class="bpm-row">
        <input type="range" id="prop-rpm" value="${d.rpm}" min="10" max="300" />
        <span id="rpm-display">${d.rpm}</span>
      </div>
    </div>
    <div class="form-group">
      <label>Tamaño de Pelota</label>
      <input type="range" id="prop-size" value="${d.size}" min="5" max="100" />
    </div>
    <div class="form-group">
      <label>Preset</label>
      <select id="prop-preset">
        <option value="custom"    ${d.synthPreset === 'custom'    ? 'selected' : ''}>Personalizado</option>
        <option value="moog"      ${d.synthPreset === 'moog'      ? 'selected' : ''}>Moog (Sawtooth Bass)</option>
        <option value="spacelady" ${d.synthPreset === 'spacelady' ? 'selected' : ''}>SpaceLady (FM Bells)</option>
        <option value="cosmos"    ${d.synthPreset === 'cosmos'    ? 'selected' : ''}>Cosmos (AM Pads)</option>
        <option value="vangelis"  ${d.synthPreset === 'vangelis'  ? 'selected' : ''}>Vangelis (Strings)</option>
        <option value="daftpunk"  ${d.synthPreset === 'daftpunk'  ? 'selected' : ''}>DaftPunk (Pluck)</option>
      </select>
    </div>
    <div class="form-group">
      <div class="label-with-action">
        <label for="prop-yaml">YAML Síntesis</label>
        <button type="button" id="btn-yaml-help" class="help-icon-btn" title="Ayuda para editar YAML" aria-label="Ayuda para editar YAML">?</button>
      </div>
      <textarea id="prop-yaml" class="yaml-editor">${d.yamlConfig}</textarea>
      <small id="yaml-error" style="color:red; display:none; margin-top:4px;"></small>
    </div>`;

  // Listeners
  const listen = (id, field, isNumber = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', (e) => {
      const val = isNumber ? parseFloat(e.target.value) : e.target.value;
      updateObjectData(data.id, { [field]: val });
      if (field === 'rpm') {
        document.getElementById('rpm-display').textContent = Math.round(val);
        if (window.notifyAudioUpdate) window.notifyAudioUpdate(data.id, { rpm: val });
      }
      if (field === 'mode') data._arpIndex = undefined; // reset arp on mode change
    });
  };
  listen('prop-note',  'note');
  listen('prop-scale', 'scale');
  listen('prop-mode',  'mode');
  listen('prop-rpm',   'rpm',  true);
  listen('prop-size',  'size', true);

  const pvolInput = document.getElementById('prop-volume');
  const pvolDisplay = document.getElementById('pvol-display');
  if (pvolInput) {
    pvolInput.addEventListener('input', (e) => {
      const db = parseFloat(e.target.value);
      pvolDisplay.textContent = db + ' dB';
      updateObjectData(data.id, { volume: db });
      if (window.notifyVolumeUpdate) window.notifyVolumeUpdate(data.id, db);
    });
  }

  document.getElementById('prop-preset').addEventListener('change', (e) => {
    const key = e.target.value;
    updateObjectData(data.id, { synthPreset: key });
    if (key !== 'custom' && PRESETS[key]) {
      const yamlStr = PRESETS[key];
      document.getElementById('prop-yaml').value = yamlStr;
      document.getElementById('yaml-error').style.display = 'none';
      try {
        const parsed = yaml.load(yamlStr);
        updateObjectData(data.id, { yamlConfig: yamlStr, parsedSynthDef: parsed });
        if (window.notifyAudioUpdate) window.notifyAudioUpdate(data.id, { parsedSynthDef: parsed });
      } catch (err) { console.error('Preset parse error', err); }
    }
  });

  const yamlInput = document.getElementById('prop-yaml');
  const yamlError = document.getElementById('yaml-error');
  document.getElementById('btn-yaml-help')?.addEventListener('click', () => {
    document.getElementById('modal-yaml-help').classList.remove('hidden');
  });
  yamlInput.addEventListener('input', (e) => {
    try {
      const parsed = yaml.load(e.target.value);
      yamlError.style.display = 'none';
      updateObjectData(data.id, { yamlConfig: e.target.value, parsedSynthDef: parsed, synthPreset: 'custom' });
      document.getElementById('prop-preset').value = 'custom';
      if (window.notifyAudioUpdate) window.notifyAudioUpdate(data.id, { parsedSynthDef: parsed });
    } catch (err) {
      yamlError.style.display = 'block';
      yamlError.textContent = 'YAML inválido: ' + err.message;
    }
  });
}

function renderVacuumForm(container, data) {
  const d = { power: 50, radius: 100, ...data };
  container.innerHTML = `
    <div class="form-group">
      <label>Fuerza de Succión</label>
      <div class="bpm-row">
        <input type="range" id="prop-power" value="${d.power}" min="1" max="100" />
        <span id="power-display">${d.power}</span>
      </div>
    </div>
    <div class="form-group">
      <label>Radio de Acción</label>
      <div class="bpm-row">
        <input type="range" id="prop-radius" value="${d.radius}" min="50" max="500" />
        <span id="radius-display">${d.radius}</span>
      </div>
    </div>`;

  document.getElementById('prop-power').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('power-display').textContent = Math.round(val);
    updateObjectData(data.id, { power: val });
  });
  document.getElementById('prop-radius').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('radius-display').textContent = Math.round(val);
    updateObjectData(data.id, { radius: val });
  });
}

const FX_AMOUNT_LABELS = {
  'reverb':           'Cola de reverb',
  'echo':             'Tiempo de eco',
  'portamento-up':    'Velocidad del slide',
  'portamento-down':  'Velocidad del slide',
  'portamento-random':'Velocidad del slide',
  'pitch-up':         null,
  'pitch-down':       null,
  'none':             null,
};

function renderLineForm(container, data) {
  const d = { style: 'solid', gapRatio: 0.4, fx: 'none', fxAmount: 0.5, restitution: 0.7, ...data };

  const fxOptions = [
    ['none',             'Sin efecto'],
    ['reverb',           'Reverb'],
    ['echo',             'Eco'],
    ['pitch-up',         'Octava arriba'],
    ['pitch-down',       'Octava abajo'],
    ['portamento-up',    'Portamento ↑'],
    ['portamento-down',  'Portamento ↓'],
    ['portamento-random','Portamento aleatorio'],
  ];

  const amountLabel   = FX_AMOUNT_LABELS[d.fx] ?? null;
  const showAmount    = amountLabel !== null;

  container.innerHTML = `
    <div class="form-group">
      <label>Estilo</label>
      <div class="toggle-row">
        <button class="toggle-btn ${d.style === 'solid'  ? 'active' : ''}" data-style="solid">Sólida</button>
        <button class="toggle-btn ${d.style === 'dashed' ? 'active' : ''}" data-style="dashed">Punteada</button>
      </div>
    </div>
    <div class="form-group" id="gap-group" style="${d.style === 'dashed' ? '' : 'display:none'}">
      <label>Separación entre segmentos</label>
      <div class="bpm-row">
        <input type="range" id="prop-gap" value="${d.gapRatio}" min="0.05" max="1" step="0.05" />
        <span id="gap-display">${Math.round(d.gapRatio * 100)}%</span>
      </div>
    </div>
    <div class="form-group">
      <label>Efecto sonoro</label>
      <select id="prop-fx">
        ${fxOptions.map(([val, label]) =>
          `<option value="${val}" ${d.fx === val ? 'selected' : ''}>${label}</option>`
        ).join('')}
      </select>
    </div>
    <div class="form-group" id="fxamount-group" style="${showAmount ? '' : 'display:none'}">
      <label id="fxamount-label">${amountLabel ?? ''}</label>
      <div class="bpm-row">
        <input type="range" id="prop-fxamount" value="${d.fxAmount}" min="0" max="1" step="0.05" />
        <span id="fxamount-display">${Math.round(d.fxAmount * 100)}%</span>
      </div>
    </div>
    <div class="form-group">
      <label>Rebote</label>
      <div class="bpm-row">
        <input type="range" id="prop-restitution" value="${d.restitution}" min="0.1" max="1.0" step="0.05" />
        <span id="restitution-display">${Math.round(d.restitution * 100)}%</span>
      </div>
    </div>`;

  // Style toggle — also rebuilds physics bodies so gaps are real
  container.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const style = btn.getAttribute('data-style');
      updateObjectData(data.id, { style });
      if (window.notifyLineRebuild) window.notifyLineRebuild(data.id);
      document.getElementById('gap-group').style.display = style === 'dashed' ? '' : 'none';
    });
  });

  document.getElementById('prop-gap').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('gap-display').textContent = Math.round(val * 100) + '%';
    updateObjectData(data.id, { gapRatio: val });
    if (window.notifyLineRebuild) window.notifyLineRebuild(data.id);
  });

  document.getElementById('prop-fx').addEventListener('change', (e) => {
    const fx = e.target.value;
    updateObjectData(data.id, { fx });
    const label = FX_AMOUNT_LABELS[fx] ?? null;
    const grp   = document.getElementById('fxamount-group');
    if (label) {
      document.getElementById('fxamount-label').textContent = label;
      grp.style.display = '';
    } else {
      grp.style.display = 'none';
    }
  });

  document.getElementById('prop-fxamount').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('fxamount-display').textContent = Math.round(val * 100) + '%';
    updateObjectData(data.id, { fxAmount: val });
  });

  document.getElementById('prop-restitution').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    document.getElementById('restitution-display').textContent = Math.round(val * 100) + '%';
    updateObjectData(data.id, { restitution: val });
    if (window.notifyLineRebuild) window.notifyLineRebuild(data.id);
  });
}

export function createPortal(x, y) {
  const parsedSynthDef = yaml.load(PRESETS.moog);
  const portal = {
    id: 'portal_' + Date.now(),
    x, y,
    note: 'C', scale: 'pentatonic', mode: 'random', rpm: 60, size: 15, volume: -6,
    synthPreset: 'moog',
    yamlConfig: PRESETS.moog,
    parsedSynthDef
  };
  STATE.portals.push(portal);
  STATE.selectedObjectId = portal.id;
  openSidebar();
  return portal;
}

export function createVacuum(x, y) {
  const vac = { id: 'vacuum_' + Date.now(), x, y, power: 50, radius: 100 };
  STATE.vacuums.push(vac);
  STATE.selectedObjectId = vac.id;
  openSidebar();
  return vac;
}
