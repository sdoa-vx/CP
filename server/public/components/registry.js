export default {
  async render() {
    return `
      <div class="sdoa-dashboard-grid">
        <div class="sdoa-card sdoa-col-span-12">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <h3>Sleeve Registry (Provisioner)</h3>
            <button class="sdoa-btn sdoa-btn-outline" onclick="this.closest('.sdoa-card').querySelector('table').style.opacity = '0.5'; setTimeout(() => this.closest('.sdoa-card').querySelector('table').style.opacity = '1', 500)">Refresh Registry</button>
          </div>
          
          <div style="background: rgba(96, 165, 250, 0.1); border-left: 4px solid #60a5fa; padding: 1rem; margin-bottom: 1.5rem; border-radius: 0 4px 4px 0;">
            <h4 style="color: #60a5fa; margin-top: 0; margin-bottom: 0.5rem;">What is the Sleeve Registry?</h4>
            <p style="margin: 0; font-size: 0.9rem; color: var(--sdoa-text-secondary); line-height: 1.5;">
              Managed by the Provisioner, this is the secure vault for compiled Sleeves. It acts like a local Docker registry, keeping track of every version of every Sleeve.<br>
              <strong style="color: #cbd5e1;">Lifecycle Position: Step 2.</strong> Holds inert Sleeves securely until the Lifecycle Manager calls for them.
            </p>
          </div>

          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
              <thead>
                <tr style="border-bottom: 1px solid var(--sdoa-border); color: var(--sdoa-text-secondary);">
                  <th style="padding: 0.75rem;">Module ID</th>
                  <th style="padding: 0.75rem;">Versions</th>
                  <th style="padding: 0.75rem;">Active Version</th>
                  <th style="padding: 0.75rem;">Last Updated</th>
                  <th style="padding: 0.75rem;">Actions</th>
                </tr>
              </thead>
              <tbody id="registry-table-body">
                <tr><td colspan="5" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">Loading registry...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Versions Modal (Hidden by default) -->
        <div id="versions-modal" class="sdoa-card sdoa-col-span-12" style="display: none; margin-top: 1.5rem; background: #000; border: 1px solid #333;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: center;">
            <h4 id="versions-title" style="color: #a78bfa;">Version History</h4>
            <button id="btn-close-versions" class="sdoa-btn sdoa-btn-outline" style="padding: 0.2rem 0.5rem;">Close</button>
          </div>
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.8rem; margin-top: 1rem;">
            <thead>
              <tr style="border-bottom: 1px solid var(--sdoa-border); color: var(--sdoa-text-secondary);">
                <th style="padding: 0.5rem;">Version ID</th>
                <th style="padding: 0.5rem;">Created At</th>
                <th style="padding: 0.5rem;">Artifact Path</th>
              </tr>
            </thead>
            <tbody id="versions-content">
              <tr><td colspan="3">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  init() {
    this.fetchRegistry();
    this.fetchInterval = setInterval(() => this.fetchRegistry(), 3000);

    document.getElementById('btn-close-versions')?.addEventListener('click', () => {
      document.getElementById('versions-modal').style.display = 'none';
    });
  },

  destroy() {
    if (this.fetchInterval) clearInterval(this.fetchInterval);
  },

  async fetchRegistry() {
    try {
      const res = await fetch('/dashboard/api/provisioner/registry');
      const data = await res.json();
      
      if (data.ok) {
        const tbody = document.getElementById('registry-table-body');
        if (!tbody) return;

        if (data.registry.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5" style="padding: 1rem; text-align: center; color: var(--sdoa-text-secondary);">No sleeves registered.</td></tr>`;
          return;
        }

        tbody.innerHTML = data.registry.map(entry => {
          const latest = entry.versions[entry.versions.length - 1];
          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 0.75rem;" class="font-mono text-muted">${entry.moduleId}</td>
              <td style="padding: 0.75rem;">
                <span class="sdoa-badge" style="background: rgba(59,130,246,0.2); color: #60a5fa;">${entry.versions.length} versions</span>
              </td>
              <td style="padding: 0.75rem;">${entry.currentActiveVersion || '<span class="text-muted">None</span>'}</td>
              <td style="padding: 0.75rem;">${new Date(latest?.createdAt).toLocaleString() || 'Unknown'}</td>
              <td style="padding: 0.75rem;">
                <button class="sdoa-btn sdoa-btn-outline view-versions-btn" data-id="${entry.moduleId}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">History</button>
              </td>
            </tr>
          `;
        }).join('');

        // Attach listeners
        document.querySelectorAll('.view-versions-btn').forEach(btn => {
          btn.addEventListener('click', (e) => this.viewVersions(e.target.dataset.id));
        });
      }
    } catch (err) {
      console.error("Failed to fetch registry", err);
    }
  },

  async viewVersions(moduleId) {
    const modal = document.getElementById('versions-modal');
    const title = document.getElementById('versions-title');
    const content = document.getElementById('versions-content');
    
    if (!modal || !title || !content) return;
    
    modal.style.display = 'block';
    title.textContent = `Version History: ${moduleId}`;
    content.innerHTML = '<tr><td colspan="3" style="padding: 0.5rem;">Loading...</td></tr>';

    try {
      const res = await fetch(`/dashboard/api/provisioner/versions?moduleId=${moduleId}`);
      const data = await res.json();
      if (data.ok) {
        content.innerHTML = data.versions.reverse().map(v => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 0.5rem;" class="font-mono text-muted">${v.versionId}</td>
            <td style="padding: 0.5rem;">${new Date(v.createdAt).toLocaleString()}</td>
            <td style="padding: 0.5rem; font-size: 0.7rem;" class="font-mono">${v.artifactPath}</td>
          </tr>
        `).join('');
      }
    } catch (err) {
      content.innerHTML = '<tr><td colspan="3" style="padding: 0.5rem; color: #f87171;">Failed to load versions</td></tr>';
    }
  }
};
