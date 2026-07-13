export default {
  async render() {
    return `
      <div class="sdoa-dashboard-grid">
        <div class="sdoa-card sdoa-col-span-12">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <div>
              <h3>Governance Console (Probation Officer)</h3>
              <p class="text-muted" style="margin-top: 0.2rem; font-size: 0.85rem;">Sovereign rule enforcement and violation remediation.</p>
            </div>
            <button class="sdoa-btn sdoa-btn-outline" onclick="this.closest('.sdoa-card').querySelector('table').style.opacity = '0.5'; setTimeout(() => this.closest('.sdoa-card').querySelector('table').style.opacity = '1', 500)">Refresh Violations</button>
          </div>
          
          <div style="display: flex; gap: 1.5rem; margin-bottom: 1.5rem;">
            <!-- Severity Heatmap -->
            <div style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--sdoa-border); border-radius: 8px; padding: 1rem;">
              <h4 style="margin-bottom: 1rem; color: #c9d1d9;">Severity Heatmap</h4>
              <div id="gov-heatmap" style="display: flex; flex-direction: column; gap: 0.5rem; font-family: monospace;">
                <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color: #ef4444; width: 80px;">Critical</span> <div id="hm-critical" style="height: 10px; background: #ef4444; width: 0%; transition: width 0.5s;"></div></div>
                <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color: #f59e0b; width: 80px;">High</span>     <div id="hm-high" style="height: 10px; background: #f59e0b; width: 0%; transition: width 0.5s;"></div></div>
                <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color: #fcd34d; width: 80px;">Medium</span>   <div id="hm-medium" style="height: 10px; background: #fcd34d; width: 0%; transition: width 0.5s;"></div></div>
                <div style="display: flex; align-items: center; gap: 0.5rem;"><span style="color: #3b82f6; width: 80px;">Low</span>      <div id="hm-low" style="height: 10px; background: #3b82f6; width: 0%; transition: width 0.5s;"></div></div>
              </div>
            </div>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--sdoa-border); color: var(--sdoa-text-secondary);">
                  <th style="padding: 0.75rem;">Module</th>
                  <th style="padding: 0.75rem;">Severity</th>
                  <th style="padding: 0.75rem;">Rule</th>
                  <th style="padding: 0.75rem;">Description</th>
                  <th style="padding: 0.75rem;">Timestamp</th>
                  <th style="padding: 0.75rem;">Status / Actions</th>
                </tr>
              </thead>
              <tbody id="gov-table-body">
                <tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">Loading violations...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.fetchData();
    this.fetchInterval = setInterval(() => this.fetchData(), 5000); // UI poll slightly slower to prevent spam
  },

  destroy() {
    if (this.fetchInterval) clearInterval(this.fetchInterval);
  },

  async fetchData() {
    try {
      const res = await fetch('/dashboard/api/governance/violations');
      const data = await res.json();
      
      if (data.ok && data.violations) {
        this.renderTable(data.violations);
        this.renderHeatmap(data.violations);
      }
    } catch (err) {
      console.error("Failed to fetch violations", err);
    }
  },

  renderTable(violations) {
    const tbody = document.getElementById('gov-table-body');
    if (!tbody) return;

    if (violations.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">No violations recorded.</td></tr>`;
      return;
    }

    const reversed = [...violations].reverse(); // newest first
    tbody.innerHTML = reversed.map(v => {
      let sevColor = '#3b82f6';
      let sevBg = 'rgba(59,130,246,0.2)';
      if (v.severity === 'Medium') { sevColor = '#fcd34d'; sevBg = 'rgba(252,211,77,0.2)'; }
      else if (v.severity === 'High') { sevColor = '#f59e0b'; sevBg = 'rgba(245,158,11,0.2)'; }
      else if (v.severity === 'Critical') { sevColor = '#ef4444'; sevBg = 'rgba(239,68,68,0.2)'; }

      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); opacity: ${v.resolved ? '0.5' : '1'};">
          <td style="padding: 0.75rem;" class="font-mono text-muted">${v.moduleId}</td>
          <td style="padding: 0.75rem;">
            <span class="sdoa-badge" style="background: ${sevBg}; color: ${sevColor}">
              ${v.severity.toUpperCase()}
            </span>
          </td>
          <td style="padding: 0.75rem;" class="font-mono">${v.ruleId}</td>
          <td style="padding: 0.75rem; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${v.description}">${v.description}</td>
          <td style="padding: 0.75rem;">${new Date(v.timestamp).toLocaleTimeString()}</td>
          <td style="padding: 0.75rem;">
            ${v.resolved ? '<span style="color: var(--sdoa-success);">Resolved</span>' : `
              <button class="sdoa-btn sdoa-btn-outline action-btn" data-action="Approve" data-id="${v.id}" style="padding: 0.2rem 0.4rem; font-size: 0.7rem;">Approve</button>
              <button class="sdoa-btn sdoa-btn-outline action-btn" data-action="Reject" data-id="${v.id}" style="padding: 0.2rem 0.4rem; font-size: 0.7rem; color: #f87171; border-color: rgba(239,68,68,0.3);">Reject</button>
            `}
          </td>
        </tr>
      `;
    }).join('');

    // Attach listeners
    document.querySelectorAll('.action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        const id = e.target.dataset.id;
        this.handleDecision(id, action);
      });
    });
  },

  renderHeatmap(violations) {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    let max = 1;
    violations.filter(v => !v.resolved).forEach(v => {
      counts[v.severity] = (counts[v.severity] || 0) + 1;
      if (counts[v.severity] > max) max = counts[v.severity];
    });

    const hmCrit = document.getElementById('hm-critical');
    const hmHigh = document.getElementById('hm-high');
    const hmMed = document.getElementById('hm-medium');
    const hmLow = document.getElementById('hm-low');

    if (hmCrit) hmCrit.style.width = `${(counts.Critical / max) * 100}%`;
    if (hmHigh) hmHigh.style.width = `${(counts.High / max) * 100}%`;
    if (hmMed) hmMed.style.width = `${(counts.Medium / max) * 100}%`;
    if (hmLow) hmLow.style.width = `${(counts.Low / max) * 100}%`;
  },

  async handleDecision(violationId, action) {
    try {
      const res = await fetch('/dashboard/api/governance/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violationId, action, reason: `Manual override: ${action}` })
      });
      const data = await res.json();
      
      if (!data.ok) {
        alert(`Failed to ${action}: ${data.error}`);
      } else {
        this.fetchData(); // Refresh immediately
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  }
};
