export default {
  async render() {
    return `
      <div class="sdoa-dashboard-grid">
        <!-- Pulse Telemetry Overview -->
        <div class="sdoa-card sdoa-col-span-12">
          <h2>Mesh Health & Drift Horizon</h2>
          <p class="text-muted" style="margin-bottom: 1.5rem;">Live telemetry and anomaly detection powered by Pulse.</p>
          
          <div class="sdoa-grid">
            <div class="sdoa-card" style="background: rgba(59, 130, 246, 0.05); border-color: rgba(59, 130, 246, 0.2);">
              <h4 class="text-muted">Avg P95 Latency</h4>
              <p id="pulse-avg-latency" style="font-size: 2rem; font-weight: 600; color: var(--sdoa-accent-primary);">-- ms</p>
            </div>
            <div class="sdoa-card" style="background: rgba(239, 68, 68, 0.05); border-color: rgba(239, 68, 68, 0.2);">
              <h4 class="text-muted">Global Error Rate</h4>
              <p id="pulse-error-rate" style="font-size: 2rem; font-weight: 600; color: var(--sdoa-danger);">-- %</p>
            </div>
            <div class="sdoa-card" style="background: rgba(16, 185, 129, 0.05); border-color: rgba(16, 185, 129, 0.2);">
              <h4 class="text-muted">Event Throughput</h4>
              <p id="pulse-throughput" style="font-size: 2rem; font-weight: 600; color: var(--sdoa-success);">-- events</p>
            </div>
          </div>
        </div>

        <!-- High Latency Modules -->
        <div class="sdoa-card sdoa-col-span-6">
          <h3 style="color: var(--sdoa-warning); margin-bottom: 1rem;">Top Latency Drift (P95)</h3>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
            <thead>
              <tr style="border-bottom: 1px solid var(--sdoa-border); color: var(--sdoa-text-secondary);">
                <th style="padding: 0.5rem;">Module ID</th>
                <th style="padding: 0.5rem;">P95 (ms)</th>
                <th style="padding: 0.5rem;">Samples</th>
              </tr>
            </thead>
            <tbody id="latency-table-body">
              <tr><td colspan="3" style="padding: 1rem; color: var(--sdoa-text-secondary);">Loading...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- High Error Rate Modules -->
        <div class="sdoa-card sdoa-col-span-6">
          <h3 style="color: var(--sdoa-danger); margin-bottom: 1rem;">Top Error Rates</h3>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
            <thead>
              <tr style="border-bottom: 1px solid var(--sdoa-border); color: var(--sdoa-text-secondary);">
                <th style="padding: 0.5rem;">Module ID</th>
                <th style="padding: 0.5rem;">Error Rate</th>
                <th style="padding: 0.5rem;">Samples</th>
              </tr>
            </thead>
            <tbody id="error-table-body">
              <tr><td colspan="3" style="padding: 1rem; color: var(--sdoa-text-secondary);">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  init() {
    this.fetchData();
    this.fetchInterval = setInterval(() => this.fetchData(), 2000);
  },

  destroy() {
    if (this.fetchInterval) clearInterval(this.fetchInterval);
  },

  async fetchData() {
    try {
      const [snapRes, rankRes] = await Promise.all([
        fetch('/dashboard/api/pulse/snapshot'),
        fetch('/dashboard/api/pulse/rankings')
      ]);

      const snapData = await snapRes.json();
      const rankData = await rankRes.json();

      if (snapData.ok && snapData.snapshot) {
        const snap = snapData.snapshot;
        
        // Calculate global averages
        const avgLat = snap.modules.length > 0 
          ? Math.round(snap.modules.reduce((acc, m) => acc + m.p95, 0) / snap.modules.length) 
          : 0;
          
        const totalErrors = snap.modules.reduce((acc, m) => acc + m.errorCount, 0);
        const globalErrorRate = snap.totalSamples > 0 
          ? ((totalErrors / snap.totalSamples) * 100).toFixed(1) 
          : 0;

        const totalEvents = Object.values(snap.eventThroughput).reduce((acc, v) => acc + v, 0);

        document.getElementById('pulse-avg-latency').textContent = `${avgLat} ms`;
        document.getElementById('pulse-error-rate').textContent = `${globalErrorRate} %`;
        document.getElementById('pulse-throughput').textContent = `${totalEvents}`;
      }

      if (rankData.ok) {
        const latTbody = document.getElementById('latency-table-body');
        const errTbody = document.getElementById('error-table-body');

        if (latTbody) {
          if (rankData.latency.modules.length === 0) {
            latTbody.innerHTML = `<tr><td colspan="3" style="padding: 1rem; color: var(--sdoa-success);">All modules operating nominally.</td></tr>`;
          } else {
            latTbody.innerHTML = rankData.latency.modules.map(m => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 0.5rem;" class="font-mono">${m.moduleId}</td>
                <td style="padding: 0.5rem; color: var(--sdoa-warning);">${m.p95}</td>
                <td style="padding: 0.5rem;">${m.sampleCount}</td>
              </tr>
            `).join('');
          }
        }

        if (errTbody) {
          if (rankData.errors.modules.length === 0) {
            errTbody.innerHTML = `<tr><td colspan="3" style="padding: 1rem; color: var(--sdoa-success);">No critical errors detected.</td></tr>`;
          } else {
            errTbody.innerHTML = rankData.errors.modules.map(m => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 0.5rem;" class="font-mono">${m.moduleId}</td>
                <td style="padding: 0.5rem; color: var(--sdoa-danger);">${m.errorRatePct}%</td>
                <td style="padding: 0.5rem;">${m.sampleCount}</td>
              </tr>
            `).join('');
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch Pulse telemetry", err);
    }
  }
};
