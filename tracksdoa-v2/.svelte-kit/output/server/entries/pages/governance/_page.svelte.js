import { c as create_ssr_component, s as subscribe, v as validate_component, b as each, e as escape } from "../../../chunks/ssr.js";
import { g as governanceStore } from "../../../chunks/stores2.js";
import { G as GovernanceSigils } from "../../../chunks/GovernanceSigils.js";
const css = {
  code: ".governance-page.svelte-qz6i8n.svelte-qz6i8n{display:flex;flex-direction:column;height:100%;gap:2rem}.header.svelte-qz6i8n.svelte-qz6i8n{display:flex;justify-content:space-between;align-items:center;background:#161b22;padding:1.5rem;border:1px solid #30363d;border-radius:8px}.header.svelte-qz6i8n h1.svelte-qz6i8n{margin:0}.tabs.svelte-qz6i8n.svelte-qz6i8n{display:flex;gap:1rem;border-bottom:1px solid #30363d;padding-bottom:0.5rem}.tab-btn.svelte-qz6i8n.svelte-qz6i8n{background:transparent;border:none;color:#8b949e;font-size:1rem;cursor:pointer;padding:0.5rem 1rem;border-radius:4px;transition:all 0.2s;display:flex;align-items:center;gap:0.5rem}.tab-btn.svelte-qz6i8n.svelte-qz6i8n:hover{background:rgba(255, 255, 255, 0.05);color:#c9d1d9}.tab-btn.active.svelte-qz6i8n.svelte-qz6i8n{background:#21262d;color:white;font-weight:bold;border-bottom:2px solid #58a6ff}.console-content.svelte-qz6i8n.svelte-qz6i8n{flex:1;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:2rem;overflow-y:auto}.placeholder-data.svelte-qz6i8n.svelte-qz6i8n{background:#0d1117;padding:1rem;border-radius:4px;font-family:monospace;font-size:0.9rem;color:#8b949e;overflow-x:auto}",
  map: `{"version":3,"file":"+page.svelte","sources":["+page.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { proposalStore, governanceStore } from \\"$lib/state/stores\\";\\nimport GovernanceSigils from \\"$lib/components/GovernanceSigils.svelte\\";\\nlet activeTab = \\"coach\\";\\nconst tabs = [\\n  { id: \\"coach\\", label: \\"Coach\\", icon: \\"\\\\u{1F9E0}\\" },\\n  { id: \\"registrar\\", label: \\"Registrar\\", icon: \\"\\\\u{1F4DD}\\" },\\n  { id: \\"probation\\", label: \\"ProbationOfficer\\", icon: \\"\\\\u{1F6E1}\\\\uFE0F\\" },\\n  { id: \\"oracle\\", label: \\"Oracle\\", icon: \\"\\\\u{1F52E}\\" },\\n  { id: \\"cartographer\\", label: \\"Cartographer\\", icon: \\"\\\\u{1F5FA}\\\\uFE0F\\" }\\n];\\n<\/script>\\r\\n\\r\\n<div class=\\"governance-page\\">\\r\\n  <div class=\\"header\\">\\r\\n    <h1>Sovereign Governance Consoles</h1>\\r\\n    <GovernanceSigils />\\r\\n  </div>\\r\\n\\r\\n  <div class=\\"tabs\\">\\r\\n    {#each tabs as tab}\\r\\n      <button \\r\\n        class=\\"tab-btn\\" \\r\\n        class:active={activeTab === tab.id}\\r\\n        on:click={() => activeTab = tab.id}\\r\\n      >\\r\\n        <span class=\\"icon\\">{tab.icon}</span>\\r\\n        {tab.label}\\r\\n      </button>\\r\\n    {/each}\\r\\n  </div>\\r\\n\\r\\n  <div class=\\"console-content\\">\\r\\n    {#if activeTab === 'coach'}\\r\\n      <div class=\\"console\\">\\r\\n        <h2>Coach Metrics</h2>\\r\\n        <p>Telemetry, operational cadence, and system health assessments.</p>\\r\\n        <!-- Replace with specific Coach component -->\\r\\n        <div class=\\"placeholder-data\\">\\r\\n          <pre>{JSON.stringify($governanceStore, null, 2)}</pre>\\r\\n        </div>\\r\\n      </div>\\r\\n    {:else if activeTab === 'registrar'}\\r\\n      <div class=\\"console\\">\\r\\n        <h2>Registrar Lineage</h2>\\r\\n        <p>Capability registries, node tracking, and architectural lineage.</p>\\r\\n      </div>\\r\\n    {:else if activeTab === 'probation'}\\r\\n      <div class=\\"console\\">\\r\\n        <h2>ProbationOfficer Constraints</h2>\\r\\n        <p>Safety boundary checks, violation reporting, and compliance assertions.</p>\\r\\n      </div>\\r\\n    {:else if activeTab === 'oracle'}\\r\\n      <div class=\\"console\\">\\r\\n        <h2>Oracle Scoring</h2>\\r\\n        <p>Multi-factor rankings and capability surface scoring.</p>\\r\\n      </div>\\r\\n    {:else if activeTab === 'cartographer'}\\r\\n      <div class=\\"console\\">\\r\\n        <h2>Cartographer Drift Forecasts</h2>\\r\\n        <p>Architectural drift, slope velocity, and threshold proximity.</p>\\r\\n      </div>\\r\\n    {/if}\\r\\n  </div>\\r\\n</div>\\r\\n\\r\\n<style>\\r\\n  .governance-page {\\r\\n    display: flex;\\r\\n    flex-direction: column;\\r\\n    height: 100%;\\r\\n    gap: 2rem;\\r\\n  }\\r\\n  .header {\\r\\n    display: flex;\\r\\n    justify-content: space-between;\\r\\n    align-items: center;\\r\\n    background: #161b22;\\r\\n    padding: 1.5rem;\\r\\n    border: 1px solid #30363d;\\r\\n    border-radius: 8px;\\r\\n  }\\r\\n  .header h1 {\\r\\n    margin: 0;\\r\\n  }\\r\\n  .tabs {\\r\\n    display: flex;\\r\\n    gap: 1rem;\\r\\n    border-bottom: 1px solid #30363d;\\r\\n    padding-bottom: 0.5rem;\\r\\n  }\\r\\n  .tab-btn {\\r\\n    background: transparent;\\r\\n    border: none;\\r\\n    color: #8b949e;\\r\\n    font-size: 1rem;\\r\\n    cursor: pointer;\\r\\n    padding: 0.5rem 1rem;\\r\\n    border-radius: 4px;\\r\\n    transition: all 0.2s;\\r\\n    display: flex;\\r\\n    align-items: center;\\r\\n    gap: 0.5rem;\\r\\n  }\\r\\n  .tab-btn:hover {\\r\\n    background: rgba(255, 255, 255, 0.05);\\r\\n    color: #c9d1d9;\\r\\n  }\\r\\n  .tab-btn.active {\\r\\n    background: #21262d;\\r\\n    color: white;\\r\\n    font-weight: bold;\\r\\n    border-bottom: 2px solid #58a6ff;\\r\\n  }\\r\\n  .console-content {\\r\\n    flex: 1;\\r\\n    background: #161b22;\\r\\n    border: 1px solid #30363d;\\r\\n    border-radius: 8px;\\r\\n    padding: 2rem;\\r\\n    overflow-y: auto;\\r\\n  }\\r\\n  .placeholder-data {\\r\\n    background: #0d1117;\\r\\n    padding: 1rem;\\r\\n    border-radius: 4px;\\r\\n    font-family: monospace;\\r\\n    font-size: 0.9rem;\\r\\n    color: #8b949e;\\r\\n    overflow-x: auto;\\r\\n  }\\r\\n</style>\\r\\n"],"names":[],"mappings":"AAkEE,4CAAiB,CACf,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MAAM,CACtB,MAAM,CAAE,IAAI,CACZ,GAAG,CAAE,IACP,CACA,mCAAQ,CACN,OAAO,CAAE,IAAI,CACb,eAAe,CAAE,aAAa,CAC9B,WAAW,CAAE,MAAM,CACnB,UAAU,CAAE,OAAO,CACnB,OAAO,CAAE,MAAM,CACf,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,OAAO,CACzB,aAAa,CAAE,GACjB,CACA,qBAAO,CAAC,gBAAG,CACT,MAAM,CAAE,CACV,CACA,iCAAM,CACJ,OAAO,CAAE,IAAI,CACb,GAAG,CAAE,IAAI,CACT,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,OAAO,CAChC,cAAc,CAAE,MAClB,CACA,oCAAS,CACP,UAAU,CAAE,WAAW,CACvB,MAAM,CAAE,IAAI,CACZ,KAAK,CAAE,OAAO,CACd,SAAS,CAAE,IAAI,CACf,MAAM,CAAE,OAAO,CACf,OAAO,CAAE,MAAM,CAAC,IAAI,CACpB,aAAa,CAAE,GAAG,CAClB,UAAU,CAAE,GAAG,CAAC,IAAI,CACpB,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,MAAM,CACnB,GAAG,CAAE,MACP,CACA,oCAAQ,MAAO,CACb,UAAU,CAAE,KAAK,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,GAAG,CAAC,CAAC,IAAI,CAAC,CACrC,KAAK,CAAE,OACT,CACA,QAAQ,mCAAQ,CACd,UAAU,CAAE,OAAO,CACnB,KAAK,CAAE,KAAK,CACZ,WAAW,CAAE,IAAI,CACjB,aAAa,CAAE,GAAG,CAAC,KAAK,CAAC,OAC3B,CACA,4CAAiB,CACf,IAAI,CAAE,CAAC,CACP,UAAU,CAAE,OAAO,CACnB,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,OAAO,CACzB,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,IAAI,CACb,UAAU,CAAE,IACd,CACA,6CAAkB,CAChB,UAAU,CAAE,OAAO,CACnB,OAAO,CAAE,IAAI,CACb,aAAa,CAAE,GAAG,CAClB,WAAW,CAAE,SAAS,CACtB,SAAS,CAAE,MAAM,CACjB,KAAK,CAAE,OAAO,CACd,UAAU,CAAE,IACd"}`
};
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $governanceStore, $$unsubscribe_governanceStore;
  $$unsubscribe_governanceStore = subscribe(governanceStore, (value) => $governanceStore = value);
  let activeTab = "coach";
  const tabs = [
    {
      id: "coach",
      label: "Coach",
      icon: "🧠"
    },
    {
      id: "registrar",
      label: "Registrar",
      icon: "📝"
    },
    {
      id: "probation",
      label: "ProbationOfficer",
      icon: "🛡️"
    },
    {
      id: "oracle",
      label: "Oracle",
      icon: "🔮"
    },
    {
      id: "cartographer",
      label: "Cartographer",
      icon: "🗺️"
    }
  ];
  $$result.css.add(css);
  $$unsubscribe_governanceStore();
  return `<div class="governance-page svelte-qz6i8n"><div class="header svelte-qz6i8n"><h1 class="svelte-qz6i8n" data-svelte-h="svelte-1bsk3hc">Sovereign Governance Consoles</h1> ${validate_component(GovernanceSigils, "GovernanceSigils").$$render($$result, {}, {}, {})}</div> <div class="tabs svelte-qz6i8n">${each(tabs, (tab) => {
    return `<button class="${["tab-btn svelte-qz6i8n", activeTab === tab.id ? "active" : ""].join(" ").trim()}"><span class="icon">${escape(tab.icon)}</span> ${escape(tab.label)} </button>`;
  })}</div> <div class="console-content svelte-qz6i8n">${`<div class="console"><h2 data-svelte-h="svelte-1n0oh6r">Coach Metrics</h2> <p data-svelte-h="svelte-18fufxz">Telemetry, operational cadence, and system health assessments.</p>  <div class="placeholder-data svelte-qz6i8n"><pre>${escape(JSON.stringify($governanceStore, null, 2))}</pre></div></div>`}</div> </div>`;
});
export {
  Page as default
};
