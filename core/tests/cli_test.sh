#!/usr/bin/env bash
# End-to-end CLI test. Usage: SDOA=./sdoa CORE=<repo> bash cli_test.sh
set -u
SDOA="${SDOA:-./sdoa}"; CORE="${CORE:-..}"; W=$(mktemp -d); PASS=0; FAILED=0
chk(){ if [ "$1" = "$2" ]; then PASS=$((PASS+1)); else echo "FAIL: $3 (got '$1' want '$2')"; FAILED=$((FAILED+1)); fi; }
$SDOA new module demo --dir $W/modules >/dev/null; chk $? 0 "new module"
$SDOA validate module $W/modules/demo >/dev/null; chk $? 0 "validate empty module"
$SDOA new capability demo greet --dir $W/modules >/dev/null; chk $? 0 "new capability"
mkdir -p $W/bad/capabilities && echo '{"id":"bad"}' > $W/bad/module.json
$SDOA validate module $W/bad >/dev/null 2>&1; chk $? 1 "validate catches missing fields"
$SDOA manifest --modules $CORE/modules >/dev/null 2>&1; chk $? 0 "manifest"
printf '{"pipelines":[{"id":"P","steps":[{"id":"S","module_id":"string-tools","capability":"slugify","input":{"text":"Hi"}}],"edges":[]}]}' > $W/good.json
$SDOA validate pipeline $W/good.json --modules $CORE/modules >/dev/null 2>&1; chk $? 0 "validate good pipeline"
printf '{"pipelines":[{"id":"P","steps":[{"id":"A","module_id":"string-tools","capability":"slugify","input":{"text":42}}],"edges":[]}]}' > $W/bad.json
$SDOA validate pipeline $W/bad.json --modules $CORE/modules >/dev/null 2>&1; chk $? 1 "validate bad pipeline"
$SDOA codegen ts $W/gen --modules $CORE/modules >/dev/null 2>&1; chk $? 0 "codegen ts"
grep -q "interface Math_add_Input" $W/gen/sdoa-capabilities.ts && grep -q "class Pipeline" $W/gen/sdoa-capabilities.ts; chk $? 0 "ts has typed iface + builder"
$SDOA codegen python $W/gen --modules $CORE/modules >/dev/null 2>&1; chk $? 0 "codegen python"
python3 -c "import ast;ast.parse(open('$W/gen/sdoa_capabilities.py').read())" 2>/dev/null; chk $? 0 "python codegen parses"
$SDOA codegen rust $W/gen --modules $CORE/modules >/dev/null 2>&1; chk $? 0 "codegen rust"
grep -q "pub struct Math_add_Input" $W/gen/sdoa_capabilities.rs; chk $? 0 "rust has typed struct"
# --- module packaging (5.B.5) ---
ST=$CORE/modules/string-tools
$SDOA module pack $ST -o $W/st.sdoa >/dev/null 2>&1; chk $? 0 "module pack"
python3 -c "import json;p=json.load(open('$W/st.sdoa'));assert p['sdoa_version']==1 and p['module']['id']=='string-tools' and p['digest']['algorithm']=='sha256'" 2>/dev/null; chk $? 0 "canonical .sdoa structure"
mkdir -p $W/engine; $SDOA module install $W/st.sdoa --engine $W/engine >/dev/null 2>&1; chk $? 0 "module install"
ls $W/engine/modules/string-tools/*/lib/libstring_tools.so >/dev/null 2>&1; chk $? 0 "install unpacked .so (per-version)"
python3 -c "import json;p=json.load(open('$W/st.sdoa'));k=[x for x in p['files'] if isinstance(p['files'][x],dict)][0];d=p['files'][k]['data'];p['files'][k]['data']=('A' if d[0]!='A' else 'B')+d[1:];json.dump(p,open('$W/t.sdoa','w'))"
$SDOA module install $W/t.sdoa --engine $W/e2 >/dev/null 2>&1; chk $? 1 "tamper detected via digest"
$SDOA module publish $ST --registry $W/reg >/dev/null 2>&1; chk $? 0 "module publish"
$SDOA module search slug --registry $W/reg | grep -q "string-tools@1.0.0"; chk $? 0 "module search by capability"
mkdir -p $W/e3; $SDOA module install string-tools@1.0.0 --engine $W/e3 --registry $W/reg >/dev/null 2>&1; chk $? 0 "install id@version"

# --- dashboard (5.B.6) ---
$SDOA dashboard $W/dash --engine $CORE >/dev/null 2>&1; chk $? 0 "dashboard generate"
for fl in index.html dashboard.js dashboard.css manifest.json modules.json data.js traces/index.json; do [ -f $W/dash/$fl ] || echo "missing $fl"; done
[ -f $W/dash/index.html ] && [ -f $W/dash/dashboard.js ] && [ -f $W/dash/manifest.json ] && [ -f $W/dash/data.js ]; chk $? 0 "dashboard bundle files"
python3 -c "import json;m=json.load(open('$W/dash/manifest.json'));assert len(m['capabilities'])>=30" 2>/dev/null; chk $? 0 "dashboard manifest typed"
grep -q "window.SDOA_EMBED" $W/dash/data.js && grep -q "renderCapabilities" $W/dash/dashboard.js; chk $? 0 "dashboard data + logic"

# --- auto-docs (5.B.7.1) ---
$SDOA docs $W/docs --modules $CORE/modules >/dev/null 2>&1; chk $? 0 "docs generate"
[ -f $W/docs/index.md ] && [ -f $W/docs/capabilities/Math.add.md ] && [ -f $W/docs/schemas/Math.add.json ]; chk $? 0 "docs files present"
grep -q "Math::add" $W/docs/capabilities/Math.add.md && grep -q "math_add" $W/docs/capabilities/Math.add.md; chk $? 0 "docs has metadata + examples"
# math-tools example module loads via manifest
$SDOA manifest --modules $CORE/modules | grep -q "math-tools" ; chk $? 0 "math-tools example module discoverable"

# --- sandbox enforcement (6.1) ---
MT=$CORE/modules/math-tools
mkdir -p $W/mods/math-tools/lib $W/mods/math-tools/capabilities
cp $MT/lib/*.so $W/mods/math-tools/lib/ 2>/dev/null; cp $MT/capabilities/*.json $W/mods/math-tools/capabilities/
python3 -c "import json;m=json.load(open('$MT/module.json'));m['sandbox']={'fs':'none','network':True,'clock':False,'random':False,'env':False};json.dump(m,open('$W/mods/math-tools/module.json','w'))"
$SDOA manifest --modules $W/mods | python3 -c "import json,sys;c=[x for x in json.load(sys.stdin)['capabilities'] if x['module']=='math-tools'][0];assert c['flags'].get('network')" 2>/dev/null; chk $? 0 "loader derives network flag from sandbox"
printf '{"pipelines":[{"id":"P","steps":[{"id":"S","module_id":"math-tools","capability":"factorial","input":{"n":5}}],"edges":[]}]}' > $W/nd.json
$SDOA validate pipeline $W/nd.json --modules $W/mods >/dev/null 2>&1; chk $? 1 "validator rejects nondeterministic without allow_nondeterminism"
printf '{"pipelines":[{"id":"P","allow_nondeterminism":true,"steps":[{"id":"S","module_id":"math-tools","capability":"factorial","input":{"n":5}}],"edges":[]}]}' > $W/nd2.json
$SDOA validate pipeline $W/nd2.json --modules $W/mods >/dev/null 2>&1; chk $? 0 "validator allows with allow_nondeterminism"
$SDOA module pack $W/mods/math-tools -o $W/net.sdoa >/dev/null 2>&1
$SDOA module install $W/net.sdoa --engine $W/neteng >/dev/null 2>&1; chk $? 1 "install rejects network module by default"
$SDOA module install $W/net.sdoa --engine $W/neteng2 --allow-network >/dev/null 2>&1; chk $? 0 "install network module with --allow-network"

# --- module signing (6.4) ---
MT2=$CORE/modules/math-tools
mkdir -p $W/sm/math-tools/lib $W/sm/math-tools/capabilities
cp $MT2/lib/*.so $W/sm/math-tools/lib/ 2>/dev/null; cp $MT2/capabilities/*.json $W/sm/math-tools/capabilities/
python3 -c "import json;m=json.load(open('$MT2/module.json'));m['sandbox']={'fs':'none','network':True,'clock':False,'random':False,'env':False};json.dump(m,open('$W/sm/math-tools/module.json','w'))"
$SDOA key generate org.test -o $W/k.key >/dev/null 2>&1; chk $? 0 "key generate (ed25519)"
$SDOA module pack $W/sm/math-tools -o $W/sm.sdoa >/dev/null 2>&1; chk $? 0 "pack network module"
$SDOA module install $W/sm.sdoa --engine $W/se0 >/dev/null 2>&1; chk $? 1 "unsigned elevated refused"
$SDOA module sign $W/sm.sdoa --key $W/k.key -o $W/sm.signed.sdoa >/dev/null 2>&1; chk $? 0 "module sign"
$SDOA key trust $W/k.key --trust $W/tr >/dev/null 2>&1; chk $? 0 "key trust"
$SDOA module install $W/sm.signed.sdoa --engine $W/se1 --trust $W/tr >/dev/null 2>&1; chk $? 0 "signed+trusted elevated install honored"
$SDOA module install $W/sm.signed.sdoa --engine $W/se2 --trust $W/none 2>&1 | grep -q SIGNATURE_UNTRUSTED_KEY; chk $? 0 "untrusted key rejected"
python3 -c "import json;p=json.load(open('$W/sm.signed.sdoa'));v=p['signature']['value'];p['signature']['value']=('A' if v[0]!='A' else 'B')+v[1:];json.dump(p,open('$W/smt.sdoa','w'))"
$SDOA module install $W/smt.sdoa --engine $W/se3 --trust $W/tr 2>&1 | grep -q SIGNATURE_INVALID; chk $? 0 "tampered signature rejected"

# --- module lifecycle (6.2) ---
ST3=$CORE/modules/string-tools
$SDOA module pack $ST3 -o $W/lc.sdoa >/dev/null 2>&1
LE=$W/lceng
$SDOA module install $W/lc.sdoa --engine $LE >/dev/null 2>&1; chk $? 0 "lifecycle install"
$SDOA module list --engine $LE | grep -A3 string-tools | grep -q active; chk $? 0 "list shows active"
$SDOA manifest --modules $LE/modules | grep -q slugify; chk $? 0 "active module caps in manifest"
$SDOA module disable string-tools --engine $LE >/dev/null 2>&1; chk $? 0 "disable"
$SDOA manifest --modules $LE/modules | grep -q slugify; chk $? 1 "disabled module caps hidden from manifest"
$SDOA module list --engine $LE | grep -A3 string-tools | grep -q disabled; chk $? 0 "list shows disabled"
ls $LE/modules/string-tools/*/module.json >/dev/null 2>&1; chk $? 0 "disabled module stays on disk"
$SDOA module enable string-tools --engine $LE >/dev/null 2>&1
$SDOA manifest --modules $LE/modules | grep -q slugify; chk $? 0 "re-enabled module caps return"
$SDOA module pin string-tools --engine $LE >/dev/null 2>&1
python3 -c "import json;v=json.load(open('$LE/modules/index.json'))['modules']['string-tools']['versions'];assert any(x.get('pinned') for x in v.values())" 2>/dev/null; chk $? 0 "pin recorded"
$SDOA module unpin string-tools --engine $LE >/dev/null 2>&1
$SDOA module remove string-tools --engine $LE >/dev/null 2>&1; chk $? 0 "remove"
[ -d $LE/modules/string-tools ]; chk $? 1 "removed dir gone"

