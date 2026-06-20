async function loadView(view) {
  const res = await fetch(/public/views/.html);
  const html = await res.text();
  document.getElementById('app').innerHTML = html;
  if (view === 'layout') { await loadStats(); }
}

let globalData = { proposals: { recent: [] } };

async function loadStats() {
  try {
    const res = await fetch('/dashboard/api/status');
    globalData = await res.json();
    document.getElementById('uptime').innerText = Math.floor(globalData.uptime) + 's';
    document.getElementById('peers').innerText = globalData.federation.peers.length > 0 ? globalData.federation.peers.join(', ') : 'None';
    document.getElementById('proposal-stats').innerText = ${globalData.proposals.queued} Queued /  Total;
    renderTable();
  } catch (err) { console.error('Failed to load dashboard stats', err); }
}

function renderTable() {
  const tbody = document.getElementById('proposal-table');
  if(!tbody) return;
  tbody.innerHTML = '';
  if (globalData.proposals.recent.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3">No proposals found.</td></tr>';
  } else {
    globalData.proposals.recent.forEach(p => {
      const tr = document.createElement('tr');
      tr.onclick = () => showProposalDetail(p);
      tr.innerHTML = <td></td><td><span class="badge "></span></td><td></td>;
      tbody.appendChild(tr);
    });
  }
}

async function showProposalDetail(p) {
  document.getElementById('detail-view').style.display = 'block';
  document.getElementById('detail-title').innerText = 'Proposal: ' + p.id;
  let prHtml = '';
  try {
    const prRes = await fetch('/dashboard/api/pr-status?id=' + p.id);
    if (prRes.ok) {
      const prData = await prRes.json();
      prHtml = <p><strong>PR Status:</strong>  (<a href="" target="_blank">View PR</a>)</p>;
    }
  } catch(e){}
  const dataObj = typeof p.data === 'string' ? JSON.parse(p.data) : p.data;
  document.getElementById('detail-content').innerHTML = <p><strong>Status:</strong> <span class="badge "></span></p><p><strong>Notes:</strong> </p><h3>Innovations</h3><pre></pre><h3>Raw Envelope</h3><pre></pre>;
}

// Init SPA
loadView('layout');

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(protocol + '//' + window.location.host + '/dashboard/ws');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'proposal_update') { loadStats(); }
};
