import { w as writable } from "./index.js";
const proposalStore = writable({});
const lineageStore = writable({});
const governanceStore = writable([]);
const routingStore = writable([]);
const meshStore = writable({});
const pulseStore = writable({});
const driftStore = writable({});
const scanStore = writable({
  index: 0,
  total: 0,
  file: null,
  previousFile: null,
  nextFile: null,
  percent: 0,
  active: false,
  source: "none"
});
export {
  proposalStore as a,
  driftStore as d,
  governanceStore as g,
  lineageStore as l,
  meshStore as m,
  pulseStore as p,
  routingStore as r,
  scanStore as s
};
