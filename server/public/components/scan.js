export default {
  render() {
    return `
      <div class="sdoa-card" style="margin-bottom: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
          <div>
            <h2>Innovation Detector Scan</h2>
            <p class="text-muted">Real-time AST cache and engine scanning.</p>
          </div>
          <button class="sdoa-btn sdoa-btn-outline" onclick="triggerScan()">Run Manual Scan</button>
        </div>
        
        <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 2rem; border: 1px dashed var(--sdoa-border); display: flex; flex-direction: column; gap: 1.5rem;">
          
          <!-- Scan Status Overview -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div id="scan-status-icon" style="font-size: 2.5rem; filter: drop-shadow(0 0 10px rgba(139, 92, 246, 0.5));">📡</div>
              <div>
                <h3 id="scan-status-text" style="margin: 0; font-size: 1.2rem;">Detector Idle</h3>
                <p id="scan-progress-text" class="text-muted" style="margin-top: 0.2rem; font-size: 0.9rem;">Awaiting next cycle...</p>
              </div>
            </div>
            <div style="text-align: right;">
              <p class="text-muted" style="font-size: 0.8rem; text-transform: uppercase;">Discoveries</p>
              <p id="scan-hits-counter" style="font-size: 2rem; font-weight: bold; color: var(--sdoa-accent-primary); margin: 0;">0</p>
            </div>
          </div>

          <!-- Progress Meter -->
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.5rem;">
              <span id="scan-current-file" class="text-muted" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">Ready.</span>
              <span id="scan-percent">0%</span>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
              <div id="scan-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--sdoa-accent-primary), var(--sdoa-success)); transition: width 0.1s ease-out;"></div>
            </div>
          </div>
          
        </div>
        
        <div class="sdoa-grid" style="grid-template-columns: repeat(12, 1fr); gap: 1.5rem; margin-top: 1.5rem;">
          
          <!-- Rolling File List -->
          <div class="sdoa-col-span-6">
            <h3 style="margin-bottom: 1rem; font-size: 1rem;">Live File Feed</h3>
            <div style="background: rgba(0, 0, 0, 0.3); border-radius: 8px; padding: 1rem; border: 1px solid var(--sdoa-border);">
              <pre class="sdoa-code" style="height: 200px; overflow-y: auto; font-family: 'Fira Code', monospace; font-size: 0.8rem; line-height: 1.6; margin: 0; background: transparent; padding: 0;" id="scan-rolling-feed"></pre>
            </div>
          </div>

          <!-- Recent Discoveries -->
          <div class="sdoa-col-span-6">
            <h3 style="margin-bottom: 1rem; font-size: 1rem;">Recent Discoveries</h3>
            <div id="scan-innovations" style="display: flex; flex-direction: column; gap: 0.5rem; height: 234px; overflow-y: auto;"></div>
          </div>

        </div>
      </div>
    `;
  },
  
  init() {
    this.updateScanUI();
    this.renderInnovations();
  },

  onStateUpdate(type) {
    if (type === 'scan') {
      this.updateScanUI();
    }
    if (type === 'innovations') {
      this.renderInnovations();
    }
  },
  
  updateScanUI() {
    const stats = window.SDOA_STATE.scanStats;
    const log = window.SDOA_STATE.scanLog;
    
    // Status text
    const statusText = document.getElementById('scan-status-text');
    const statusIcon = document.getElementById('scan-status-icon');
    const progressText = document.getElementById('scan-progress-text');
    
    if (stats.currentFile === 'Scan Complete.') {
      statusText.textContent = 'Scan Complete';
      statusIcon.textContent = '✅';
      statusIcon.style.animation = '';
      progressText.textContent = `Processed ${stats.scannedCount} files.`;
    } else if (stats.currentFile && stats.currentFile !== 'Initializing...') {
      statusText.textContent = 'Scanning...';
      statusIcon.textContent = '🔄';
      statusIcon.style.animation = 'pulse 1s infinite';
      progressText.textContent = `Indexing ${stats.scannedCount} of ${stats.totalFiles || '?'}`;
    } else if (stats.currentFile === 'Initializing...') {
      statusText.textContent = 'Initializing...';
      statusIcon.textContent = '⏱️';
      progressText.textContent = 'Preparing workspace scan.';
    }

    // Progress Bar
    const percentEl = document.getElementById('scan-percent');
    const barEl = document.getElementById('scan-progress-bar');
    const currFileEl = document.getElementById('scan-current-file');
    
    let percent = 0;
    if (stats.totalFiles > 0) {
      percent = Math.min(100, Math.round((stats.scannedCount / stats.totalFiles) * 100));
    } else if (stats.scannedCount > 0) {
      percent = 100; // if we don't know total but we are scanning
    }
    
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (barEl) barEl.style.width = `${percent}%`;
    if (currFileEl) currFileEl.textContent = stats.currentFile || 'Ready.';

    // Rolling Feed
    const feedEl = document.getElementById('scan-rolling-feed');
    if (feedEl) {
      feedEl.innerHTML = log.map(f => {
        let color = 'var(--sdoa-text)';
        if (f.endsWith('.js') || f.endsWith('.ts')) color = '#f1e05a';
        else if (f.endsWith('.md')) color = '#083fa1';
        else if (f.endsWith('.json')) color = '#e34c26';
        return `<span style="color: ${color};">${f.split('/').pop().split('\\\\').pop()}</span> <span style="color: rgba(255,255,255,0.3); font-size: 0.7rem;">${f}</span>`;
      }).join('\\n');
    }
    
    // Discoveries Counter
    const hitsEl = document.getElementById('scan-hits-counter');
    if (hitsEl) hitsEl.textContent = window.SDOA_STATE.innovations.length;
  },

  renderInnovations() {
    const list = document.getElementById('scan-innovations');
    if (!list) return;

    const inn = window.SDOA_STATE.innovations || [];
    if (inn.length === 0) {
      list.innerHTML = '<p class="text-muted">No recent discoveries.</p>';
      return;
    }

    list.innerHTML = inn.slice(0, 10).map(i => `
      <div class="sdoa-card" style="background: rgba(139, 92, 246, 0.05); border-left: 3px solid var(--sdoa-accent-primary); padding: 0.75rem 1rem; margin: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h4 style="margin: 0; font-size: 0.9rem;">${i.name || i.id || 'Discovery'}</h4>
            <p class="text-muted font-mono" style="font-size: 0.7rem; margin-top: 0.2rem;">${i.type || 'module'}</p>
          </div>
          <span class="sdoa-badge" style="font-size: 0.6rem;">New</span>
        </div>
      </div>
    `).join('');
  }
};
