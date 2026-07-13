export default {
  async render() {
    return `
      <div class="sdoa-dashboard-grid">
        <!-- Assembly Line Status -->
        <div class="sdoa-card sdoa-col-span-12">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3>Assembly Line Fabrication Queue</h3>
            <button id="btn-manual-fabricate" class="sdoa-btn sdoa-btn-success">
              Forge Sleeve (Manual)
            </button>
          </div>
          
          <div style="background: rgba(167, 139, 250, 0.1); border-left: 4px solid #a78bfa; padding: 1rem; margin-bottom: 1.5rem; border-radius: 0 4px 4px 0;">
            <h4 style="color: #a78bfa; margin-top: 0; margin-bottom: 0.5rem;">What is the Assembly Line?</h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--sdoa-text-secondary); line-height: 1.5;">
              This is the sovereign compiler. It takes raw code (like an innovation candidate) and compiles it into a standalone executable called a "Sleeve" in an isolated subprocess.<br>
              <strong style="color: #cbd5e1;">Lifecycle Position: Step 1.</strong> The compiled output is passed directly to the Sleeve Registry.
            </p>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--sdoa-border); color: var(--sdoa-text-secondary);">
                  <th style="padding: 0.75rem;">Process ID</th>
                  <th style="padding: 0.75rem;">PID</th>
                  <th style="padding: 0.75rem;">Status</th>
                  <th style="padding: 0.75rem;">Started At</th>
                  <th style="padding: 0.75rem;">Crashes</th>
                  <th style="padding: 0.75rem;">Actions</th>
                </tr>
              </thead>
              <tbody id="fabrication-table-body">
                <tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">Loading fabrication queue...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Logs Modal (Hidden by default) -->
        <div id="logs-modal" class="sdoa-card sdoa-col-span-12" style="display: none; margin-top: 1.5rem; background: #000; border: 1px solid #333;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: center;">
            <h4 id="logs-title" style="color: #a78bfa;">Build Logs</h4>
            <button id="btn-close-logs" class="sdoa-btn sdoa-btn-outline" style="padding: 0.2rem 0.5rem;">Close</button>
          </div>
          <pre id="logs-content" class="sdoa-code" style="max-height: 400px; overflow-y: auto; background: transparent; border: none; font-size: 0.8rem;"></pre>
        </div>
      </div>
    `;
  },

  init() {
    this.fetchInterval = setInterval(() => this.fetchProcesses(), 2000);
    this.fetchProcesses();

    document.getElementById('btn-manual-fabricate')?.addEventListener('click', () => {
      this.triggerManualFabricate();
    });

    document.getElementById('btn-close-logs')?.addEventListener('click', () => {
      document.getElementById('logs-modal').style.display = 'none';
      if (this.logInterval) clearInterval(this.logInterval);
    });
  },

  destroy() {
    if (this.fetchInterval) clearInterval(this.fetchInterval);
    if (this.logInterval) clearInterval(this.logInterval);
  },

  async fetchProcesses() {
    try {
      const res = await fetch('/dashboard/api/assembly/processes');
      const data = await res.json();
      
      if (data.ok) {
        const tbody = document.getElementById('fabrication-table-body');
        if (!tbody) return;

        if (data.processes.length === 0) {
          tbody.innerHTML = `<tr><td colspan="6" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">No active or recent fabrications.</td></tr>`;
          return;
        }

        tbody.innerHTML = data.processes.map(p => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 0.75rem;" class="font-mono">${p.id}</td>
            <td style="padding: 0.75rem;">${p.pid || '—'}</td>
            <td style="padding: 0.75rem;">
              <span class="sdoa-badge" style="background: ${p.status === 'running' ? 'rgba(59,130,246,0.2)' : p.status === 'crashed' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}; color: ${p.status === 'running' ? '#60a5fa' : p.status === 'crashed' ? '#f87171' : '#34d399'}">
                ${p.status.toUpperCase()}
              </span>
            </td>
            <td style="padding: 0.75rem;">${new Date(p.startedAt).toLocaleTimeString()}</td>
            <td style="padding: 0.75rem; color: ${p.crashCount > 0 ? '#f87171' : 'inherit'};">${p.crashCount}</td>
            <td style="padding: 0.75rem;">
              <button class="sdoa-btn sdoa-btn-outline view-logs-btn" data-id="${p.id}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">View Logs</button>
            </td>
          </tr>
        `).join('');

        // Attach log listeners
        document.querySelectorAll('.view-logs-btn').forEach(btn => {
          btn.addEventListener('click', (e) => this.viewLogs(e.target.dataset.id));
        });
      }
    } catch (err) {
      console.error("Failed to fetch assembly processes", err);
    }
  },

  async viewLogs(id) {
    const modal = document.getElementById('logs-modal');
    const title = document.getElementById('logs-title');
    const content = document.getElementById('logs-content');
    
    if (!modal || !title || !content) return;
    
    modal.style.display = 'block';
    title.textContent = `Build Logs: ${id}`;
    content.textContent = 'Loading logs...';

    if (this.logInterval) clearInterval(this.logInterval);

    const fetchLogs = async () => {
      try {
        const res = await fetch(`/dashboard/api/assembly/logs?id=${id}`);
        const data = await res.json();
        if (data.ok) {
          content.textContent = data.log.join('\n') || 'No output recorded yet.';
          content.scrollTop = content.scrollHeight;
        }
      } catch (err) {}
    };

    fetchLogs();
    this.logInterval = setInterval(fetchLogs, 1000);
  },

  async triggerManualFabricate() {
    const moduleId = prompt("Enter Module ID to fabricate (e.g., 'TestSleeve_01'):");
    if (!moduleId) return;

    try {
      // Dummy TS data to trigger the build
      const sourceData = `
        export const ${moduleId.replace(/[^a-zA-Z0-9]/g, '')} = {
          version: "1.0.0",
          run: () => console.log("Hello from manually forged sleeve!")
        };
      `;

      const res = await fetch('/dashboard/api/assembly/fabricate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, sourceData })
      });

      const data = await res.json();
      if (!data.ok) {
        alert("Fabrication failed: " + data.error);
      } else {
        this.fetchProcesses();
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
  }
};
