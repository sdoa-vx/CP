export default {
  async render() {
    return `
      <div class="sdoa-dashboard-grid">
        <div class="sdoa-card sdoa-col-span-12">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3>Sovereign Audit Ledger</h3>
            <button id="btn-verify-chain" class="sdoa-btn sdoa-btn-outline" style="display: flex; align-items: center; gap: 0.5rem;">
              <span>Verify Chain Integrity</span>
              <span id="verify-status" style="display:none; width: 12px; height: 12px; border-radius: 50%;"></span>
            </button>
          </div>
          
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--sdoa-border); color: var(--sdoa-text-secondary);">
                  <th style="padding: 0.75rem;">Seq No.</th>
                  <th style="padding: 0.75rem;">Block Hash</th>
                  <th style="padding: 0.75rem;">Event Type</th>
                  <th style="padding: 0.75rem;">Source</th>
                  <th style="padding: 0.75rem;">Timestamp</th>
                  <th style="padding: 0.75rem;">Payload</th>
                </tr>
              </thead>
              <tbody id="audit-table-body">
                <tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">Loading immutable ledger...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.fetchLedger();
    
    document.getElementById('btn-verify-chain')?.addEventListener('click', () => {
      this.verifyChain();
    });
  },

  destroy() {
    // nothing to clean up here right now
  },

  async fetchLedger() {
    try {
      const res = await fetch('/dashboard/api/chronicle');
      const data = await res.json();
      
      if (data.ok) {
        const tbody = document.getElementById('audit-table-body');
        if (!tbody) return;

        // Render chain in reverse chronological order (newest first)
        const chain = data.chain.reverse();

        if (chain.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">Ledger is empty.</td></tr>`;
          return;
        }

        tbody.innerHTML = chain.map(block => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 0.75rem; color: var(--sdoa-accent-primary); font-weight: bold;">#${block.sequenceNo}</td>
            <td style="padding: 0.75rem;" class="font-mono">
              <span title="${block.id}">${block.id.substring(0, 16)}...</span>
            </td>
            <td style="padding: 0.75rem;">
              <span class="sdoa-badge">${block.type}</span>
            </td>
            <td style="padding: 0.75rem;">${block.source}</td>
            <td style="padding: 0.75rem;">${new Date(block.timestamp).toLocaleString()}</td>
            <td style="padding: 0.75rem;" class="font-mono">
              <details>
                <summary style="cursor: pointer; color: var(--sdoa-text-secondary);">View Data</summary>
                <pre style="margin-top: 0.5rem; font-size: 0.75rem; background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 4px;">${JSON.stringify(block.payload, null, 2)}</pre>
              </details>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error("Failed to fetch ledger", err);
    }
  },

  async verifyChain() {
    const statusDot = document.getElementById('verify-status');
    if (!statusDot) return;
    
    statusDot.style.display = 'inline-block';
    statusDot.style.backgroundColor = '#f59e0b'; // warning/loading color

    try {
      const res = await fetch('/dashboard/api/chronicle/verify');
      const data = await res.json();
      
      if (data.ok && data.valid) {
        statusDot.style.backgroundColor = '#10b981'; // success
        statusDot.title = "Chain is valid and untampered.";
      } else {
        statusDot.style.backgroundColor = '#ef4444'; // danger
        statusDot.title = "TAMPER DETECTED!";
        alert("CRITICAL WARNING: The immutable ledger has been tampered with!");
      }
    } catch (err) {
      statusDot.style.backgroundColor = '#ef4444';
    }
  }
};
