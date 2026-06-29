#!/usr/bin/env python3
# Engine-stub driver for the out-of-process module host (Phase 6.5 PoC).
# Speaks the length-prefixed JSON IPC protocol to sdoa-modhost over pipes.
import json, os, struct, subprocess, sys, signal, time

MODHOST = sys.argv[1] if len(sys.argv) > 1 else "sdoa-modhost"
MODULES = sys.argv[2]

def spawn(sandbox="pure"):
    return subprocess.Popen([MODHOST, "--modules", MODULES, "--sandbox", sandbox],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, env=dict(os.environ))

def call(p, module, capability, inp, timeout=5.0):
    payload = json.dumps({"module": module, "capability": capability, "input": inp}).encode()
    try:
        p.stdin.write(struct.pack("<I", len(payload)) + payload); p.stdin.flush()
    except BrokenPipeError:
        rc = p.poll(); sig = -rc if (rc is not None and rc < 0) else 0
        raise RuntimeError("MODULE_SANDBOX_VIOLATION (SIGSYS)" if sig == signal.SIGSYS else "MODULE_PROCESS_CRASHED (broken pipe)")
    hdr = p.stdout.read(4)
    if len(hdr) < 4:
        rc = p.poll()
        if rc is not None and rc < 0:  # killed by signal
            sig = -rc
            raise RuntimeError(f"MODULE_SANDBOX_VIOLATION (SIGSYS)" if sig == signal.SIGSYS else f"MODULE_PROCESS_CRASHED (signal {sig})")
        raise RuntimeError("MODULE_PROCESS_CRASHED (eof)")
    (n,) = struct.unpack("<I", hdr)
    return json.loads(p.stdout.read(n))

PASS = FAIL = 0
def chk(cond, name):
    global PASS, FAIL
    if cond: PASS += 1
    else: print(f"FAIL: {name}"); FAIL += 1

p = spawn("pure")
r = call(p, "math-tools", "factorial", {"n": 5});   chk(r.get("ok") and r["output"]["result"] == 120, "factorial(5)=120 out-of-process")
r = call(p, "math-tools", "fibonacci", {"n": 10});  chk(r.get("ok") and r["output"]["result"] == 55, "fibonacci(10)=55 out-of-process")
r = call(p, "math-tools", "gcd", {"a": 12, "b": 18}); chk(r.get("ok") and r["output"]["result"] == 6, "gcd(12,18)=6 out-of-process")
# schema-invalid input -> structured error from the hosted engine
r = call(p, "math-tools", "factorial", {"n": "oops"}); chk((not r.get("ok")) and "SCHEMA_VALIDATION_FAILED" in r.get("error",""), "schema violation surfaced over IPC")
p.stdin.close(); p.wait()

# crash semantics: kill the host mid-session, engine detects it
p2 = spawn("pure")
call(p2, "math-tools", "factorial", {"n": 3})  # warm it
p2.kill(); p2.wait()
crashed = False
try: call(p2, "math-tools", "factorial", {"n": 3})
except RuntimeError as e: crashed = "CRASH" in str(e) or "SANDBOX" in str(e)
chk(crashed, "killed host -> MODULE_PROCESS_CRASHED surfaced")

print(f"=== IPC PoC: {PASS} passed, {FAIL} failed ===")
sys.exit(0 if FAIL == 0 else 1)
