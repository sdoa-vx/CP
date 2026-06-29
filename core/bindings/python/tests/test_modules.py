"""Phase 6: load a real module from disk and run its capabilities via Python."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from sdoa import Engine

MODROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "modules"))

def main():
    e = Engine(thread_count=2)
    e.load_modules(MODROOT)
    mods = e.modules()
    st = next((m for m in mods if m["id"] == "string-tools"), None)
    assert st and st["loaded"] is True and st["error"] == "", mods
    assert set(["upper", "slugify"]).issubset(set(st["capabilities"]))
    e.load_model({"domains": [{"id": "T", "modules": [
        {"id": "string-tools", "capabilities": [{"name": "upper"}, {"name": "slugify"}], "dependencies": [], "invariants": []}]}]})
    e.load_pipelines({"pipelines": [{"id": "P", "steps": [
        {"id": "U", "module_id": "string-tools", "capability": "upper", "input": {"text": "hello world"}},
        {"id": "S", "module_id": "string-tools", "capability": "slugify", "input": {"text": "Hello SDOA World!"}},
    ], "edges": []}]})
    r = e.run("P")
    assert r["success"], r
    assert r["outputs"]["U"]["result"] == "HELLO WORLD"
    assert r["outputs"]["S"]["result"] == "hello-sdoa-world"
    print(f"[PASS] Python loaded module '{st['id']}' v{st['version']} and ran its capabilities")
    print("\nAll Python module tests passed.")

if __name__ == "__main__":
    main()
