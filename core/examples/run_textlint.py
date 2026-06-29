"""
text-lint, executed for real against the SDOA engine.

This is the *correct* analogue of the (broken) co-agent instructions: SDOA has
no `sdoa invoke`, and modules aren't loose Python files. Capabilities run
through the engine. Here we register `text-lint.lint` as a foreign capability
(a Python function) and execute it in a one-step pipeline via libsdoa.

Run:  python examples\run_textlint.py "This is simply not ideal."
"""
import os, sys, json

# --- locate the binding package and the freshly-built sdoa.dll ---------------
HERE = os.path.dirname(os.path.abspath(__file__))
CORE = os.path.dirname(HERE)                       # C:\MCP\core
sys.path.insert(0, os.path.join(CORE, "bindings", "python"))
os.environ.setdefault("SDOA_LIB_DIR", CORE)        # where sdoa.dll lives

from sdoa import Engine, CapFlags


def lint(i):
    """A capability: JSON in -> JSON out. Flags dismissive language."""
    text = i.get("text", "")
    lower = text.lower()
    issues = []
    idx = lower.find("simply")
    if idx != -1:
        issues.append({
            "message": "Avoid using the word 'simply' - it can sound dismissive.",
            "index": idx,
        })
    return {"issues": issues}


def main():
    sample = sys.argv[1] if len(sys.argv) > 1 else "This is simply not ideal."

    with Engine(thread_count=1) as e:
        # Register the Python function as the capability `text-lint.lint`.
        e.register_capability("text-lint", "lint", lint, CapFlags.PURE)

        # Declare the module in the model...
        e.load_model({"domains": [{"id": "D", "modules": [
            {"id": "text-lint", "capabilities": [{"name": "lint"}],
             "dependencies": [], "invariants": []},
        ]}]})

        # ...and a one-step pipeline that calls it.
        e.load_pipelines({"pipelines": [{
            "id": "Lint",
            "steps": [
                {"id": "L", "module_id": "text-lint", "capability": "lint",
                 "input": {"text": sample}},
            ],
            "edges": [],
        }]})

        result = e.run("Lint")
        out = result["outputs"]["L"]
        print("input :", sample)
        print("output:", json.dumps(out, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
