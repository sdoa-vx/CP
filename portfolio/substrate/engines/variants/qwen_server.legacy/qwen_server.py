#!/usr/bin/env python3
# ──────────────────────────────────────────────────────────────────
# File:    qwen_server.py
# Version: 1.2.0
# Updated: 2026-06-27T00:00:00Z
# Changes: V3 compliance — moved to variants/qwen_server.legacy/;
#          superseded by LocalLlmServer.engine.py (v5.0.0).
#          variant_of: "LocalLlmServer.engine"
# ──────────────────────────────────────────────────────────────────
# Last modified: 2026-06-03 06:10 UTC
# ============================================================
# qwen_server.py — ProtoAI Local AI Inference Server (LEGACY)
# version: 1.2.0
# VARIANT OF: LocalLlmServer.engine
# ============================================================

# MANIFEST = {
#   id: "qwen_server.engine",
#   variant_of: "LocalLlmServer.engine",
#   type: "engine",
#   layer: 3,
#   runtime: "Python",
#   version: "1.2.0",
#   operationalRole: "savant",
#   requires: [],
#   capabilities: ["local_llm_inference", "http_api"],
#   dependencies: [],
#   docs: {
#     description: "ProtoAI Local AI Inference Server serving Qwen causal LM models.",
#     author: "ProtoAI team",
#     sdoa: "5.0.0"
#   },
#   "Last modified": "2026-06-03 06:10 UTC"
# };

MANIFEST_JSON = """
"MANIFEST" : {
  "id": "qwen_server.engine",
  "variant_of": "LocalLlmServer.engine",
  "type": "engine",
  "layer": 3,
  "runtime": "Python",
  "version": "1.2.0",
  "operationalRole": "savant",
  "requires": [],
  "capabilities": ["local_llm_inference", "http_api"],
  "dependencies": [],
  "docs": {
    "description": "Legacy inference server — superseded by LocalLlmServer.engine.py v5.0.0.",
    "author": "ProtoAI team",
    "sdoa": "5.0.0"
  },
  "Last modified": "2026-06-27"
}
"""


import os
import sys
import json
import time
import argparse
import threading
from http.server import BaseHTTPRequestHandler
try:
    from http.server import ThreadingHTTPServer as HTTPServer
except ImportError:
    from http.server import HTTPServer


MANIFEST = {
    "id": "qwen_server.engine",
    "type": "engine",
    "layer": 3,
    "runtime": "Python",
    "version": "1.2.0",
    "operationalRole": "savant",
    "requires": [],
    "capabilities": ["local_llm_inference", "http_api"],
    "dependencies": [],
    "docs": {
        "description": "ProtoAI Local AI Inference Server serving Qwen causal LM models.",
        "author": "ProtoAI team",
        "sdoa": "5.0.0"
    },
    "Last modified": "2026-06-03 06:10 UTC"
}


MODEL_NAME = os.environ.get("PROTOAI_MODEL", "Qwen/Qwen2.5-Coder-7B-Instruct")

# ── Globals (populated by load_model) ─────────────────────
_model      = None
_tokenizer  = None
_device     = "cpu"
_model_lock = threading.Lock()
_loading    = False
_load_error = None


# ── Model loading ──────────────────────────────────────────

def load_model():
    global _model, _tokenizer, _device, _loading, _load_error
    _loading = True
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        # Qwen2.5-Omni-* are multimodal (audio+vision+text) models that require a
        # specialised pipeline (Qwen2_5OmniForConditionalGeneration + processor) and
        # a much newer transformers build.  This server only handles text-only
        # inference via AutoModelForCausalLM, so we reject Omni upfront with a
        # clear message rather than crashing deep in transformers internals.
        if "omni" in MODEL_NAME.lower():
            raise ValueError(
                f"Omni models ({MODEL_NAME}) are not supported by the local text server. "
                "Please select a text-only model such as Qwen/Qwen2.5-Coder-7B-Instruct "
                "or Qwen/Qwen2.5-7B-Instruct in Settings -> Models."
            )

        _device = "cuda" if torch.cuda.is_available() else "cpu"
        # Use float16 on GPU; float32 on CPU (software bfloat16 emulation is extremely slow)
        dtype   = torch.float16 if _device == "cuda" else torch.float32

        if _device == "cpu":
            torch.set_num_threads(min(4, os.cpu_count() or 1))

        print(f"[qwen_server] Loading {MODEL_NAME} on {_device} ({dtype})...", flush=True)
        t0 = time.time()

        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_NAME,
            torch_dtype=dtype,
            device_map="auto" if _device == "cuda" else None,
            low_cpu_mem_usage=True,
            trust_remote_code=True,
        )
        if _device == "cpu":
            _model = _model.to(_device)
        _model.eval()

        elapsed = time.time() - t0
        print(f"[qwen_server] Model ready in {elapsed:.1f}s on {_device}", flush=True)

    except Exception as e:
        _load_error = str(e)
        print(f"[qwen_server] ERROR loading model: {e}", flush=True)
    finally:
        _loading = False


