"""End-to-end tests for the SDOA Python binding (run against libsdoa)."""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from sdoa import Engine, CapFlags, SdoaError

STDLIB_MODEL = {
    "domains": [
        {"id": "Num", "modules": [{"id": "Math",
            "capabilities": [{"name": n} for n in ["add", "multiply", "sum"]],
            "dependencies": [], "invariants": []}]},
        {"id": "Str", "modules": [{"id": "String",
            "capabilities": [{"name": n} for n in ["concat", "to_upper", "format"]],
            "dependencies": [], "invariants": []}]},
        {"id": "Ext", "modules": [{"id": "Py",
            "capabilities": [{"name": n} for n in ["score", "boom"]],
            "dependencies": [], "invariants": []}]},
    ]
}

def fresh():
    e = Engine(thread_count=2)
    e.install_stdlib()
    e.load_model(STDLIB_MODEL)
    return e

def t_builtin():
    e = fresh()
    e.load_pipelines({"pipelines": [{"id": "P",
        "steps": [{"id": "S", "module_id": "Math", "capability": "add", "input": {"a": 2, "b": 5}}],
        "edges": []}]})
    r = e.run("P")
    assert r["success"] and r["outputs"]["S"]["result"] == 7, r
    print("[PASS] builtin capability via Python")

def t_foreign_and_chain():
    e = fresh()
    # Foreign capability: Python scoring function.
    e.register_capability("Py", "score", lambda i: {"result": i["x"] * 3 + 1}, CapFlags.PURE)
    e.load_pipelines({"pipelines": [{"id": "C",
        "steps": [
            {"id": "A", "module_id": "Math", "capability": "add", "input": {"a": 10, "b": 4}},
            {"id": "B", "module_id": "Py", "capability": "score", "input": {"x": "@A.result"}},
            {"id": "D", "module_id": "String", "capability": "format",
             "input": {"template": "score={v}", "args": {"v": "@B.result"}}},
        ],
        "edges": [{"source_step": "A", "target_step": "B"}, {"source_step": "B", "target_step": "D"}]}]})
    r = e.run("C")
    assert r["success"], r
    assert r["outputs"]["A"]["result"] == 14
    assert r["outputs"]["B"]["result"] == 43      # (14)*3+1, computed in Python
    assert r["outputs"]["D"]["result"] == "score=43"
    print("[PASS] foreign Python capability in a mixed chain")

def t_error_isolation():
    e = fresh()
    def boom(_):
        raise ValueError("kaboom from python")
    e.register_capability("Py", "boom", boom, CapFlags.PURE)
    e.load_pipelines({"pipelines": [{"id": "E",
        "steps": [{"id": "S", "module_id": "Py", "capability": "boom", "input": {}}], "edges": []}]})
    r = e.run("E")
    assert r["success"] is False, r
    assert "kaboom from python" in r["error"], r
    print("[PASS] foreign exception isolated -> structured STEP_ERROR")

def t_determinism():
    e = fresh()
    e.register_capability("Py", "score", lambda i: {"result": sum(i["vals"])}, CapFlags.PURE)
    e.load_pipelines({"pipelines": [{"id": "D",
        "steps": [{"id": "S", "module_id": "Py", "capability": "score", "input": {"vals": [1, 2, 3, 4]}}], "edges": []}]})
    first = e.run("D")
    for _ in range(100):
        assert e.run("D") == first
    assert first["outputs"]["S"]["result"] == 10
    print("[PASS] foreign capability deterministic over 100 runs")

def t_manifest_and_compliance():
    e = fresh()
    e.register_capability("Py", "score", lambda i: {"result": 0}, CapFlags.NONDETERMINISTIC)
    man = e.capabilities()
    by = {(c["module"], c["capability"]): c for c in man}
    assert by[("Math", "add")]["origin"] == "builtin"
    assert by[("Py", "score")]["origin"] == "foreign"
    assert by[("Py", "score")]["flags"]["nondeterministic"] is True
    # Compliance: collision with a built-in module must be rejected.
    try:
        e.register_capability("Math", "add", lambda i: i, CapFlags.PURE)
        assert False, "expected rejection"
    except SdoaError:
        pass
    # Compliance: PURE cannot combine with SIDE_EFFECTING.
    try:
        e.register_capability("Py", "x", lambda i: i, CapFlags.PURE | CapFlags.SIDE_EFFECTING)
        assert False, "expected rejection"
    except SdoaError:
        pass
    print(f"[PASS] manifest ({len(man)} caps) + compliance gate")

if __name__ == "__main__":
    print(f"=== SDOA Python binding tests (api v{Engine(0).api_version()}) ===")
    t_builtin()
    t_foreign_and_chain()
    t_error_isolation()
    t_determinism()
    t_manifest_and_compliance()
    print("\nAll Python binding tests passed.")
