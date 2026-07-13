export default {
  async render() {
    return `
      <div class="sdoa-dashboard-grid">
        <div class="sdoa-card sdoa-col-span-12">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3>Transport Arbitration (Routing Brain)</h3>
            <button class="sdoa-btn sdoa-btn-outline" onclick="this.closest('.sdoa-card').querySelector('table').style.opacity = '0.5'; setTimeout(() => this.closest('.sdoa-card').querySelector('table').style.opacity = '1', 500)">Refresh Routes</button>
          </div>
          
          <div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 1rem; margin-bottom: 1.5rem; border-radius: 0 4px 4px 0;">
            <h4 style="color: #f59e0b; margin-top: 0; margin-bottom: 0.5rem;">What is Transport Routing?</h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--sdoa-text-secondary); line-height: 1.5;">
              Managed by the Arbitration Engine, this dynamically directs system traffic to active Sleeves. If a Sleeve degrades (high latency or errors), this engine instantly reroutes traffic to a healthy fallback.<br>
              <strong style="color: #cbd5e1;">Lifecycle Position: Step 4.</strong> The final layer that ensures self-healing and zero downtime.
            </p>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--sdoa-border); color: var(--sdoa-text-secondary);">
                  <th style="padding: 0.75rem;">Module ID</th>
                  <th style="padding: 0.75rem;">Routed Sleeve (Version)</th>
                  <th style="padding: 0.75rem;">Drift Status</th>
                  <th style="padding: 0.75rem;">Route Type</th>
                  <th style="padding: 0.75rem;">Last Routed</th>
                  <th style="padding: 0.75rem;">Actions</th>
                </tr>
              </thead>
              <tbody id="routing-table-body">
                <tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">Loading routes...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Override Modal (Hidden by default) -->
        <div id="override-modal" class="sdoa-card sdoa-col-span-12" style="display: none; margin-top: 1.5rem; background: #000; border: 1px solid #333;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: center;">
            <h4 style="color: var(--sdoa-warning);">Override Route</h4>
            <button id="btn-close-override" class="sdoa-btn sdoa-btn-outline" style="padding: 0.2rem 0.5rem;">Cancel</button>
          </div>
          <div style="display: flex; gap: 1rem; align-items: flex-end;">
            <div style="flex: 1;">
              <label style="display: block; font-size: 0.8rem; color: var(--sdoa-text-secondary); margin-bottom: 0.3rem;">Module ID</label>
              <input type="text" id="override-module-id" readonly style="width: 100%; padding: 0.5rem; background: rgba(255,255,255,0.05); border: 1px solid var(--sdoa-border); color: white; border-radius: 4px;" />
            </div>
            <div style="flex: 1;">
              <label style="display: block; font-size: 0.8rem; color: var(--sdoa-text-secondary); margin-bottom: 0.3rem;">Target Sleeve ID (Version)</label>
              <input type="text" id="override-sleeve-id" placeholder="e.g. v_160123..." style="width: 100%; padding: 0.5rem; background: rgba(255,255,255,0.05); border: 1px solid var(--sdoa-border); color: white; border-radius: 4px;" />
            </div>
            <button id="btn-submit-override" class="sdoa-btn sdoa-btn-warning">Enforce Override</button>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.fetchRoutes();
    this.fetchInterval = setInterval(() => this.fetchRoutes(), 3000);

    document.getElementById('btn-close-override')?.addEventListener('click', () => {
      document.getElementById('override-modal').style.display = 'none';
    });
    
    document.getElementById('btn-submit-override')?.addEventListener('click', () => {
      this.submitOverride();
    });
  },

  destroy() {
    if (this.fetchInterval) clearInterval(this.fetchInterval);
  },

  async fetchRoutes() {
    try {
      const res = await fetch('/dashboard/api/arbitration/routes');
      const data = await res.json();
      
      if (data.ok) {
        const tbody = document.getElementById('routing-table-body');
        if (!tbody) return;

        if (data.routes.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">No active routes discovered.</td></tr>`;
          return;
        }

        tbody.innerHTML = data.routes.map(route => {
          let driftColor = '#34d399';
          let driftBg = 'rgba(16,185,129,0.2)';
          if (route.driftStatus === 'degraded') {
            driftColor = '#f59e0b';
            driftBg = 'rgba(245,158,11,0.2)';
          } else if (route.driftStatus === 'critical') {
            driftColor = '#f87171';
            driftBg = 'rgba(239,68,68,0.2)';
          }

          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 0.75rem;" class="font-mono text-muted">${route.moduleId}</td>
              <td style="padding: 0.75rem;" class="font-mono" style="color: var(--sdoa-accent-primary)">${route.activeSleeveId}</td>
              <td style="padding: 0.75rem;">
                <span class="sdoa-badge" style="background: ${driftBg}; color: ${driftColor}">
                  ${route.driftStatus.toUpperCase()}
                </span>
              </td>
              <td style="padding: 0.75rem;">
                ${route.isOverridden ? '<span style="color: var(--sdoa-warning);">Manual Override</span>' : '<span style="color: var(--sdoa-success);">Dynamic Auto</span>'}
              </td>
              <td style="padding: 0.75rem;">${new Date(route.lastRoutedAt).toLocaleTimeString()}</td>
              <td style="padding: 0.75rem;">
                <button class="sdoa-btn sdoa-btn-outline override-btn" data-id="${route.moduleId}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">Override</button>
              </td>
            </tr>
          `;
        }).join('');

        // Attach listeners
        document.querySelectorAll('.override-btn').forEach(btn => {
          btn.addEventListener('click', (e) => this.openOverrideModal(e.target.dataset.id));
        });
      }
    } catch (err) {
      console.error("Failed to fetch routes", err);
    }
  },

  openOverrideModal(moduleId) {
    const modal = document.getElementById('override-modal');
    const modInput = document.getElementById('override-module-id');
    const slvInput = document.getElementById('override-sleeve-id');
    
    if (modal && modInput && slvInput) {
      modal.style.display = 'block';
      modInput.value = moduleId;
      slvInput.value = '';
      slvInput.focus();
    }
  },
  
  async submitOverride() {
    const moduleId = document.getElementById('override-module-id')?.value;
    const sleeveId = document.getElementById('override-sleeve-id')?.value;
    
    if (!moduleId || !sleeveId) {
      alert('Please provide a valid Sleeve ID.');
      return;
    }

    try {
      const res = await fetch('/dashboard/api/arbitration/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, sleeveId })
      });
      const data = await res.json();
      
      if (!data.ok) {
        alert("Override failed: " + data.error);
      } else {
        document.getElementById('override-modal').style.display = 'none';
        this.fetchRoutes();
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  }
};