# ── Text inference ─────────────────────────────────────────

def generate_text(prompt: str, system_prompt: str = "", max_new_tokens: int = 512, temperature: float = 0.7) -> str:
    """
    Text-only inference using chat template.
    Works with any Qwen2.5 instruct model.
    """
    import torch

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    # Apply the model's built-in chat template
    text_input = _tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )

    inputs = _tokenizer(text_input, return_tensors="pt", padding=True)
    inputs = {k: v.to(_model.device) for k, v in inputs.items()}

    gen_kwargs = dict(
        max_new_tokens=max_new_tokens,
        pad_token_id=_tokenizer.eos_token_id,
        eos_token_id=_tokenizer.eos_token_id,
    )
    if temperature > 0:
        gen_kwargs["do_sample"]    = True
        gen_kwargs["temperature"]  = temperature
        gen_kwargs["top_p"]        = 0.9
    else:
        gen_kwargs["do_sample"]    = False

    with torch.no_grad():
        output_ids = _model.generate(**inputs, **gen_kwargs)

    # Decode only newly generated tokens (exclude the prompt)
    input_len = inputs["input_ids"].shape[1]
    new_ids   = output_ids[:, input_len:]
    return _tokenizer.decode(new_ids[0], skip_special_tokens=True).strip()


# ── HTTP handler ───────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # suppress default access log noise

    def _send_json(self, code: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type",  "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {
                "ok":      True,
                "model":   MODEL_NAME,
                "ready":   _model is not None,
                "loading": _loading,
                "device":  _device,
                "error":   _load_error,
            })
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/generate":
            self._send_json(404, {"error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception as e:
            self._send_json(400, {"error": f"Bad request: {e}"})
            return

        prompt         = body.get("prompt", "").strip()
        system_prompt  = body.get("system_prompt", "")
        max_new_tokens = int(body.get("max_new_tokens", 512))
        temperature    = float(body.get("temperature", 0.7))

        if not prompt:
            self._send_json(400, {"error": "'prompt' is required"})
            return

        if _model is None:
            if _loading:
                self._send_json(503, {"error": "Model is still loading, please retry shortly"})
            elif _load_error:
                self._send_json(500, {"error": f"Model failed to load: {_load_error}"})
            else:
                self._send_json(503, {"error": "Model not loaded"})
            return

        try:
            with _model_lock:
                text = generate_text(prompt, system_prompt, max_new_tokens, temperature)
            self._send_json(200, {"text": text, "model": MODEL_NAME})
        except Exception as e:
            print(f"[qwen_server] generate error: {e}", flush=True)
            self._send_json(500, {"error": str(e)})


# ── Entry point ────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ProtoAI local inference server")
    parser.add_argument("--port",  type=int, default=17892, help="Port to listen on (default: 17892)")
    parser.add_argument("--lazy",  action="store_true",     help="Defer model load until first /generate request")
    parser.add_argument("--model", default=None,             help="Override model name (default: PROTOAI_MODEL env or Qwen2.5-Coder-7B-Instruct)")
    args = parser.parse_args()

    global MODEL_NAME
    if args.model:
        MODEL_NAME = args.model

    server = HTTPServer(("127.0.0.1", args.port), Handler)

    if not args.lazy:
        # Load in background so server starts immediately and /health works during loading
        threading.Thread(target=load_model, daemon=True).start()
    else:
        # Lazy: load on first POST /generate
        orig = Handler.do_POST
        def lazy_post(self):
            if _model is None and not _loading and not _load_error:
                threading.Thread(target=load_model, daemon=True).start()
            orig(self)
        Handler.do_POST = lazy_post

    # Signal readiness to the Node.js parent (it waits for this line)
    print(f"QWEN_SERVER_READY:{args.port}", flush=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[qwen_server] Shutting down.", flush=True)


if __name__ == "__main__":
    main()
