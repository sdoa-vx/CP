export default {
  async render() {
    return `
      <div class="sdoa-dashboard-grid">
        <div class="sdoa-card sdoa-col-span-12">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
            <div>
              <h3>Prime Discovery Engine</h3>
              <p class="text-muted" style="margin-top: 0.2rem; font-size: 0.85rem;">Local-first intelligence for SDOA sovereign patterns</p>
            </div>
            <div style="display: flex; gap: 1rem; align-items: center;">
              <span id="prime-sync-status" style="font-family: monospace; color: var(--sdoa-text-secondary);">Sync Status: Checking...</span>
              <button id="btn-prime-scan" class="sdoa-btn sdoa-btn-outline" style="padding: 0.2rem 0.5rem;">Run Local Scan</button>
              <button id="btn-prime-run-pipeline" class="sdoa-btn sdoa-btn-primary" style="padding: 0.2rem 0.5rem; background-color: #8b5cf6;">Run Full Pipeline</button>
              <button id="btn-prime-export" class="sdoa-btn sdoa-btn-primary" style="padding: 0.2rem 0.5rem; display: none;">Download Report</button>
            </div>
          </div>
          
          <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
            <!-- Recognized Components -->
            <div style="flex: 1; min-width: 300px; background: rgba(0,0,0,0.3); border: 1px solid var(--sdoa-border); border-radius: 8px; padding: 1rem; max-height: 400px; overflow-y: auto;">
              <h4 style="margin-bottom: 1rem; color: #10b981;">Recognized SDOA Components</h4>
              <div id="prime-components-list" style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8rem;">
                <div style="text-align: center; color: var(--sdoa-text-secondary);">Loading components...</div>
              </div>
            </div>

            <!-- Innovation Candidates -->
            <div style="flex: 1; min-width: 300px; background: rgba(0,0,0,0.3); border: 1px solid var(--sdoa-border); border-radius: 8px; padding: 1rem; max-height: 400px; overflow-y: auto;">
              <h4 style="margin-bottom: 1rem; color: #8b5cf6;">Innovation Opportunities</h4>
              <div id="prime-candidates-list" style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8rem;">
                <div style="text-align: center; color: var(--sdoa-text-secondary);">Loading candidates...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- AI Provider Setup Wizard Modal -->
      <div id="ai-wizard-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center;">
        <div style="background: #1e1e1e; border: 1px solid var(--sdoa-border); border-radius: 8px; padding: 2rem; width: 500px; max-width: 90%;">
          <h3 style="color: #8b5cf6; margin-bottom: 1rem;">Intelligence Layer Abstraction</h3>
          <p style="color: var(--sdoa-text-secondary); margin-bottom: 1.5rem; font-size: 0.9rem;">
            No configured intelligence layers were detected. How would you like to proceed?
          </p>
          
          <div style="display: flex; flex-direction: column; gap: 1rem;">
            <div style="padding: 1rem; border: 1px solid var(--sdoa-border); border-radius: 6px;">
              <h4 style="margin-bottom: 0.5rem;">Connect Local LLM (Ollama)</h4>
              <p style="font-size: 0.8rem; color: #a1a1aa; margin-bottom: 0.5rem;">Ensure Ollama is running on port 11434.</p>
              <button class="sdoa-btn sdoa-btn-outline" onclick="window.retryOllama()">Retry Connection</button>
            </div>
            
            <div style="padding: 1rem; border: 1px solid var(--sdoa-border); border-radius: 6px;">
              <h4 style="margin-bottom: 0.5rem;">Configure Cloud API</h4>
              <div style="display: flex; gap: 0.5rem;">
                <form onsubmit="event.preventDefault(); window.saveCloudKey();" style="display: flex; gap: 0.5rem; width: 100%;">
                  <select id="cloud-api-provider" name="cloud-api-provider" style="background: #2d2d2d; color: #fff; border: 1px solid #404040; padding: 0.3rem;">
                    <option value="api_key_anthropic">Anthropic (Claude)</option>
                    <option value="api_key_openai">OpenAI</option>
                    <option value="api_key_openrouter">OpenRouter</option>
                    <option value="api_key_gemini">Google Gemini</option>
                  </select>
                  <input type="password" id="cloud-api-key" name="cloud-api-key" placeholder="Enter API Key" style="flex: 1; background: #2d2d2d; color: #fff; border: 1px solid #404040; padding: 0.3rem;" autocomplete="off">
                  <button type="submit" class="sdoa-btn sdoa-btn-primary">Save</button>
                </form>
              </div>
            </div>
            
            <div style="padding: 1rem; border: 1px solid var(--sdoa-border); border-radius: 6px;">
              <h4 style="margin-bottom: 0.5rem;">Generate Minimal Structural Module</h4>
              <p style="font-size: 0.8rem; color: #a1a1aa; margin-bottom: 0.5rem;">Bypass AI and procedurally generate a barebones SDOA class.</p>
              <button class="sdoa-btn sdoa-btn-outline" onclick="window.proceedWithoutAi()">Proceed without AI</button>
            </div>
          </div>
          
          <div style="margin-top: 1.5rem; text-align: right;">
            <button class="sdoa-btn sdoa-btn-outline" onclick="document.getElementById('ai-wizard-modal').style.display='none'">Cancel</button>
          </div>
        </div>
      </div>
    `;
  },

  init() {
    this.fetchStatus();
    this.fetchComponents();
    this.fetchCandidates();

    document.getElementById('btn-prime-scan')?.addEventListener('click', async () => {
      const targetPath = prompt("Enter absolute path to scan (or leave blank for workspace):");
      if (targetPath === null) return; // User cancelled

      document.getElementById('btn-prime-scan').textContent = "Scanning...";
      try {
        await fetch('/dashboard/api/prime/scan', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath || undefined })
        });
        setTimeout(() => {
          this.fetchStatus();
          this.fetchComponents();
          this.fetchCandidates();
          document.getElementById('btn-prime-scan').textContent = "Run Local Scan";
        }, 1500);
      } catch (err) {
        console.error(err);
      }
    });

    document.getElementById('btn-prime-export')?.addEventListener('click', () => {
      window.open('/dashboard/api/prime/download-report', '_blank');
    });

    document.getElementById('btn-prime-run-pipeline')?.addEventListener('click', async () => {
      try {
        await fetch('/dashboard/api/prime/run-pipeline', { method: 'POST' });
        setTimeout(() => this.fetchCandidates(), 1000);
      } catch (err) {}
    });
  },

  destroy() {
  },

  async fetchStatus() {
    try {
      const res = await fetch('/dashboard/api/prime/status');
      const data = await res.json();
      if (data.ok) {
        const statusEl = document.getElementById('prime-sync-status');
        const exportBtn = document.getElementById('btn-prime-export');
        
        if (statusEl) {
           statusEl.textContent = `Sync Status: ${data.syncStatus}`;
           if (data.syncStatus.includes("Failed")) {
             statusEl.style.color = "#ef4444";
             if (exportBtn) exportBtn.style.display = "block";
           } else if (data.syncStatus.includes("Synced")) {
             statusEl.style.color = "#10b981";
           }
        }
      }
    } catch (e) {}
  },

  async fetchComponents() {
    try {
      const res = await fetch('/dashboard/api/prime/components');
      const data = await res.json();
      const list = document.getElementById('prime-components-list');
      if (!list) return;

      if (data.ok && data.components && data.components.length > 0) {
        list.innerHTML = data.components.map(c => `
          <div style="padding: 0.5rem; border-left: 2px solid #10b981; background: rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 0.3rem;">
            <div style="display: flex; justify-content: space-between; font-family: monospace;">
              <span style="color: #10b981; font-weight: bold;">${c.name}</span>
              <span style="color: var(--sdoa-text-secondary);">${c.confidence}% Match</span>
            </div>
            <div style="color: #c9d1d9;">${c.reasoning}</div>
          </div>
        `).join('');
      } else {
        list.innerHTML = `<div style="text-align: center; color: var(--sdoa-text-secondary);">No recognized components found yet.</div>`;
      }
    } catch (e) {}
  },

  async fetchCandidates() {
    try {
      const res = await fetch('/dashboard/api/prime/innovation-candidates');
      const candidates = await res.json();
      const list = document.getElementById('prime-candidates-list');
      if (!list) return;

      if (candidates && candidates.length > 0) {
        list.innerHTML = candidates.map(c => `
          <div style="padding: 0.5rem; border-left: 2px solid #8b5cf6; background: rgba(255,255,255,0.02); display: flex; flex-direction: column; gap: 0.3rem;">
            <div style="display: flex; justify-content: space-between; font-family: monospace;">
              <span style="color: #8b5cf6; font-weight: bold;">${c.source_file.split(/[\\/]/).pop()}</span>
              <span style="color: var(--sdoa-text-secondary);">${c.confidence}% Match</span>
            </div>
            <div style="color: #c9d1d9;">${c.reasoning}</div>
            <div style="margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 0.75rem; color: ${c.status === 'failed' ? '#ef4444' : (c.status === 'activated' ? '#10b981' : '#fbbf24')}">Status: ${c.status}</span>
              ${c.status === 'pending' || c.status === 'failed' ? `<button class="sdoa-btn sdoa-btn-outline" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;" onclick="window.synthesizeCandidate('${c.id}')">Synthesize locally</button>` : ''}
            </div>
            ${c.error_message ? `<div style="color: #ef4444; font-size: 0.7rem; margin-top: 0.2rem;">${c.error_message}</div>` : ''}
          </div>
        `).join('');
      } else {
        list.innerHTML = `<div style="text-align: center; color: var(--sdoa-text-secondary);">No innovation candidates detected yet.</div>`;
      }
    } catch (e) {}
  }
};

let pendingSynthesisId = null;

window.synthesizeCandidate = async (id) => {
  pendingSynthesisId = id;
  
  try {
    // 1. Check AI Status first
    const statusRes = await fetch('/dashboard/api/prime/ai-status');
    const statusData = await statusRes.json();
    
    if (statusData.ok && statusData.providers) {
      // Find highest priority connected intelligent provider
      // Exclude procedural from the "has intelligence" check
      const intelligentProviders = statusData.providers.filter(p => p.status === 'connected' && p.id !== 'procedural');
      
      if (intelligentProviders.length === 0) {
        // Pop the wizard
        document.getElementById('ai-wizard-modal').style.display = 'flex';
        return;
      }
    }
    
    // Proceed with synthesis
    await window.executeSynthesis(id);
    
  } catch (err) {
    console.error(err);
    alert("Error checking AI providers: " + err.message);
  }
};

window.executeSynthesis = async (id) => {
  try {
    const res = await fetch('/dashboard/api/prime/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactId: id })
    });
    const data = await res.json();
    if (data.ok) {
      alert("Synthesis triggered. Please refresh manually or wait.");
      document.getElementById('ai-wizard-modal').style.display = 'none';
    } else {
      alert("Synthesis failed: " + data.error);
    }
  } catch (err) {
    console.error(err);
    alert("Synthesis error: " + err.message);
  }
};

window.retryOllama = async () => {
  // Just try to synthesize, it will fail and fallback to FISP if still dead
  if (pendingSynthesisId) {
    await window.executeSynthesis(pendingSynthesisId);
  }
};

window.saveCloudKey = async () => {
  const providerKey = document.getElementById('cloud-api-provider').value;
  const keyValue = document.getElementById('cloud-api-key').value;
  if (!keyValue) return alert("Enter a key first");
  
  try {
    const res = await fetch('/dashboard/api/prime/ai-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: providerKey, value: keyValue })
    });
    const data = await res.json();
    if (data.ok) {
      alert("Key saved! Proceeding with synthesis.");
      if (pendingSynthesisId) await window.executeSynthesis(pendingSynthesisId);
    }
  } catch (err) {
    console.error(err);
  }
};

window.proceedWithoutAi = async () => {
  if (pendingSynthesisId) {
    await window.executeSynthesis(pendingSynthesisId);
  }
};
