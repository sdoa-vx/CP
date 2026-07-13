import ControlCenter from './components/control-center.js';
import Pipeline from './components/pipeline.js';
import Scan from './components/scan.js';
import Mesh from './components/mesh.js';
import Lineage from './components/lineage.js';
import Drift from './components/drift.js';
import Fabrication from './components/fabrication.js';
import Registry from './components/registry.js';
import Lifecycle from './components/lifecycle.js';
import Routing from './components/routing.js';
import Audit from './components/audit.js';
import Timemachine from './components/timemachine.js';
import Governance from './components/governance.js';
import Prime from './components/prime.js';
import Library from './components/library.js';

const viewContainer = document.getElementById('view-container');
const viewTitle = document.getElementById('view-title');
const navLinks = document.querySelectorAll('.sdoa-nav-links a');

const views = {
  'control-center': ControlCenter,
  'pipeline': Pipeline,
  'scan': Scan,
  'mesh': Mesh,
  'lineage': Lineage,
  'drift': Drift,
  'fabrication': Fabrication,
  'registry': Registry,
  'lifecycle': Lifecycle,
  'routing': Routing,
  'timemachine': Timemachine,
  'governance': Governance,
  'prime': Prime,
  'audit': Audit,
  'library': Library
};

let currentView = null;

// Global Store for SSE Data
window.SESSION_START = Date.now();

window.SDOA_STATE = {
  proposals: [],
  innovations: [],
  mesh: { nodes: 142, activeConnections: 38, health: 'Optimal' },
  status: null,
  scanProgress: null,
  scanStats: { currentFile: '', scannedCount: 0, totalFiles: 0, currentHits: 0 },
  scanLog: [],
  driftAnomalies: 2,
  systemLogs: []
};

// Router
async function route() {
  const hash = window.location.hash || '#control-center';
  const viewName = hash.replace('#', '');
  
  // Update Nav
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-view') === viewName);
    if (link.getAttribute('data-view') === viewName) {
      viewTitle.textContent = link.textContent.trim().substring(3); // Remove emoji
    }
  });

  const ViewComponent = views[viewName];
  if (ViewComponent) {
    if (currentView && currentView.destroy) currentView.destroy();
    
    viewContainer.innerHTML = '';
    const element = await ViewComponent.render();
    if (typeof element === 'string') {
      viewContainer.innerHTML = element;
    } else {
      viewContainer.appendChild(element);
    }
    
    if (ViewComponent.init) ViewComponent.init();
    currentView = ViewComponent;
  }
}

window.addEventListener('hashchange', route);

// SSE Setup
function setupSSE() {
  const source = new EventSource('/dashboard/api/events?stream=true');
  
  source.addEventListener('scan:init', (e) => {
    try {
      const data = JSON.parse(e.data);
      window.SDOA_STATE.scanStats = { currentFile: 'Initializing...', scannedCount: 0, totalFiles: data.totalFiles, currentHits: 0 };
      window.SDOA_STATE.scanLog = [];
      if (currentView && currentView.onStateUpdate) currentView.onStateUpdate('scan');
    } catch(err) { console.error('SSE Error:', err); }
  });

  source.addEventListener('scan:progress', (e) => {
    try {
      const data = JSON.parse(e.data);
      window.SDOA_STATE.scanStats = data;
      if (data.currentFile && !data.currentFile.startsWith('Phase 1:')) {
        window.SDOA_STATE.scanLog.unshift(data.currentFile);
        if (window.SDOA_STATE.scanLog.length > 50) window.SDOA_STATE.scanLog.pop();
      }
      if (currentView && currentView.onStateUpdate) currentView.onStateUpdate('scan');
    } catch(err) { console.error('SSE Error:', err); }
  });

  source.addEventListener('detector:hit', (e) => {
    try {
      const data = JSON.parse(e.data);
      window.SDOA_STATE.innovations.unshift(data);
      if (currentView && currentView.onStateUpdate) currentView.onStateUpdate('innovations');
      if (window.triggerFireworks) window.triggerFireworks();
      
      window.SDOA_STATE.systemLogs.unshift({ message: `[DETECTOR] Hit found: ${data.name || data.file}`, timestamp: new Date().toISOString() });
      if (currentView && currentView.onStateUpdate) currentView.onStateUpdate('logs');
    } catch(err) { console.error('SSE Error:', err); }
  });

  source.addEventListener('scan:complete', (e) => {
    try {
      const data = JSON.parse(e.data);
      window.SDOA_STATE.scanStats.currentFile = 'Scan Complete.';
      window.SDOA_STATE.systemLogs.unshift({ message: `[SCAN] Complete. Scanned ${data.filesScanned} files.`, timestamp: new Date().toISOString() });
      if (currentView && currentView.onStateUpdate) currentView.onStateUpdate('scan');
      if (currentView && currentView.onStateUpdate) currentView.onStateUpdate('logs');
    } catch(err) { console.error('SSE Error:', err); }
  });
}

// Init
setupSSE();
route();

// Fireworks Canvas Overlay
const canvas = document.createElement('canvas');
canvas.id = 'sdoa-fireworks-canvas';
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let isAnimating = false;
window.triggerFireworks = () => {
  for (let i = 0; i < 50; i++) {
    particles.push({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 1.0,
      color: `hsl(${Math.random() * 360}, 100%, 70%)`
    });
  }
  if (!isAnimating) {
    isAnimating = true;
    renderFireworks();
  }
};

function renderFireworks() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (particles.length === 0) {
    isAnimating = false;
    return;
  }
  
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.02;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
  requestAnimationFrame(renderFireworks);
}

window.triggerScan = async (type = 'workspace') => {
  const scanIcon = document.getElementById('scan-status-icon');
  const scanText = document.getElementById('scan-status-text');
  
  if (scanIcon) {
    scanIcon.textContent = '🔄';
    scanIcon.style.animation = 'pulse 1s infinite';
  }
  if (scanText) {
    scanText.textContent = `Scanning ${type}...`;
  }
  
  try {
    if (type === 'file' || type === 'folder') {
      const target = prompt(`Enter absolute path to ${type} (leave blank for workspace default):`);
      if (target === '') {
        await fetch('/dashboard/api/actions/scan-workspace', { method: 'POST' });
      } else if (target !== null) {
        await fetch('/dashboard/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: target, type: type }),
        });
      }
    } else {
      await fetch('/dashboard/api/actions/scan-workspace', { method: 'POST' });
    }
  } catch(e) {
    console.error('Scan trigger failed:', e);
  }
  
  if (scanIcon) {
    scanIcon.style.animation = '';
    scanIcon.textContent = '📡';
  }
  if (scanText) {
    scanText.textContent = 'Detector Idle';
  }
};