# --- module update (6.2, honors pinned) ---
ST4=$CORE/modules/string-tools
mkdir -p $W/up/lib $W/up/capabilities; cp $ST4/lib/*.so $W/up/lib/; cp $ST4/capabilities/*.json $W/up/capabilities/; cp $ST4/module.json $W/up/module.json
UREG=$W/ureg; UE=$W/ueng
$SDOA module publish $W/up --registry $UREG >/dev/null 2>&1
$SDOA module install string-tools@1.0.0 --engine $UE --registry $UREG >/dev/null 2>&1; chk $? 0 "update: install v1.0.0"
python3 -c "import json;m=json.load(open('$W/up/module.json'));m['version']='1.1.0';json.dump(m,open('$W/up/module.json','w'))"
$SDOA module publish $W/up --registry $UREG >/dev/null 2>&1
$SDOA module update string-tools --engine $UE --registry $UREG | grep -q "1.0.0 -> 1.1.0"; chk $? 0 "update upgrades floating module"
$SDOA module pin string-tools --engine $UE >/dev/null 2>&1
python3 -c "import json;m=json.load(open('$W/up/module.json'));m['version']='1.2.0';json.dump(m,open('$W/up/module.json','w'))"
$SDOA module publish $W/up --registry $UREG >/dev/null 2>&1
$SDOA module update string-tools --engine $UE --registry $UREG | grep -q "pinned, skipping"; chk $? 0 "update skips pinned"

# --- multi-version coexistence (6.3) ---
MT3=$CORE/modules/math-tools
mkv(){ rm -rf $W/mvsrc; mkdir -p $W/mvsrc/lib $W/mvsrc/capabilities; cp $MT3/lib/*.so $W/mvsrc/lib/; cp $MT3/capabilities/*.json $W/mvsrc/capabilities/; python3 -c "import json;m=json.load(open('$MT3/module.json'));m['version']='$1';json.dump(m,open('$W/mvsrc/module.json','w'))"; }
MV=$W/mveng
mkv 1.0.0; $SDOA module pack $W/mvsrc -o $W/mv1.sdoa >/dev/null 2>&1; $SDOA module install $W/mv1.sdoa --engine $MV >/dev/null 2>&1; chk $? 0 "mv install 1.0.0"
mkv 1.1.0; $SDOA module pack $W/mvsrc -o $W/mv2.sdoa >/dev/null 2>&1; $SDOA module install $W/mv2.sdoa --engine $MV >/dev/null 2>&1; chk $? 0 "mv install 1.1.0 side-by-side"
ls -d $W/mveng/modules/math-tools/1.0.0 $W/mveng/modules/math-tools/1.1.0 >/dev/null 2>&1; chk $? 0 "both version dirs present"
$SDOA manifest --modules $MV/modules | python3 -c "import json,sys;c={x['module']+'::'+x['capability'] for x in json.load(sys.stdin)['capabilities']};assert 'math-tools@1.0.0::factorial' in c and 'math-tools@1.1.0::factorial' in c and 'math-tools::factorial' in c" 2>/dev/null; chk $? 0 "versioned names + plain alias"
$SDOA module disable math-tools@1.1.0 --engine $MV >/dev/null 2>&1
$SDOA manifest --modules $MV/modules | python3 -c "import json,sys;c={x['module']+'::'+x['capability'] for x in json.load(sys.stdin)['capabilities']};assert 'math-tools@1.1.0::factorial' not in c and 'math-tools::factorial' in c" 2>/dev/null; chk $? 0 "disable highest -> alias falls back"
$SDOA module remove math-tools@1.0.0 --engine $MV >/dev/null 2>&1
ls -d $W/mveng/modules/math-tools/1.1.0 >/dev/null 2>&1 && [ ! -d $W/mveng/modules/math-tools/1.0.0 ]; chk $? 0 "remove one version leaves the other"

echo "CLI test: $PASS passed, $FAILED failed"; rm -rf $W; [ $FAILED -eq 0 ]
