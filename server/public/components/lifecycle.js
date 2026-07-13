export default {
  async render() {
    return `
      <div class="sdoa-dashboard-grid">
        <div class="sdoa-card sdoa-col-span-12">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3>Lifecycle Manager (Runtime Orchestrator)</h3>
            <button class="sdoa-btn sdoa-btn-outline" onclick="this.closest('.sdoa-card').querySelector('table').style.opacity = '0.5'; setTimeout(() => this.closest('.sdoa-card').querySelector('table').style.opacity = '1', 500)">Refresh Status</button>
          </div>
          
          <div style="background: rgba(52, 211, 153, 0.1); border-left: 4px solid #34d399; padding: 1rem; margin-bottom: 1.5rem; border-radius: 0 4px 4px 0;">
            <h4 style="color: #34d399; margin-top: 0; margin-bottom: 0.5rem;">What is the Lifecycle Manager?</h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--sdoa-text-secondary); line-height: 1.5;">
              This authority brings Sleeves to life. It activates inert code from the Registry, turning them into running Nodes on the Mesh Network, and handles graceful rollbacks if something fails.<br>
              <strong style="color: #cbd5e1;">Lifecycle Position: Step 3.</strong> It tells Transport Routing when a Sleeve is ready for active traffic.
            </p>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--sdoa-border); color: var(--sdoa-text-secondary);">
                  <th style="padding: 0.75rem;">Module ID</th>
                  <th style="padding: 0.75rem;">Status</th>
                  <th style="padding: 0.75rem;">Active Version</th>
                  <th style="padding: 0.75rem;">Last Transition</th>
                  <th style="padding: 0.75rem;">Controls</th>
                </tr>
              </thead>
              <tbody id="lifecycle-table-body">
                <tr><td colspan="5" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">Loading lifecycle states...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.fetchStates();
    this.fetchInterval = setInterval(() => this.fetchStates(), 3000);
  },

  destroy() {
    if (this.fetchInterval) clearInterval(this.fetchInterval);
  },

  async fetchStates() {
    try {
      const res = await fetch('/dashboard/api/lifecycle/status');
      const data = await res.json();
      
      if (data.ok) {
        const tbody = document.getElementById('lifecycle-table-body');
        if (!tbody) return;

        if (data.states.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">No active lifecycle states. Need to provision sleeves first.</td></tr>`;
          return;
        }

        tbody.innerHTML = data.states.map(state => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 0.75rem;" class="font-mono text-muted">${state.moduleId}</td>
            <td style="padding: 0.75rem;">
              <span class="sdoa-badge" style="background: ${state.status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}; color: ${state.status === 'active' ? '#34d399' : '#f87171'}">
                ${state.status.toUpperCase()}
              </span>
            </td>
            <td style="padding: 0.75rem;" class="font-mono">${state.activeVersionId || '<span class="text-muted">None</span>'}</td>
            <td style="padding: 0.75rem;">${new Date(state.lastTransitionAt).toLocaleString()}</td>
            <td style="padding: 0.75rem;">
              ${state.status === 'inactive' 
                ? `<button class="sdoa-btn sdoa-btn-success action-btn" data-action="activate" data-id="${state.moduleId}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">Activate</button>` 
                : `<button class="sdoa-btn sdoa-btn-danger action-btn" data-action="deactivate" data-id="${state.moduleId}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">Deactivate</button>`}
              <button class="sdoa-btn sdoa-btn-outline action-btn" data-action="rollback" data-id="${state.moduleId}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;">Rollback</button>
              ${state.status === 'active' 
                ? `<button class="sdoa-btn sdoa-btn-warning action-btn" data-action="simulate-crash" data-id="${state.moduleId}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;">Simulate Crash</button>` 
                : ''}
            </td>
          </tr>
        `).join('');

        // Attach listeners
        document.querySelectorAll('.action-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const id = e.target.dataset.id;
            this.handleAction(action, id);
          });
        });
      }
    } catch (err) {
      console.error("Failed to fetch lifecycle states", err);
    }
  },

  async handleAction(action, moduleId) {
    if (action === 'simulate-crash') {
      try {
        const res = await fetch('/dashboard/api/arbitration/simulate-crash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ moduleId })
        });
        const data = await res.json();
        if (!data.ok) alert("Crash simulation failed: " + data.error);
        else {
          console.log("Crash simulated!");
          this.fetchStates(); // Should show rollback immediately
        }
      } catch (err) {
        alert("Error: " + err.message);
      }
      return;
    }

    try {
      const res = await fetch(`/dashboard/api/lifecycle/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId })
      });
      const data = await res.json();
      
      if (!data.ok) {
        alert(`Failed to ${action} ${moduleId}: ${data.error}`);
      } else {
        this.fetchStates(); // Refresh immediately
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  }
};
