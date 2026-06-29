// ============================================================================
// SDOA Dashboard static assets (5.B.6). Zero-dependency: HTML + JS + CSS only.
// The CLI emits these verbatim plus data.js (window.SDOA_EMBED) so the bundle
// works offline from file:// without a server, bundler, framework, or CDN.
// ============================================================================
#pragma once
#include <string>

namespace sdoa_dash {

inline const char* INDEX_HTML = R"HTML(<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SDOA Dashboard</title>
  <link rel="stylesheet" href="dashboard.css">
</head>
<body>
  <div id="sidebar">
    <h1>SDOA</h1>
    <ul>
      <li data-panel="capabilities" class="active">Capabilities</li>
      <li data-panel="pipelines">Pipeline Visualizer</li>
      <li data-panel="modules">Modules</li>
      <li data-panel="traces">Traces</li>
    </ul>
  </div>
  <div id="content"></div>
  <script src="data.js"></script>
  <script src="dashboard.js"></script>
</body>
</html>
)HTML";

inline const char* DASHBOARD_CSS = R"CSS(* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; color: #1c2330; background: #f5f6f8; }
#sidebar { position: fixed; top: 0; left: 0; width: 200px; height: 100vh; background: #1c2330; color: #cdd6e4; padding: 16px; }
#sidebar h1 { font-size: 20px; margin: 0 0 16px; color: #fff; letter-spacing: 2px; }
#sidebar ul { list-style: none; padding: 0; margin: 0; }
#sidebar li { padding: 8px 10px; border-radius: 6px; cursor: pointer; }
#sidebar li:hover { background: #2a3550; }
#sidebar li.active { background: #2f6df6; color: #fff; }
#content { margin-left: 220px; padding: 24px; }
h2 { margin-top: 0; }
.muted { color: #8a93a3; }
.err { color: #c0392b; }
.split { display: flex; gap: 20px; }
.tree { width: 240px; flex: none; background: #fff; border: 1px solid #e2e6ee; border-radius: 8px; padding: 10px; max-height: 80vh; overflow: auto; }
.tree ul { list-style: none; padding-left: 12px; margin: 4px 0; }
.tree li { cursor: pointer; padding: 2px 4px; border-radius: 4px; }
.tree li:hover { background: #eef2fb; }
.tree li.mod { font-weight: 600; cursor: default; }
.detail { flex: 1; background: #fff; border: 1px solid #e2e6ee; border-radius: 8px; padding: 16px; }
table.schema { border-collapse: collapse; width: 100%; margin: 6px 0 14px; }
table.schema th, table.schema td { border: 1px solid #e2e6ee; padding: 5px 8px; text-align: left; font-size: 13px; }
table.schema th { background: #f0f3f9; }
tr.err td { background: #fdecea; }
pre, .code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; background: #0e1320; color: #cfe3ff; padding: 10px; border-radius: 6px; overflow: auto; }
.meta { color: #5a6477; margin-bottom: 12px; font-size: 13px; }
.card { background: #fff; border: 1px solid #e2e6ee; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
.tabs { margin-bottom: 12px; }
.tabs button { padding: 6px 14px; border: 1px solid #c7cfdd; background: #fff; cursor: pointer; border-radius: 6px; margin-right: 6px; }
.tabs button.on { background: #2f6df6; color: #fff; border-color: #2f6df6; }
)CSS";

inline const char* DASHBOARD_JS = R"JS((function(){
  var D = window.SDOA_EMBED || { manifest: { capabilities: [] }, modules: { installed: [], registry: [] }, traces: { list: [], data: {} } };
  function $(s){ return document.querySelector(s); }
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
  function el(h){ var t=document.createElement('template'); t.innerHTML=h.trim(); return t.content.firstChild; }
  function groupBy(a,f){ var m={}; (a||[]).forEach(function(x){ (m[f(x)]=m[f(x)]||[]).push(x); }); return m; }

  function schemaTable(schema){
    if(!schema || !schema.properties || !Object.keys(schema.properties).length) return '<div class="muted">no declared fields</div>';
    var req = {}; (schema.required||[]).forEach(function(k){ req[k]=1; });
    var keys = Object.keys(schema.properties).sort();
    var rows = keys.map(function(k){ var p=schema.properties[k]||{}; return '<tr><td>'+esc(k)+'</td><td>'+esc(p.type||'any')+'</td><td>'+(req[k]?'yes':'')+'</td></tr>'; }).join('');
    return '<table class="schema"><thead><tr><th>field</th><th>type</th><th>required</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }
  function examples(c){
    var base = (c.module+'_'+c.capability).replace(/[^A-Za-z0-9]/g,'_');
    var fn = base.toLowerCase();
    var props = (c.input_schema && c.input_schema.properties) ? Object.keys(c.input_schema.properties).sort() : [];
    var tsArgs = props.map(function(p){ return p+': /*'+((c.input_schema.properties[p]||{}).type||'any')+'*/'; }).join(', ');
    return '<pre class="code">// TypeScript\n'+fn+'({ '+tsArgs+' })\n\n# Python\n'+fn+'('+base+'_Input('+props.join('=..., ')+(props.length?'=...':'')+'))\n\n// Rust\n'+fn+'('+base+'_Input { '+props.map(function(p){return p+': ...';}).join(', ')+' })</pre>';
  }

  function renderCapabilities(){
    var caps = (D.manifest && D.manifest.capabilities) || [];
    var groups = groupBy(caps, function(c){ return c.module; });
    var mods = Object.keys(groups).sort();
    var tree = mods.map(function(m){
      var items = groups[m].slice().sort(function(a,b){ return a.capability<b.capability?-1:1; })
        .map(function(c){ return '<li data-key="'+esc(m)+'::'+esc(c.capability)+'">'+esc(c.capability)+'</li>'; }).join('');
      return '<li class="mod">'+esc(m)+'<ul>'+items+'</ul></li>';
    }).join('');
    var c = $('#content'); c.innerHTML='';
    c.appendChild(el('<div class="split"><div class="tree"><ul>'+tree+'</ul></div><div class="detail" id="capDetail"><div class="muted">select a capability ('+caps.length+' total)</div></div></div>'));
    var index = {}; caps.forEach(function(x){ index[x.module+'::'+x.capability]=x; });
    c.querySelectorAll('.tree li[data-key]').forEach(function(li){ li.onclick=function(){
      var cap=index[li.dataset.key], f=cap.flags||{};
      var fl=Object.keys(f).filter(function(k){return f[k];}).join(', ')||'(none)';
      $('#capDetail').innerHTML='<h2>'+esc(cap.module)+'::'+esc(cap.capability)+'</h2>'+
        '<div class="meta">origin: '+esc(cap.origin||'?')+' &nbsp;|&nbsp; language: '+esc(cap.language||'?')+' &nbsp;|&nbsp; flags: '+esc(fl)+'</div>'+
        '<h3>Input</h3>'+schemaTable(cap.input_schema)+'<h3>Output</h3>'+schemaTable(cap.output_schema)+
        '<h3>Examples</h3>'+examples(cap);
    }; });
  }

  function renderModules(){
    var m = D.modules || { installed:[], registry:[] };
    function tab(list){
      if(!list || !list.length) return '<div class="muted">none</div>';
      return list.slice().sort(function(a,b){return a.id<b.id?-1:1;}).map(function(x){
        return '<div class="card"><b>'+esc(x.id)+'</b> <span class="muted">v'+esc(x.version||'?')+'</span>'+
          '<div>capabilities: '+esc((x.capabilities||[]).join(', '))+'</div>'+
          (x.description?'<div class="muted">'+esc(x.description)+'</div>':'')+
          '<div class="muted">sandbox: '+esc(JSON.stringify(x.sandbox||{}))+'</div></div>';
      }).join('');
    }
    var c=$('#content'); c.innerHTML='';
    c.appendChild(el('<div><div class="tabs"><button data-t="inst" class="on">Installed</button><button data-t="reg">Registry</button></div>'+
      '<div id="tabInst">'+tab(m.installed)+'</div><div id="tabReg" style="display:none">'+tab(m.registry)+'</div></div>'));
    c.querySelectorAll('.tabs button').forEach(function(b){ b.onclick=function(){
      c.querySelectorAll('.tabs button').forEach(function(x){x.classList.remove('on');}); b.classList.add('on');
      $('#tabInst').style.display = b.dataset.t==='inst'?'':'none';
      $('#tabReg').style.display = b.dataset.t==='reg'?'':'none';
    }; });
  }

  function renderTraces(){
    var list = (D.traces && D.traces.list) || [];
    var data = (D.traces && D.traces.data) || {};
    var tree = list.length ? list.map(function(t){ return '<li data-t="'+esc(t)+'">'+esc(t)+'</li>'; }).join('') : '<li class="muted">no traces</li>';
    var c=$('#content'); c.innerHTML='';
    c.appendChild(el('<div class="split"><div class="tree"><ul>'+tree+'</ul></div><div class="detail" id="trDetail"><div class="muted">select a trace</div></div></div>'));
    c.querySelectorAll('.tree li[data-t]').forEach(function(li){ li.onclick=function(){
      var tr=data[li.dataset.t]||[];
      var rows=tr.map(function(e){
        var cls = e.event_type==='STEP_ERROR' ? 'err' : '';
        return '<tr class="'+cls+'"><td>'+esc(e.event_type)+'</td><td>'+esc(e.step_id||'')+'</td><td><pre>'+esc(JSON.stringify(e.context))+'</pre></td></tr>';
      }).join('');
      $('#trDetail').innerHTML='<h2>'+esc(li.dataset.t)+'</h2><table class="schema"><thead><tr><th>event</th><th>step</th><th>context</th></tr></thead><tbody>'+rows+'</tbody></table>';
    }; });
  }

  function renderPipelines(){
    var caps={}; ((D.manifest&&D.manifest.capabilities)||[]).forEach(function(x){ caps[x.module+'::'+x.capability]=x; });
    var c=$('#content'); c.innerHTML='';
    c.appendChild(el('<div><p class="muted">Select a pipeline JSON file (a {"pipelines":[...]} doc or a single pipeline).</p><input type="file" id="pfile" accept=".json"><div id="pgraph"></div><div id="pdetail"></div></div>'));
    $('#pfile').onchange=function(ev){
      var f=ev.target.files[0]; if(!f) return; var r=new FileReader();
      r.onload=function(){ try{ var doc=JSON.parse(r.result); var p=doc.pipelines?doc.pipelines[0]:doc; drawPipeline(p,caps); }catch(e){ $('#pgraph').innerHTML='<div class="err">parse error: '+esc(e.message)+'</div>'; } };
      r.readAsText(f);
    };
  }
  function drawPipeline(p,caps){
    var steps=(p.steps||[]).slice().sort(function(a,b){return a.id<b.id?-1:1;});
    var strict=!!p.strict, allowNd=!!p.allow_nondeterminism, W=200,H=46,GAP=34, svg='', byId={};
    steps.forEach(function(s,i){
      byId[s.id]=s;
      var x=20,y=20+i*(H+GAP), key=s.module_id+'::'+s.capability, cap=caps[key];
      var ndcap=cap&&cap.flags&&(cap.flags.nondeterministic||cap.flags.network);
      var bad=!cap, nd=ndcap&&!(allowNd&&!strict);
      var color=bad?'#c0392b':(nd?'#c87f0a':'#2f6df6');
      svg+='<g class="node" data-id="'+esc(s.id)+'" style="cursor:pointer"><rect x="'+x+'" y="'+y+'" width="'+W+'" height="'+H+'" rx="6" fill="'+color+'"/>'+
           '<text x="'+(x+10)+'" y="'+(y+28)+'" fill="#fff" font-size="13">'+esc(s.id)+': '+esc(s.capability)+'</text></g>';
      if(i>0) svg+='<line x1="'+(x+W/2)+'" y1="'+(y-GAP)+'" x2="'+(x+W/2)+'" y2="'+y+'" stroke="#888" marker-end="url(#arr)"/>';
    });
    var height=30+steps.length*(H+GAP);
    $('#pgraph').innerHTML='<svg width="460" height="'+height+'" xmlns="http://www.w3.org/2000/svg"><defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#888"/></marker></defs>'+svg+'</svg>'+
      '<p class="muted">blue = ok, orange = nondeterministic/network not permitted (set allow_nondeterminism), red = unknown capability</p>';
    document.querySelectorAll('#pgraph .node').forEach(function(n){ n.onclick=function(){
      var s=byId[n.dataset.id], cap=caps[s.module_id+'::'+s.capability];
      $('#pdetail').innerHTML='<h3>'+esc(s.id)+' — '+esc(s.module_id)+'::'+esc(s.capability)+'</h3>'+
        (cap ? '<h4>Input</h4>'+schemaTable(cap.input_schema)+'<h4>Output</h4>'+schemaTable(cap.output_schema)
             : '<div class="err">unknown capability "'+esc(s.module_id+'::'+s.capability)+'"</div>');
    }; });
  }

  var PANELS={ capabilities:renderCapabilities, pipelines:renderPipelines, modules:renderModules, traces:renderTraces };
  function showPanel(name){
    document.querySelectorAll('#sidebar li').forEach(function(li){ li.classList.toggle('active', li.dataset.panel===name); });
    (PANELS[name]||renderCapabilities)();
  }
  document.querySelectorAll('#sidebar li').forEach(function(li){ li.onclick=function(){ showPanel(li.dataset.panel); }; });
  showPanel('capabilities');
})();
)JS";

} // namespace sdoa_dash
