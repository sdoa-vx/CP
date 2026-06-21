/* global dashboard.js — SDOA Engine Control Center v1.1 */
'use strict';

// ── Panel routing ─────────────────────────────────────────────────────────────
let activePanel = 'overview';

function showPanel(id, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sidenav-item').forEach(i => i.classList.remove('active'));
  const panel = document.getElementById('panel-' + id);
  if (panel) panel.classList.add('active');
  if (el) el.classList.add('active');
  activePanel = id;

  // Lazy-load on first visit
  if (id === 'heatmap' && !heatmapLoaded) loadHeatmap();
  if (id === 'telemetry') drawCharts();
  if (id === 'detectors') renderDetectors();
}

// ── State ─────────────────────────────────────────────────────────────────────
let latestState = null;
let eventCount = 0;
let heatmapLoaded = false;

const DETECTOR_META = [
  { key: 'uiPrimitive', label: 'UI Primitive Detector', desc: 'Finds repeated JSX element structures across ≥3 files' },
  { key: 'workflow',    label: 'Workflow Detector',     desc: 'Detects repeated fetch() endpoint calls across ≥3 files' },
  { key: 'schema',      label: 'Schema Detector',       desc: 'Matches structurally identical interfaces/type aliases across ≥2 files' },
  { key: 'token',       label: 'Token Detector',        desc: 'Identifies hex colours and px values reused in ≥3 CSS files' },
  { key: 'engine',      label: 'Engine Detector',       desc: 'Finds repeated child_process exec/spawn/fork calls across ≥2 files' },
];

// ── Telemetry series ring buffer (client-side mirror) ─────────────────────────
const SERIES_MAX = 60;
const seriesAst   = [];
const seriesQueue = [];
const seriesHits  = [];

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const base = globalThis.location.origin;
  const res = await fetch(base + '/dashboard' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    credentials: 'include',
  });
  return res;
}

// ── Overview polling ──────────────────────────────────────────────────────────
async function refreshState() {
  try {
    const res = await apiFetch('/api/state');
    if (!res.ok) return;
    const s = await res.json();
    latestState = s;

    // Engine state pill
    const pill = document.getElementById('engineStatePill');
    const label = document.getElementById('engineStateLabel');
    if (pill && label) {
      pill.dataset.state = s.engineState;
      label.textContent = s.engineState.toUpperCase();
    }

    // Overview stat cards
    setText('ov-engineState', s.engineState.toUpperCase());
    setText('ov-lastScan', s.lastScan ? new Date(s.lastScan).toLocaleTimeString() : 'Never');
    setText('ov-queueDepth', s.queueDepth);
    setText('ov-pendingSync', s.pendingSync);
    setText('ov-astCacheSize', s.astCacheSize);
    setText('ov-sqliteSize', formatBytes(s.sqliteSize));
    setText('ov-syncStatus', s.syncStatus.toUpperCase());
    setText('ov-uptime', s.uptime);
    setText('sidebarUptime', s.uptime + 's');

    // Refresh indicator
    const ri = document.getElementById('overviewRefresh');
    if (ri) { ri.textContent = 'Updated ' + new Date().toLocaleTimeString(); }

    // Push to client-side series
    const totalHits = Object.values(s.detectorHits).reduce((a, b) => a + b, 0);
    pushSeries(seriesAst,   s.astCacheSize);
    pushSeries(seriesQueue, s.queueDepth);
    pushSeries(seriesHits,  totalHits);

    // Refresh telemetry charts if visible
    if (activePanel === 'telemetry') drawCharts();
    if (activePanel === 'detectors') renderDetectors();
  } catch (e) { console.warn("State refresh error:", e); }
}

