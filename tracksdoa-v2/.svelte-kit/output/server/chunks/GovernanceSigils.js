import { c as create_ssr_component, s as subscribe, b as each, e as escape } from "./ssr.js";
import { g as governanceStore } from "./stores2.js";
const css = {
  code: ".sigil-panel.svelte-amzvub{display:flex;gap:1rem;padding:1rem;background:rgba(0,0,0,0.2);border-radius:8px}.sigil.svelte-amzvub{display:flex;flex-direction:column;align-items:center;gap:0.5rem;padding:1rem;border-radius:8px;background:rgba(255,255,255,0.05);transition:background 0.2s}.sigil.active.svelte-amzvub{background:rgba(255,255,255,0.1)}.icon.svelte-amzvub{font-size:1.5rem;text-transform:uppercase}.label.svelte-amzvub{font-size:0.8rem;opacity:0.8}",
  map: '{"version":3,"file":"GovernanceSigils.svelte","sources":["GovernanceSigils.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { governanceStore } from \\"../state/stores\\";\\nimport { animateSigil } from \\"../animation/sigilGlow\\";\\nconst sigils = {\\n  coach: { color: \\"gold\\", icon: \\"compass\\" },\\n  registrar: { color: \\"blue\\", icon: \\"tree\\" },\\n  probation: { color: \\"red\\", icon: \\"shield\\" },\\n  oracle: { color: \\"white\\", icon: \\"eye\\" },\\n  cartographer: { color: \\"green\\", icon: \\"grid\\" }\\n};\\n<\/script>\\r\\n\\r\\n<div class=\\"sigil-panel\\">\\r\\n  {#each Object.entries(sigils) as [key, sigil]}\\r\\n    {@const active = $governanceStore.some(e => e.authority === key)}\\r\\n    <div class=\\"sigil\\"\\r\\n      style=\\"--color: {sigil.color};\\"\\r\\n      class:active={active}\\r\\n      use:animateSigil={{ active }}\\r\\n    >\\r\\n      <span class=\\"icon\\">{sigil.icon}</span>\\r\\n      <span class=\\"label\\">{key}</span>\\r\\n    </div>\\r\\n  {/each}\\r\\n</div>\\r\\n\\r\\n<style>\\r\\n  .sigil-panel {\\r\\n    display: flex;\\r\\n    gap: 1rem;\\r\\n    padding: 1rem;\\r\\n    background: rgba(0,0,0,0.2);\\r\\n    border-radius: 8px;\\r\\n  }\\r\\n  .sigil {\\r\\n    display: flex;\\r\\n    flex-direction: column;\\r\\n    align-items: center;\\r\\n    gap: 0.5rem;\\r\\n    padding: 1rem;\\r\\n    border-radius: 8px;\\r\\n    background: rgba(255,255,255,0.05);\\r\\n    transition: background 0.2s;\\r\\n  }\\r\\n  .sigil.active {\\r\\n    background: rgba(255,255,255,0.1);\\r\\n  }\\r\\n  .icon {\\r\\n    font-size: 1.5rem;\\r\\n    text-transform: uppercase;\\r\\n  }\\r\\n  .label {\\r\\n    font-size: 0.8rem;\\r\\n    opacity: 0.8;\\r\\n  }\\r\\n</style>\\r\\n"],"names":[],"mappings":"AA0BE,0BAAa,CACX,OAAO,CAAE,IAAI,CACb,GAAG,CAAE,IAAI,CACT,OAAO,CAAE,IAAI,CACb,UAAU,CAAE,KAAK,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,GAAG,CAAC,CAC3B,aAAa,CAAE,GACjB,CACA,oBAAO,CACL,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MAAM,CACtB,WAAW,CAAE,MAAM,CACnB,GAAG,CAAE,MAAM,CACX,OAAO,CAAE,IAAI,CACb,aAAa,CAAE,GAAG,CAClB,UAAU,CAAE,KAAK,GAAG,CAAC,GAAG,CAAC,GAAG,CAAC,IAAI,CAAC,CAClC,UAAU,CAAE,UAAU,CAAC,IACzB,CACA,MAAM,qBAAQ,CACZ,UAAU,CAAE,KAAK,GAAG,CAAC,GAAG,CAAC,GAAG,CAAC,GAAG,CAClC,CACA,mBAAM,CACJ,SAAS,CAAE,MAAM,CACjB,cAAc,CAAE,SAClB,CACA,oBAAO,CACL,SAAS,CAAE,MAAM,CACjB,OAAO,CAAE,GACX"}'
};
const GovernanceSigils = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $governanceStore, $$unsubscribe_governanceStore;
  $$unsubscribe_governanceStore = subscribe(governanceStore, (value) => $governanceStore = value);
  const sigils = {
    coach: { color: "gold", icon: "compass" },
    registrar: { color: "blue", icon: "tree" },
    probation: { color: "red", icon: "shield" },
    oracle: { color: "white", icon: "eye" },
    cartographer: { color: "green", icon: "grid" }
  };
  $$result.css.add(css);
  $$unsubscribe_governanceStore();
  return `<div class="sigil-panel svelte-amzvub">${each(Object.entries(sigils), ([key, sigil]) => {
    let active = $governanceStore.some((e) => e.authority === key);
    return ` <div class="${["sigil svelte-amzvub", active ? "active" : ""].join(" ").trim()}" style="${"--color: " + escape(sigil.color, true) + ";"}"><span class="icon svelte-amzvub">${escape(sigil.icon)}</span> <span class="label svelte-amzvub">${escape(key)}</span> </div>`;
  })} </div>`;
});
export {
  GovernanceSigils as G
};
