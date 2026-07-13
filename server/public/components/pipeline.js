export default {
  render() {
    return `
      <div class="sdoa-card" style="margin-bottom: 2rem;">
        <h2>Innovation Pipeline</h2>
        <p class="text-muted" style="margin-bottom: 1.5rem;">Review and authorize structural innovations.</p>
        <div id="pipeline-list">Loading proposals...</div>
      </div>
    `;
  },
  
  init() {
    this.renderProposals();
  },

  onStateUpdate(type) {
    if (type === 'proposals') {
      this.renderProposals();
    }
  },

  renderProposals() {
    const list = document.getElementById('pipeline-list');
    if (!list) return;

    const proposals = window.SDOA_STATE.proposals || [];
    
    if (proposals.length === 0) {
      list.innerHTML = '<p class="text-muted">No pending proposals in the pipeline.</p>';
      return;
    }

    list.innerHTML = proposals.map(p => `
      <div class="sdoa-card" style="margin-bottom: 1rem; border-left: 4px solid ${p.status === 'queued' ? 'var(--sdoa-warning)' : p.status === 'approved' ? 'var(--sdoa-success)' : 'var(--sdoa-danger)'};">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <h3 style="margin-bottom: 0.5rem;">${p.name || p.id}</h3>
            <span class="sdoa-badge" style="background: rgba(255,255,255,0.1); color: white;">${p.type || 'proposal'}</span>
            <span class="text-muted font-mono" style="font-size: 0.8rem; margin-left: 0.5rem;">${p.id}</span>
          </div>
          <div>
            ${p.status === 'queued' ? `
              <button class="sdoa-btn sdoa-btn-success" onclick="approveProposal('${p.id}')">Approve</button>
              <button class="sdoa-btn sdoa-btn-danger" onclick="rejectProposal('${p.id}')">Reject</button>
            ` : `<span style="text-transform: capitalize; font-weight: bold; color: ${p.status === 'approved' ? 'var(--sdoa-success)' : 'var(--sdoa-danger)'};">${p.status}</span>`}
          </div>
        </div>
        <div style="margin-top: 1rem;">
          <details>
            <summary style="cursor: pointer; color: var(--sdoa-accent-primary);">View Capability Surface</summary>
            <pre class="sdoa-code" style="margin-top: 0.5rem;">${JSON.stringify(p, null, 2)}</pre>
          </details>
        </div>
      </div>
    `).join('');
  }
};

window.approveProposal = async (id) => {
  try {
    await fetch('/dashboard/api/actions/flush-queue', { method: 'POST' });
    // In a real app we'd target the specific ID
  } catch(e) { console.error(e); }
};

window.rejectProposal = async (id) => {
  console.log('Rejected', id);
};
