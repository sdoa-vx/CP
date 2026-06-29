#!/usr/bin/env python3
# Remote engine-stub: invoke a capability on a modhost over TCP (Phase 6.6).
# Identical length-prefixed JSON protocol as the stdio PoC.
import json, socket, struct, sys, time
host, port = "127.0.0.1", int(sys.argv[1])
def call(sock, module, capability, inp):
    payload = json.dumps({"module": module, "capability": capability, "input": inp}).encode()
    sock.sendall(struct.pack("<I", len(payload)) + payload)
    hdr = b""
    while len(hdr) < 4: hdr += sock.recv(4 - len(hdr))
    (n,) = struct.unpack("<I", hdr)
    buf = b""
    while len(buf) < n: buf += sock.recv(n - len(buf))
    return json.loads(buf)
s = None
for _ in range(50):
    try: s = socket.create_connection((host, port), timeout=2); break
    except OSError: time.sleep(0.1)
assert s, "could not connect to remote modhost"
P = F = 0
def chk(c, n):
    global P, F
    if c: P += 1
    else: print("FAIL:", n); F += 1
r = call(s, "math-tools", "factorial", {"n": 5});   chk(r.get("ok") and r["output"]["result"] == 120, "REMOTE factorial(5)=120 over TCP")
r = call(s, "math-tools", "fibonacci", {"n": 10});  chk(r.get("ok") and r["output"]["result"] == 55, "REMOTE fibonacci(10)=55 over TCP")
r = call(s, "math-tools", "factorial", {"n": "x"}); chk((not r.get("ok")) and "SCHEMA_VALIDATION_FAILED" in r.get("error",""), "REMOTE schema error over TCP")
print(f"=== TCP distributed PoC: {P} passed, {F} failed ===")
s.close(); sys.exit(0 if F == 0 else 1)