function pushSeries(arr, val) {
  arr.push(val);
  if (arr.length > SERIES_MAX) arr.shift();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function formatBytes(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

// ── Detector panel ────────────────────────────────────────────────────────────
function renderDetectors() {
  const grid = document.getElementById('detectorGrid');
  if (!grid || !latestState) return;

  const hits = latestState.detectorHits || {};
  const maxHits = Math.max(1, ...Object.values(hits));

  grid.innerHTML = DETECTOR_META.map(det => {
    const count = hits[det.key] || 0;
    const pct = Math.min(100, Math.round((count / maxHits) * 100));
    const hasHits = count > 0;
    return `
      <div class="detector-card ${hasHits ? 'has-hits' : ''}">
        <div class="detector-name">${det.label}</div>
        <p style="font-size:11px;color:var(--text-3);margin-bottom:10px;">${det.desc}</p>
        <div class="detector-meta">
          <div class="detector-meta-item">
            <span class="detector-meta-label">Hits</span>
            <span class="detector-meta-value">${count}</span>
          </div>
          <div class="detector-meta-item">
            <span class="detector-meta-label">Status</span>
            <span class="detector-meta-value" style="color:${hasHits ? 'var(--green)' : 'var(--text-3)'}">${hasHits ? 'TRIGGERED' : 'WATCHING'}</span>
          </div>
        </div>
        <div class="detector-bar-wrap">
          <div class="detector-bar" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ── Telemetry charts (pure Canvas) ───────────────────────────────────────────
function drawSparkline(canvasId, data, color, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 400;
  const H = canvas.offsetHeight || 160;
  canvas.width = W;
  canvas.height = H;

  const PAD = { top: 16, right: 12, bottom: 28, left: 44 };
  const w = W - PAD.left - PAD.right;
  const h = H - PAD.top - PAD.bottom;

  ctx.clearRect(0, 0, W, H);

  if (data.length < 2) {
    ctx.fillStyle = '#566880';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Collecting data…', W / 2, H / 2);
    return;
  }

  const maxVal = Math.max(1, ...data);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const xStep = w / (data.length - 1);
  const yScale = h / range;

  const px = (i) => PAD.left + i * xStep;
  const py = (v) => PAD.top + h - (v - minVal) * yScale;

  // Grid lines
  ctx.strokeStyle = '#1c2130';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = PAD.top + (h / 4) * g;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + w, y); ctx.stroke();
    const val = Math.round(maxVal - (maxVal / 4) * g);
    ctx.fillStyle = '#566880';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(val, PAD.left - 6, y + 3);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + h);
  grad.addColorStop(0, color + '44');
  grad.addColorStop(1, color + '00');

  ctx.beginPath();
  ctx.moveTo(px(0), py(data[0]));
  for (let i = 1; i < data.length; i++) {
    const x0 = px(i - 1), y0 = py(data[i - 1]);
    const x1 = px(i), y1 = py(data[i]);
    const cpX = (x0 + x1) / 2;
    ctx.bezierCurveTo(cpX, y0, cpX, y1, x1, y1);
  }
  ctx.lineTo(px(data.length - 1), py(0));
  ctx.lineTo(px(0), py(0));
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(px(0), py(data[0]));
  for (let i = 1; i < data.length; i++) {
    const x0 = px(i - 1), y0 = py(data[i - 1]);
    const x1 = px(i), y1 = py(data[i]);
    const cpX = (x0 + x1) / 2;
    ctx.bezierCurveTo(cpX, y0, cpX, y1, x1, y1);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Last value dot
  const lx = px(data.length - 1), ly = py(data[data.length - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawCharts() {
  drawSparkline('chartAstCache',    seriesAst,   '#4f8ef7', 'AST Cache');
  drawSparkline('chartQueueDepth',  seriesQueue, '#e8b45c', 'Queue Depth');
  drawSparkline('chartDetectorHits',seriesHits,  '#3fb27f', 'Detector Hits');
}

// ── SSE event stream ──────────────────────────────────────────────────────────
const TYPE_CLASS = {
  scan:     ['scan:start','scan:complete'],
  sync:     ['sync:start','sync:flush','sync:error'],
  engine:   ['engine:start','engine:restart'],
  detector: ['detector:hit','detector:uiPrimitive','detector:workflow','detector:schema','detector:token','detector:engine'],
  cache:    ['cache:cleared'],
  ast:      ['ast:cacheWarmed'],
};

function typeClass(type) {
  for (const [cls, types] of Object.entries(TYPE_CLASS)) {
    if (types.includes(type)) return cls;
  }
  return '';
}

function appendEvent(ev) {
  const stream = document.getElementById('eventStream');
  if (!stream) return;

  const line = document.createElement('div');
  line.className = 'event-line';
  const cls = typeClass(ev.type);
  line.innerHTML = `
    <span class="event-ts">${ev.time || ''}</span>
    <span class="event-type ${cls}">${ev.type}</span>
    <span class="event-msg">${ev.message || ''}</span>
  `;
  stream.prepend(line);

  // Cap at 200 entries in the DOM
  while (stream.children.length > 200) stream.lastElementChild?.remove();

  eventCount++;
  const badge = document.getElementById('eventCount');
  if (badge) badge.textContent = eventCount > 99 ? '99+' : eventCount;
}

function connectEventStream() {
  const sseEl = document.getElementById('sseStatus');
  const url = globalThis.location.origin + '/dashboard/api/events?stream=true';
  const es = new EventSource(url);

  es.onopen = () => {
    if (sseEl) { sseEl.textContent = '● Live'; sseEl.className = 'sse-status connected'; }
  };

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      // Backlog packet contains an array of events
      if (data.topic === 'backlog' && Array.isArray(data.payload?.events)) {
        // Render oldest first (they'll prepend, so reverse)
        [...data.payload.events].reverse().forEach(appendEvent);
      } else {
        appendEvent(data);
      }
    } catch (e) { console.warn("SSE parse error:", e); }
  };

  es.onerror = () => {
    if (sseEl) { sseEl.textContent = '● Disconnected'; sseEl.className = 'sse-status error'; }
    // Auto-reconnect via EventSource default behavior
  };
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
async function loadHeatmap() {
  heatmapLoaded = true;
  const tree = document.getElementById('heatmapTree');
  if (!tree) return;
  tree.innerHTML = '<div class="loading-msg">Scanning workspace…</div>';

  try {
    const res = await apiFetch('/api/heatmap');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const scores = await res.json();

    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      tree.innerHTML = '<div class="loading-msg">No scorable files found — submit some proposals first.</div>';
      return;
    }

    tree.innerHTML = entries.map(([file, score]) => {
      const pct = Math.round(score * 100);
      let fillColor = 'var(--green)';
      if (score > 0.6) fillColor = 'var(--red)';
      else if (score > 0.25) fillColor = 'var(--orange)';
      return `
        <div class="heat-row">
          <div class="heat-bar">
            <div class="heat-bar-fill" style="width:${pct}%;background:${fillColor}"></div>
          </div>
          <span class="heat-file" title="${file}">${file}</span>
          <span class="heat-score" style="color:${fillColor}">${pct}%</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    tree.innerHTML = `<div class="loading-msg" style="color:var(--red)">Error loading heatmap: ${err.message}</div>`;
  }
}

// ── Action buttons ────────────────────────────────────────────────────────────
async function runAction(action) {
  try {
    const res = await apiFetch('/api/actions/' + action, { method: 'POST' });
    const data = await res.json();
    if (!data.ok) throw new Error(JSON.stringify(data));
    // State will update on next poll
  } catch (err) {
    console.error('[SDOA Dashboard] Action error:', err);
  }
}

async function triggerScan(type) {
  // For file scan, prompt for path; workspace scan uses server cwd
  if (type === 'file') {
    const target = prompt('Enter absolute path to file:');
    if (!target) return;
    await apiFetch('/api/scan', {
      method: 'POST',
      body: JSON.stringify({ path: target, type: 'file' }),
    });
  } else {
    await runAction('scan-workspace');
  }
}

async function restartEngine() {
  await runAction('restart');
}

// ── Settings ──────────────────────────────────────────────────────────────────
function saveSettings() {
  const settings = {};
  ['uiPrimitive','workflow','schema','token','engine','supabaseSync','federationSync'].forEach(k => {
    const el = document.getElementById('tog-' + k);
    if (el) settings[k] = el.checked;
  });
  localStorage.setItem('sdoa-settings', JSON.stringify(settings));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('sdoa-settings') || '{}');
    Object.entries(saved).forEach(([k, v]) => {
      const el = document.getElementById('tog-' + k);
      if (el) el.checked = v;
    });
  } catch (e) { console.warn("Load settings error:", e); }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  refreshState();
  setInterval(refreshState, 3000);
  connectEventStream();

  // Redraw charts on resize
  window.addEventListener('resize', () => {
    if (activePanel === 'telemetry') drawCharts();
  });
});
