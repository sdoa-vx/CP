'use strict';
const assert = require('assert');
const { Engine, CapFlags, SdoaError } = require('./index.js');

const MODEL = { domains: [
  { id: 'Num', modules: [{ id: 'Math', capabilities: [{name:'add'},{name:'multiply'}], dependencies: [], invariants: [] }] },
  { id: 'Str', modules: [{ id: 'String', capabilities: [{name:'format'}], dependencies: [], invariants: [] }] },
  { id: 'Ext', modules: [{ id: 'Js', capabilities: [{name:'score'},{name:'boom'}], dependencies: [], invariants: [] }] },
]};
const fresh = () => { const e = new Engine({ threadCount: 2 }); e.installStdlib(); e.loadModel(MODEL); return e; };

function tBuiltin() {
  const e = fresh();
  e.loadPipelines({ pipelines: [{ id:'P', steps:[{id:'S',module_id:'Math',capability:'add',input:{a:2,b:5}}], edges:[] }] });
  const r = e.run('P');
  assert.strictEqual(r.outputs.S.result, 7);
  e.close(); console.log('[PASS] builtin capability via Node');
}
function tForeignChain() {
  const e = fresh();
  e.registerCapability('Js', 'score', (i) => ({ result: i.x * 3 + 1 }), CapFlags.PURE);
  e.loadPipelines({ pipelines: [{ id:'C', steps:[
    { id:'A', module_id:'Math', capability:'add', input:{a:10,b:4} },
    { id:'B', module_id:'Js', capability:'score', input:{x:'@A.result'} },
    { id:'D', module_id:'String', capability:'format', input:{template:'score={v}', args:{v:'@B.result'}} },
  ], edges:[{source_step:'A',target_step:'B'},{source_step:'B',target_step:'D'}] }] });
  const r = e.run('C');
  assert.ok(r.success, JSON.stringify(r));
  assert.strictEqual(r.outputs.A.result, 14);
  assert.strictEqual(r.outputs.B.result, 43);
  assert.strictEqual(r.outputs.D.result, 'score=43');
  e.close(); console.log('[PASS] foreign JS capability in a mixed chain');
}
function tErrorIsolation() {
  const e = fresh();
  e.registerCapability('Js', 'boom', () => { throw new Error('kaboom from node'); }, CapFlags.PURE);
  e.loadPipelines({ pipelines: [{ id:'E', steps:[{id:'S',module_id:'Js',capability:'boom',input:{}}], edges:[] }] });
  const r = e.run('E');
  assert.strictEqual(r.success, false);
  assert.ok(String(r.error).includes('kaboom from node'), r.error);
  e.close(); console.log('[PASS] foreign exception isolated -> structured STEP_ERROR');
}
function tDeterminism() {
  const e = fresh();
  e.registerCapability('Js', 'score', (i) => ({ result: i.vals.reduce((a,b)=>a+b,0) }), CapFlags.PURE);
  e.loadPipelines({ pipelines: [{ id:'D', steps:[{id:'S',module_id:'Js',capability:'score',input:{vals:[1,2,3,4]}}], edges:[] }] });
  const first = JSON.stringify(e.run('D'));
  for (let i=0;i<100;i++) assert.strictEqual(JSON.stringify(e.run('D')), first);
  e.close(); console.log('[PASS] foreign capability deterministic over 100 runs');
}
function tManifestCompliance() {
  const e = fresh();
  e.registerCapability('Js', 'score', () => ({result:0}), CapFlags.NONDETERMINISTIC);
  const man = e.capabilities();
  const by = Object.fromEntries(man.map(c => [c.module + '::' + c.capability, c]));
  assert.strictEqual(by['Math::add'].origin, 'builtin');
  assert.strictEqual(by['Js::score'].origin, 'foreign');
  assert.strictEqual(by['Js::score'].flags.nondeterministic, true);
  assert.throws(() => e.registerCapability('Math', 'add', (i)=>i, CapFlags.PURE), SdoaError);
  assert.throws(() => e.registerCapability('Js', 'x', (i)=>i, CapFlags.PURE | CapFlags.SIDE_EFFECTING), SdoaError);
  e.close(); console.log(`[PASS] manifest (${man.length} caps) + compliance gate`);
}

console.log(`=== SDOA Node binding tests (api v${new Engine({}).apiVersion()}) ===`);
tBuiltin(); tForeignChain(); tErrorIsolation(); tDeterminism(); tManifestCompliance();
console.log('\nAll Node binding tests passed.');
