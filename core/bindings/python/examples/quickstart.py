"""Minimal SDOA Python quickstart: built-in + foreign capability in one pipeline."""
from sdoa import Engine, CapFlags

with Engine(thread_count=2) as e:
    e.install_stdlib()  # 30 built-in capabilities
    e.register_capability("My", "shout", lambda i: {"result": i["text"].upper() + "!"}, CapFlags.PURE)
    e.load_model({"domains": [{"id": "D", "modules": [
        {"id": "String", "capabilities": [{"name": "concat"}], "dependencies": [], "invariants": []},
        {"id": "My", "capabilities": [{"name": "shout"}], "dependencies": [], "invariants": []},
    ]}]})
    e.load_pipelines({"pipelines": [{"id": "Greet",
        "steps": [
            {"id": "J", "module_id": "String", "capability": "concat", "input": {"parts": ["hello", "sdoa"], "sep": " "}},
            {"id": "S", "module_id": "My", "capability": "shout", "input": {"text": "@J.result"}},
        ],
        "edges": [{"source_step": "J", "target_step": "S"}]}]})
    print(e.run("Greet")["outputs"]["S"]["result"])  # -> HELLO SDOA!
