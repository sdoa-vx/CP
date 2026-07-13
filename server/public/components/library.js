export default {
  render() {
    return `
      <div class="sdoa-card" style="margin-bottom: 2rem;">
        <h2>SDOA Community Library</h2>
        <p class="text-muted" style="margin-bottom: 1.5rem;">Federated repository of canonical modules, compliance stats, and automated PR runs.</p>
        
        <div style="display: grid; grid-template-columns: 1fr; gap: 2rem;">
          <div>
            <h3>📦 Canonical Modules</h3>
            <div id="library-modules-list" style="margin-top: 1rem;">Loading community library...</div>
          </div>
          <div>
            <h3>🚦 Pull Request Automation Jobs</h3>
            <div id="library-pr-list" style="margin-top: 1rem;">Loading jobs...</div>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.fetchData();
  },

  async fetchData() {
    try {
      const res = await fetch('/dashboard/api/actions/community-library');
      const data = await res.json();
      if (data.ok) {
        this.renderModules(data.library);
        this.renderPrJobs(data.prJobs);
      } else {
        document.getElementById('library-modules-list').innerHTML = `<p class="text-danger">${data.error || 'Failed to fetch data'}</p>`;
      }
    } catch (e) {
      document.getElementById('library-modules-list').innerHTML = `<p class="text-danger">Failed to reach local engine server.</p>`;
    }
  },

  renderModules(modules) {
    const list = document.getElementById('library-modules-list');
    if (!list) return;

    if (modules.length === 0) {
      list.innerHTML = '<p class="text-muted">No canonical modules published to community library yet.</p>';
      return;
    }

    list.innerHTML = modules.map(m => `
      <div class="sdoa-card" style="margin-bottom: 1rem; border-left: 4px solid var(--sdoa-success); background: rgba(0,0,0,0.15);">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <h4 style="margin: 0 0 0.4rem 0; color: #ff00ff;">${m.module_id}</h4>
            <span class="sdoa-badge" style="background: rgba(255,255,255,0.08);">${m.type}</span>
            <span class="text-muted font-mono" style="font-size: 0.8rem; margin-left: 0.5rem;">Version ${m.version}</span>
          </div>
        </div>
        <div style="margin-top: 1rem;">
          <details>
            <summary style="cursor: pointer; color: var(--sdoa-accent-primary);">View Canonical Skeleton</summary>
            <pre class="sdoa-code" style="margin-top: 0.5rem; font-size: 0.8rem; line-height: 1.3;">${escapeHtml(m.source_code || '')}</pre>
          </details>
        </div>
      </div>
    `).join('');
  },

  renderPrJobs(jobs) {
    const list = document.getElementById('library-pr-list');
    if (!list) return;

    if (jobs.length === 0) {
      list.innerHTML = '<p class="text-muted">No PR automation jobs triggered yet.</p>';
      return;
    }

    list.innerHTML = jobs.map(j => `
      <div class="sdoa-card" style="margin-bottom: 1rem; border-left: 4px solid ${j.status === 'submitted' ? 'var(--sdoa-success)' : j.status === 'queued' ? 'var(--sdoa-warning)' : 'var(--sdoa-danger)'}; background: rgba(0,0,0,0.15); padding: 12px 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${j.canonical_id}</strong>
            <div style="font-size: 0.8rem; color: #a0a0b0; margin-top: 2px;">
              Repo: ${j.repo} • Branch: ${j.branch}
            </div>
          </div>
          <div style="text-align: right;">
            <span class="sdoa-badge" style="background: ${j.status === 'submitted' ? 'rgba(16,160,80,0.2)' : 'rgba(230,150,20,0.2)'}; color: ${j.status === 'submitted' ? '#50d080' : '#f0b040'}">${j.status.toUpperCase()}</span>
            ${j.pr_url ? `<div style="margin-top: 4px; font-size: 0.85rem;"><a href="${j.pr_url}" target="_blank" style="color: #ff00ff; text-decoration: none;">View PR</a></div>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  }
};

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
