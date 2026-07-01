import { c as create_ssr_component, s as subscribe, b as each, e as escape } from "../../chunks/ssr.js";
import "@sveltejs/kit/internal";
import "../../chunks/url.js";
import "../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/exports.js";
import "../../chunks/state.svelte.js";
import { s as scanStore } from "../../chunks/stores2.js";
const css = {
  code: '.control-center.svelte-18zx4xl.svelte-18zx4xl{max-width:1200px;margin:0 auto;color:#c9d1d9;font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif}header.svelte-18zx4xl.svelte-18zx4xl{margin-bottom:2rem}h1.svelte-18zx4xl.svelte-18zx4xl{margin:0;font-size:2rem;color:#58a6ff}header.svelte-18zx4xl p.svelte-18zx4xl{color:#8b949e;margin-top:0.5rem}.grid.svelte-18zx4xl.svelte-18zx4xl{display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:1.5rem}.card.svelte-18zx4xl.svelte-18zx4xl{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;cursor:pointer;transition:transform 0.2s, border-color 0.2s, box-shadow 0.2s;display:flex;flex-direction:column}.card.svelte-18zx4xl.svelte-18zx4xl:hover{transform:translateY(-2px);border-color:#58a6ff;box-shadow:0 4px 12px rgba(0,0,0,0.5)}.card-header.svelte-18zx4xl.svelte-18zx4xl{display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem}.icon.svelte-18zx4xl.svelte-18zx4xl{font-size:1.5rem}.card-header.svelte-18zx4xl h2.svelte-18zx4xl{margin:0;font-size:1.2rem;color:#e6edf3}.desc.svelte-18zx4xl.svelte-18zx4xl{color:#8b949e;font-size:0.9rem;flex:1;margin:0 0 1.5rem 0;line-height:1.4}.metric.svelte-18zx4xl.svelte-18zx4xl{font-family:monospace;font-size:0.85rem;color:#3fb950;background:#21262d;padding:0.4rem 0.6rem;border-radius:4px;display:inline-block;align-self:flex-start}',
  map: '{"version":3,"file":"+page.svelte","sources":["+page.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { onMount } from \\"svelte\\";\\nimport { goto } from \\"$app/navigation\\";\\nimport { base } from \\"$app/paths\\";\\nimport { scanStore } from \\"$lib/state/stores\\";\\nlet status = null;\\nlet state = null;\\nonMount(async () => {\\n  try {\\n    const [statusRes, stateRes] = await Promise.all([\\n      fetch(`${base}/api/status`),\\n      fetch(`${base}/api/state`)\\n    ]);\\n    if (statusRes.ok) status = await statusRes.json();\\n    if (stateRes.ok) state = await stateRes.json();\\n  } catch (err) {\\n    console.error(\\"Failed to fetch dashboard data\\", err);\\n  }\\n});\\nconst cards = [\\n  { id: \\"mesh\\", title: \\"Mesh View\\", icon: \\"\\\\u{1F310}\\", path: \\"/mesh\\", desc: \\"Interactive node graph of project intelligence\\", metric: (st) => st ? `${Object.values(st.detectorHits || {}).reduce((a, b) => a + b, 0)} Insights` : \\"Loading...\\" },\\n  { id: \\"proposals\\", title: \\"Proposals\\", icon: \\"\\\\u{1F4DD}\\", path: \\"/proposals\\", desc: \\"Pending system proposals and legacy queue\\", metric: (_st, stat) => stat ? `${stat.proposals.queued} Pending / ${stat.proposals.total} Total` : \\"Loading...\\" },\\n  { id: \\"scan\\", title: \\"Scan Engine\\", icon: \\"\\\\u{1F50D}\\", path: \\"/scan\\", desc: \\"Real-time AST cache and engine scanning\\", metric: (st, _stat, scan) => scan?.active ? `Scanning: ${scan.percent}% (${scan.index}/${scan.total})` : st ? `${st.astCacheSize} Files Cached` : \\"Loading...\\" },\\n  { id: \\"governance\\", title: \\"Governance\\", icon: \\"\\\\u2696\\\\uFE0F\\", path: \\"/governance\\", desc: \\"System governance, sigils, and policies\\", metric: () => \\"Active\\" },\\n  { id: \\"timeline\\", title: \\"Timeline\\", icon: \\"\\\\u23F1\\\\uFE0F\\", path: \\"/timeline\\", desc: \\"Innovation tracking and system evolution\\", metric: () => \\"Active\\" },\\n  { id: \\"lineage\\", title: \\"Lineage\\", icon: \\"\\\\u{1F9EC}\\", path: \\"/lineage\\", desc: \\"Component ancestry and dependency tracking\\", metric: () => \\"Active\\" },\\n  { id: \\"drift\\", title: \\"Drift\\", icon: \\"\\\\u{1F4C8}\\", path: \\"/drift\\", desc: \\"Heatmaps and code drift detection\\", metric: () => \\"Active\\" },\\n  { id: \\"time-machine\\", title: \\"Time Machine\\", icon: \\"\\\\u23F3\\", path: \\"/time-machine\\", desc: \\"Historical snapshots and rewinds\\", metric: () => \\"Active\\" }\\n];\\n<\/script>\\n\\n<div class=\\"control-center\\">\\n  <header>\\n    <h1>Control Center</h1>\\n    <p>At-a-glance overview of the SDOA MCP Engine</p>\\n  </header>\\n\\n  <div class=\\"grid\\">\\n    {#each cards as card}\\n      <!-- svelte-ignore a11y-click-events-have-key-events -->\\n      <div class=\\"card\\" on:click={() => goto(`${base}${card.path}`)}>\\n        <div class=\\"card-header\\">\\n          <span class=\\"icon\\">{card.icon}</span>\\n          <h2>{card.title}</h2>\\n        </div>\\n        <p class=\\"desc\\">{card.desc}</p>\\n        <div class=\\"metric\\">{card.metric(state, status, $scanStore)}</div>\\n      </div>\\n    {/each}\\n  </div>\\n</div>\\n\\n<style>\\n  .control-center {\\n    max-width: 1200px;\\n    margin: 0 auto;\\n    color: #c9d1d9;\\n    font-family: -apple-system, BlinkMacSystemFont, \\"Segoe UI\\", Helvetica, Arial, sans-serif;\\n  }\\n  header {\\n    margin-bottom: 2rem;\\n  }\\n  h1 {\\n    margin: 0;\\n    font-size: 2rem;\\n    color: #58a6ff;\\n  }\\n  header p {\\n    color: #8b949e;\\n    margin-top: 0.5rem;\\n  }\\n  .grid {\\n    display: grid;\\n    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));\\n    gap: 1.5rem;\\n  }\\n  .card {\\n    background: #161b22;\\n    border: 1px solid #30363d;\\n    border-radius: 8px;\\n    padding: 1.5rem;\\n    cursor: pointer;\\n    transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;\\n    display: flex;\\n    flex-direction: column;\\n  }\\n  .card:hover {\\n    transform: translateY(-2px);\\n    border-color: #58a6ff;\\n    box-shadow: 0 4px 12px rgba(0,0,0,0.5);\\n  }\\n  .card-header {\\n    display: flex;\\n    align-items: center;\\n    gap: 0.75rem;\\n    margin-bottom: 1rem;\\n  }\\n  .icon {\\n    font-size: 1.5rem;\\n  }\\n  .card-header h2 {\\n    margin: 0;\\n    font-size: 1.2rem;\\n    color: #e6edf3;\\n  }\\n  .desc {\\n    color: #8b949e;\\n    font-size: 0.9rem;\\n    flex: 1;\\n    margin: 0 0 1.5rem 0;\\n    line-height: 1.4;\\n  }\\n  .metric {\\n    font-family: monospace;\\n    font-size: 0.85rem;\\n    color: #3fb950;\\n    background: #21262d;\\n    padding: 0.4rem 0.6rem;\\n    border-radius: 4px;\\n    display: inline-block;\\n    align-self: flex-start;\\n  }\\n</style>\\n"],"names":[],"mappings":"AAoDE,6CAAgB,CACd,SAAS,CAAE,MAAM,CACjB,MAAM,CAAE,CAAC,CAAC,IAAI,CACd,KAAK,CAAE,OAAO,CACd,WAAW,CAAE,aAAa,CAAC,CAAC,kBAAkB,CAAC,CAAC,UAAU,CAAC,CAAC,SAAS,CAAC,CAAC,KAAK,CAAC,CAAC,UAChF,CACA,oCAAO,CACL,aAAa,CAAE,IACjB,CACA,gCAAG,CACD,MAAM,CAAE,CAAC,CACT,SAAS,CAAE,IAAI,CACf,KAAK,CAAE,OACT,CACA,qBAAM,CAAC,gBAAE,CACP,KAAK,CAAE,OAAO,CACd,UAAU,CAAE,MACd,CACA,mCAAM,CACJ,OAAO,CAAE,IAAI,CACb,qBAAqB,CAAE,OAAO,QAAQ,CAAC,CAAC,OAAO,KAAK,CAAC,CAAC,GAAG,CAAC,CAAC,CAC3D,GAAG,CAAE,MACP,CACA,mCAAM,CACJ,UAAU,CAAE,OAAO,CACnB,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,OAAO,CACzB,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,MAAM,CACf,MAAM,CAAE,OAAO,CACf,UAAU,CAAE,SAAS,CAAC,IAAI,CAAC,CAAC,YAAY,CAAC,IAAI,CAAC,CAAC,UAAU,CAAC,IAAI,CAC9D,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MAClB,CACA,mCAAK,MAAO,CACV,SAAS,CAAE,WAAW,IAAI,CAAC,CAC3B,YAAY,CAAE,OAAO,CACrB,UAAU,CAAE,CAAC,CAAC,GAAG,CAAC,IAAI,CAAC,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CACvC,CACA,0CAAa,CACX,OAAO,CAAE,IAAI,CACb,WAAW,CAAE,MAAM,CACnB,GAAG,CAAE,OAAO,CACZ,aAAa,CAAE,IACjB,CACA,mCAAM,CACJ,SAAS,CAAE,MACb,CACA,2BAAY,CAAC,iBAAG,CACd,MAAM,CAAE,CAAC,CACT,SAAS,CAAE,MAAM,CACjB,KAAK,CAAE,OACT,CACA,mCAAM,CACJ,KAAK,CAAE,OAAO,CACd,SAAS,CAAE,MAAM,CACjB,IAAI,CAAE,CAAC,CACP,MAAM,CAAE,CAAC,CAAC,CAAC,CAAC,MAAM,CAAC,CAAC,CACpB,WAAW,CAAE,GACf,CACA,qCAAQ,CACN,WAAW,CAAE,SAAS,CACtB,SAAS,CAAE,OAAO,CAClB,KAAK,CAAE,OAAO,CACd,UAAU,CAAE,OAAO,CACnB,OAAO,CAAE,MAAM,CAAC,MAAM,CACtB,aAAa,CAAE,GAAG,CAClB,OAAO,CAAE,YAAY,CACrB,UAAU,CAAE,UACd"}'
};
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $scanStore, $$unsubscribe_scanStore;
  $$unsubscribe_scanStore = subscribe(scanStore, (value) => $scanStore = value);
  let status = null;
  let state = null;
  const cards = [
    {
      id: "mesh",
      title: "Mesh View",
      icon: "🌐",
      path: "/mesh",
      desc: "Interactive node graph of project intelligence",
      metric: (st) => st ? `${Object.values(st.detectorHits || {}).reduce((a, b) => a + b, 0)} Insights` : "Loading..."
    },
    {
      id: "proposals",
      title: "Proposals",
      icon: "📝",
      path: "/proposals",
      desc: "Pending system proposals and legacy queue",
      metric: (_st, stat) => stat ? `${stat.proposals.queued} Pending / ${stat.proposals.total} Total` : "Loading..."
    },
    {
      id: "scan",
      title: "Scan Engine",
      icon: "🔍",
      path: "/scan",
      desc: "Real-time AST cache and engine scanning",
      metric: (st, _stat, scan) => scan?.active ? `Scanning: ${scan.percent}% (${scan.index}/${scan.total})` : st ? `${st.astCacheSize} Files Cached` : "Loading..."
    },
    {
      id: "governance",
      title: "Governance",
      icon: "⚖️",
      path: "/governance",
      desc: "System governance, sigils, and policies",
      metric: () => "Active"
    },
    {
      id: "timeline",
      title: "Timeline",
      icon: "⏱️",
      path: "/timeline",
      desc: "Innovation tracking and system evolution",
      metric: () => "Active"
    },
    {
      id: "lineage",
      title: "Lineage",
      icon: "🧬",
      path: "/lineage",
      desc: "Component ancestry and dependency tracking",
      metric: () => "Active"
    },
    {
      id: "drift",
      title: "Drift",
      icon: "📈",
      path: "/drift",
      desc: "Heatmaps and code drift detection",
      metric: () => "Active"
    },
    {
      id: "time-machine",
      title: "Time Machine",
      icon: "⏳",
      path: "/time-machine",
      desc: "Historical snapshots and rewinds",
      metric: () => "Active"
    }
  ];
  $$result.css.add(css);
  $$unsubscribe_scanStore();
  return `<div class="control-center svelte-18zx4xl"><header class="svelte-18zx4xl" data-svelte-h="svelte-1l5zho4"><h1 class="svelte-18zx4xl">Control Center</h1> <p class="svelte-18zx4xl">At-a-glance overview of the SDOA MCP Engine</p></header> <div class="grid svelte-18zx4xl">${each(cards, (card) => {
    return ` <div class="card svelte-18zx4xl"><div class="card-header svelte-18zx4xl"><span class="icon svelte-18zx4xl">${escape(card.icon)}</span> <h2 class="svelte-18zx4xl">${escape(card.title)}</h2></div> <p class="desc svelte-18zx4xl">${escape(card.desc)}</p> <div class="metric svelte-18zx4xl">${escape(card.metric(state, status, $scanStore))}</div> </div>`;
  })}</div> </div>`;
});
export {
  Page as default
};
