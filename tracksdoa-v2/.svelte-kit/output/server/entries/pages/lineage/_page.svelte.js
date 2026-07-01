import { c as create_ssr_component, s as subscribe, d as add_attribute } from "../../../chunks/ssr.js";
import { l as lineageStore } from "../../../chunks/stores2.js";
import "d3";
const css = {
  code: ".lineage-page.svelte-15byj33{height:100%;display:flex;flex-direction:column}.lineage-container.svelte-15byj33{flex:1;width:100%;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}",
  map: '{"version":3,"file":"+page.svelte","sources":["+page.svelte"],"sourcesContent":["<script lang=\\"ts\\">import { lineageStore } from \\"$lib/state/stores\\";\\nimport { onMount } from \\"svelte\\";\\nimport { renderLineageTree } from \\"$lib/lineage/renderTree\\";\\nlet container;\\n$: {\\n  if (container && Object.keys($lineageStore).length > 0) {\\n    const lineageData = Object.values($lineageStore)[0]?.lineage_tree || { name: \\"Root\\", children: [] };\\n    renderLineageTree(container, lineageData);\\n  }\\n}\\n<\/script>\\r\\n\\r\\n<div class=\\"lineage-page\\">\\r\\n  <h1>Lineage Tree (Registrar)</h1>\\r\\n  <div bind:this={container} class=\\"lineage-container\\"></div>\\r\\n</div>\\r\\n\\r\\n<style>\\r\\n  .lineage-page {\\r\\n    height: 100%;\\r\\n    display: flex;\\r\\n    flex-direction: column;\\r\\n  }\\r\\n  .lineage-container {\\r\\n    flex: 1;\\r\\n    width: 100%;\\r\\n    background: #161b22;\\r\\n    border: 1px solid #30363d;\\r\\n    border-radius: 8px;\\r\\n    overflow: hidden;\\r\\n  }\\r\\n</style>\\r\\n"],"names":[],"mappings":"AAkBE,4BAAc,CACZ,MAAM,CAAE,IAAI,CACZ,OAAO,CAAE,IAAI,CACb,cAAc,CAAE,MAClB,CACA,iCAAmB,CACjB,IAAI,CAAE,CAAC,CACP,KAAK,CAAE,IAAI,CACX,UAAU,CAAE,OAAO,CACnB,MAAM,CAAE,GAAG,CAAC,KAAK,CAAC,OAAO,CACzB,aAAa,CAAE,GAAG,CAClB,QAAQ,CAAE,MACZ"}'
};
const Page = create_ssr_component(($$result, $$props, $$bindings, slots) => {
  let $$unsubscribe_lineageStore;
  $$unsubscribe_lineageStore = subscribe(lineageStore, (value) => value);
  let container;
  $$result.css.add(css);
  $$unsubscribe_lineageStore();
  return `<div class="lineage-page svelte-15byj33"><h1 data-svelte-h="svelte-qd7pu1">Lineage Tree (Registrar)</h1> <div class="lineage-container svelte-15byj33"${add_attribute("this", container, 0)}></div> </div>`;
});
export {
  Page as default
};
