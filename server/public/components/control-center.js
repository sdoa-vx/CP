export default {
  render() {
    return `
      <div class="sdoa-dashboard-grid" style="display: grid; grid-template-columns: repeat(12, 1fr); gap: 1.5rem;">
        <div class="sdoa-card sdoa-col-span-12" style="margin-bottom: 0;">
          <h2 style="margin-bottom: 1.5rem; font-size: 1.5rem; font-weight: 600; background: linear-gradient(90deg, var(--sdoa-accent-primary), var(--sdoa-accent-secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">System Operations Overview</h2>
          
          <div class="sdoa-grid" style="grid-template-columns: repeat(4, 1fr); gap: 1rem;">
            
            <!-- Mesh Network Stats -->
            <div class="sdoa-card" style="background: rgba(16, 185, 129, 0.05); border-left: 4px solid var(--sdoa-success);">
              <h4 class="text-muted" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Mesh Nodes</h4>
              <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.5rem;">
                <p style="font-size: 2.5rem; font-weight: 700; color: var(--sdoa-success);" id="cc-mesh-nodes">0</p>
                <span class="sdoa-badge" style="background: rgba(16, 185, 129, 0.2); color: var(--sdoa-success);" id="cc-mesh-health">Optimal</span>
              </div>
            </div>

            <!-- Detector Hits -->
            <div class="sdoa-card" style="background: rgba(59, 130, 246, 0.05); border-left: 4px solid var(--sdoa-accent-primary);">
              <h4 class="text-muted" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Detector Hits</h4>
              <p style="font-size: 2.5rem; font-weight: 700; color: var(--sdoa-accent-primary); margin-top: 0.5rem;" id="cc-innovations-count">0</p>
            </div>

            <!-- Pipeline Proposals -->
            <div class="sdoa-card" style="background: rgba(245, 158, 11, 0.05); border-left: 4px solid var(--sdoa-warning);">
              <h4 class="text-muted" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Proposals Queue</h4>
              <p style="font-size: 2.5rem; font-weight: 700; color: var(--sdoa-warning); margin-top: 0.5rem;" id="cc-proposals-count">0</p>
            </div>

            <!-- Drift Anomalies -->
            <div class="sdoa-card" style="background: rgba(239, 68, 68, 0.05); border-left: 4px solid var(--sdoa-danger);">
              <h4 class="text-muted" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Drift Anomalies</h4>
              <p style="font-size: 2.5rem; font-weight: 700; color: var(--sdoa-danger); margin-top: 0.5rem;" id="cc-drift-anomalies">0</p>
            </div>

          </div>
        </div>

        <div class="sdoa-card sdoa-col-span-12">
          <h3 style="margin-bottom: 1rem; font-size: 1.2rem;">System Event Log</h3>
          <div style="background: rgba(0, 0, 0, 0.3); border-radius: 8px; padding: 1rem; border: 1px solid var(--sdoa-border);">
            <pre class="sdoa-code" style="height: 250px; overflow-y: auto; font-family: 'Fira Code', monospace; font-size: 0.85rem; line-height: 1.5; margin: 0; background: transparent; padding: 0;" id="cc-system-log"></pre>
          </div>
        </div>
      </div>
    `;
  },
  
  async init() {
    this.updateAll();
    try {
      const res = await fetch('/dashboard/api/system/logs');
      if (res.ok) {
        window.SDOA_STATE.systemLogs = await res.json();
        this.renderLogs();
      }
    } catch(e) {
      console.error("Failed to fetch system logs:", e);
    }
  },

  updateAll() {
    const s = window.SDOA_STATE;
    const elProps = document.getElementById('cc-proposals-count');
    if (elProps) elProps.textContent = s.proposals.length;
    
    const elInno = document.getElementById('cc-innovations-count');
    if (elInno) elInno.textContent = s.innovations.length;

    const elNodes = document.getElementById('cc-mesh-nodes');
    if (elNodes) elNodes.textContent = s.mesh.nodes || 0;

    const elHealth = document.getElementById('cc-mesh-health');
    if (elHealth) elHealth.textContent = s.mesh.health || 'Unknown';

    const elDrift = document.getElementById('cc-drift-anomalies');
    if (elDrift) elDrift.textContent = s.driftAnomalies || 0;

    this.renderLogs();
  },

  renderLogs() {
    const logEl = document.getElementById('cc-system-log');
    if (logEl) {
      const logs = window.SDOA_STATE.systemLogs || [];
      logEl.innerHTML = logs.map(l => {
        let msg = typeof l === 'string' ? l : l.message;
        let tsStr = typeof l === 'string' ? new Date().toISOString() : (l.timestamp || new Date().toISOString());
        let tsDate = new Date(tsStr);
        let isOld = tsDate.getTime() < window.SESSION_START;
        
        let opacityStyle = isOld ? 'opacity: 0.5;' : 'opacity: 1;';
        
        const time = tsDate.toLocaleTimeString();
        let color = 'var(--sdoa-text)';
        if (msg.includes('[DETECTOR]')) color = 'var(--sdoa-accent-primary)';
        if (msg.includes('[SCAN]')) color = 'var(--sdoa-success)';
        
        return `<div style="${opacityStyle}"><span style="color: rgba(255,255,255,0.4);">[${time}]</span> <span style="color: ${color};">${msg}</span></div>`;
      }).join('');
    }
  },

  onStateUpdate(type) {
    this.updateAll();
  }
};
