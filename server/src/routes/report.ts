import { Router } from "../utils/Router";
import { PrimeDiscovery } from "../services/PrimeDiscovery.service";
import { AssemblyLine } from "../services/AssemblyLine.service";
import { Provisioner } from "../services/Provisioner.service";

const router = new Router();

router.get("/api/report/printable", (req, res) => {
  const db = PrimeDiscovery.getDatabase();
  
  let components: any[] = [];
  let candidates: any[] = [];
  
  if (db) {
    try {
      components = db.prepare(`
        SELECT a.*, c.classification, c.confidence, c.reasoning 
        FROM prime_artifacts a 
        JOIN prime_classifications c ON a.id = c.artifact_id
        WHERE c.classification = 'recognized_component'
      `).all();

      candidates = db.prepare(`
        SELECT a.*, c.classification, c.confidence, c.reasoning 
        FROM prime_artifacts a 
        JOIN prime_classifications c ON a.id = c.artifact_id
        WHERE c.classification = 'innovation_candidate'
      `).all();
    } catch(e) {}
  }

  const fabricationProcesses = AssemblyLine.getProcesses();
  const registry = Provisioner.getRegistry();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SDOA System Report</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 2rem; color: #333; line-height: 1.5; }
    h1, h2, h3 { color: #111; }
    .header { text-align: center; border-bottom: 2px solid #ccc; padding-bottom: 1rem; margin-bottom: 2rem; }
    .section { margin-bottom: 2rem; page-break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #ddd; padding: 0.75rem; text-align: left; }
    th { background-color: #f9f9f9; font-weight: bold; }
    .badge { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.85rem; font-family: monospace; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-purple { background: #f3e8ff; color: #6b21a8; }
    @media print {
      body { margin: 0; }
      button { display: none; }
    }
  </style>
</head>
<body onload="window.print()">
  <div class="header">
    <h1>SDOA Master Diagnostic & Inventory Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>

  <div class="section">
    <h2>1. Prime Discovery - Recognized Components</h2>
    ${components.length > 0 ? `
    <table>
      <tr><th>Component Name</th><th>Confidence</th><th>Reasoning</th></tr>
      ${components.map((c: any) => `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td><span class="badge badge-success">${c.confidence}%</span></td>
          <td>${c.reasoning}</td>
        </tr>
      `).join('')}
    </table>
    ` : '<p>No recognized components found.</p>'}
  </div>

  <div class="section">
    <h2>2. Prime Discovery - Innovation Candidates (Pipeline)</h2>
    ${candidates.length > 0 ? `
    <table>
      <tr><th>Candidate Name</th><th>Confidence</th><th>Reasoning</th></tr>
      ${candidates.map((c: any) => `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td><span class="badge badge-purple">${c.confidence}%</span></td>
          <td>${c.reasoning}</td>
        </tr>
      `).join('')}
    </table>
    ` : '<p>No candidates currently in pipeline.</p>'}
  </div>

  <div class="section">
    <h2>3. Assembly Line (Fabrication Queue)</h2>
    ${fabricationProcesses.length > 0 ? `
    <table>
      <tr><th>Process ID</th><th>Status</th><th>Started At</th><th>Restarts</th></tr>
      ${fabricationProcesses.map(p => `
        <tr>
          <td><code>${p.id}</code></td>
          <td><strong>${p.status}</strong></td>
          <td>${new Date(p.startedAt).toLocaleString()}</td>
          <td>${p.crashCount}</td>
        </tr>
      `).join('')}
    </table>
    ` : '<p>No active fabrication processes.</p>'}
  </div>

  <div class="section">
    <h2>4. Sleeve Registry (Provisioner)</h2>
    ${registry.length > 0 ? `
    <table>
      <tr><th>Module ID</th><th>Total Versions</th><th>Latest Version</th></tr>
      ${registry.map(r => `
        <tr>
          <td><strong>${r.moduleId}</strong></td>
          <td>${r.versions.length}</td>
          <td><code>${r.versions.length > 0 ? r.versions[r.versions.length - 1].versionId : 'N/A'}</code></td>
        </tr>
      `).join('')}
    </table>
    ` : '<p>Registry is currently empty.</p>'}
  </div>
</body>
</html>
  `;
  
  res.setHeader("Content-Type", "text/html");
  res.end(html);
});

router.get("/api/report/txt", (req, res) => {
  const db = PrimeDiscovery.getDatabase();
  
  let components: any[] = [];
  let candidates: any[] = [];
  
  if (db) {
    try {
      components = db.prepare(`
        SELECT a.*, c.classification, c.confidence, c.reasoning 
        FROM prime_artifacts a 
        JOIN prime_classifications c ON a.id = c.artifact_id
        WHERE c.classification = 'recognized_component'
      `).all();

      candidates = db.prepare(`
        SELECT a.*, c.classification, c.confidence, c.reasoning 
        FROM prime_artifacts a 
        JOIN prime_classifications c ON a.id = c.artifact_id
        WHERE c.classification = 'innovation_candidate'
      `).all();
    } catch(e) {}
  }

  const fabricationProcesses = AssemblyLine.getProcesses();
  const registry = Provisioner.getRegistry();

  let text = `SDOA MASTER DIAGNOSTIC & INVENTORY REPORT\n`;
  text += `Generated: ${new Date().toLocaleString()}\n`;
  text += `========================================================\n\n`;

  text += `1. PRIME DISCOVERY - RECOGNIZED COMPONENTS\n`;
  text += `--------------------------------------------------------\n`;
  if (components.length > 0) {
    components.forEach((c: any) => {
      text += `Name: ${c.name}\n`;
      text += `Confidence: ${c.confidence}%\n`;
      text += `Reasoning: ${c.reasoning}\n\n`;
    });
  } else {
    text += `No recognized components found.\n\n`;
  }

  text += `2. PRIME DISCOVERY - INNOVATION CANDIDATES\n`;
  text += `--------------------------------------------------------\n`;
  if (candidates.length > 0) {
    candidates.forEach((c: any) => {
      text += `Name: ${c.name}\n`;
      text += `Confidence: ${c.confidence}%\n`;
      text += `Reasoning: ${c.reasoning}\n\n`;
    });
  } else {
    text += `No candidates currently in pipeline.\n\n`;
  }

  text += `3. ASSEMBLY LINE (FABRICATION QUEUE)\n`;
  text += `--------------------------------------------------------\n`;
  if (fabricationProcesses.length > 0) {
    fabricationProcesses.forEach(p => {
      text += `Process ID: ${p.id}\n`;
      text += `Status: ${p.status}\n`;
      text += `Started At: ${new Date(p.startedAt).toLocaleString()}\n`;
      text += `Restarts: ${p.crashCount}\n\n`;
    });
  } else {
    text += `No active fabrication processes.\n\n`;
  }

  text += `4. SLEEVE REGISTRY (PROVISIONER)\n`;
  text += `--------------------------------------------------------\n`;
  if (registry.length > 0) {
    registry.forEach(r => {
      text += `Module ID: ${r.moduleId}\n`;
      text += `Total Versions: ${r.versions.length}\n`;
      text += `Latest Version: ${r.versions.length > 0 ? r.versions[r.versions.length - 1].versionId : 'N/A'}\n\n`;
    });
  } else {
    text += `Registry is currently empty.\n\n`;
  }

  // Tell the browser to download this as a text file
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", "attachment; filename=sdoa-master-report.txt");
  res.end(text);
});

export default router;
