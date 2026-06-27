#!/usr/bin/env python3
# Last modified: 2026-06-03 06:15 UTC
# ============================================================
# bootstrap.py — ProtoAI Local AI First-Run Setup
# version: 1.1.0
# ============================================================

# MANIFEST = {
#   id: "bootstrap.py",
#   type: "utility",
#   layer: 3,
#   runtime: "Python",
#   version: "1.1.0",
#   operationalRole: "bootstrap",
#   requires: [],
#   capabilities: ["environment_provisioning", "model_downloader"],
#   dependencies: [],
#   docs: {
#     description: "One-time setup sequence: bootstraps pip, venv, and downloads models.",
#     author: "ProtoAI team",
#     sdoa: "5.0.0"
#   }
# };

MANIFEST_JSON = """
"MANIFEST" : {
  "id": "bootstrap.py",
  "type": "utility",
  "layer": 3,
  "runtime": "Python",
  "version": "1.1.0",
  "operationalRole": "bootstrap",
  "requires": [],
  "capabilities": ["environment_provisioning", "model_downloader"],
  "dependencies": [],
  "docs": {
    "description": "One-time setup sequence: bootstraps pip, venv, and downloads models.",
    "author": "ProtoAI team",
    "sdoa": "5.0.0"
  }
}
"""

import os
import sys
import json
import subprocess
import platform
import shutil
import argparse
import re

MANIFEST = {
    "id": "bootstrap.py",
    "type": "utility",
    "layer": 3,
    "runtime": "Python",
    "version": "1.1.0",
    "operationalRole": "bootstrap",
    "requires": [],
    "capabilities": ["environment_provisioning", "model_downloader"],
    "dependencies": [],
    "docs": {
        "description": "One-time setup sequence: bootstraps pip, venv, and downloads models.",
        "author": "ProtoAI team",
        "sdoa": "5.0.0"
    }
}

# Default to Coder variant — smaller and more practical than Omni-7B
MODEL_NAME = "Qwen/Qwen2.5-Coder-7B-Instruct"


# ── Helpers ────────────────────────────────────────────────

def emit(data: dict):
    """Write a JSON progress line to stdout (Node.js parent reads this)."""
    print(json.dumps(data), flush=True)


def emit_progress(step: int, total: int, label: str, pct: int = 0, sub: str = None):
    d = {"step": step, "total": total, "label": label, "pct": pct}
    if sub:
        d["sub"] = sub
    emit(d)


def emit_error(msg: str):
    emit({"error": msg})


def run(cmd: list, **kwargs) -> subprocess.CompletedProcess:
    """Run a subprocess, raising on non-zero exit. Captures output."""
    result = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"Exit {result.returncode}")
    return result


def run_streaming(cmd: list, step: int, total: int, label: str):
    emit_progress(step, total, label, 0)
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=0,
    )

    pct_re = re.compile(rb'(\d+)%')
    last_pct = 0
    buf = bytearray()

    while True:
        ch = proc.stdout.read(1)
        if not ch:
            break
        if ch in (b'\n', b'\r'):
            line = buf.decode("utf-8", errors="replace").strip()
            buf.clear()
            if not line:
                continue
            m = pct_re.search(line.encode())
            if m:
                last_pct = int(m.group(1))
            sub = line[:200]
            emit({"step": step, "total": total, "label": label, "sub": sub, "pct": last_pct})
        else:
            buf.extend(ch)

    if buf:
        line = buf.decode("utf-8", errors="replace").strip()
        if line:
            emit({"step": step, "total": total, "label": label, "sub": line[:200], "pct": last_pct})

    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"Process exited with code {proc.returncode}")

    emit_progress(step, total, label, 100)


# ── Main bootstrap logic ───────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model",     default=MODEL_NAME)
    parser.add_argument("--venv",      default=None,  help="Override venv path")
    parser.add_argument("--embed-dir", default=None,  help="Path to embedded Python dir")
    parser.add_argument("--cuda",      action="store_true", help="Force CUDA torch build")
    args = parser.parse_args()

    appdata  = os.environ.get("APPDATA") or os.path.expanduser("~")
    venv_dir = args.venv or os.path.join(appdata, "protoai", "ai_env")

    if args.embed_dir and os.path.isdir(args.embed_dir):
        embed_python = os.path.join(args.embed_dir, "python.exe")
    else:
        embed_python = sys.executable

    if platform.system() != "Windows":
        venv_python = os.path.join(venv_dir, "bin", "python")
        venv_pip    = os.path.join(venv_dir, "bin", "pip")
    else:
        venv_python = os.path.join(venv_dir, "Scripts", "python.exe")
        venv_pip    = os.path.join(venv_dir, "Scripts", "pip.exe")

    TOTAL_STEPS = 5

    emit_progress(1, TOTAL_STEPS, "Bootstrapping pip into embedded Python runtime…")

    try:
        run([embed_python, "-m", "pip", "--version"])
        emit_progress(1, TOTAL_STEPS, "pip already available", 100)
    except Exception:
        get_pip = os.path.join(os.path.dirname(embed_python), "get-pip.py")
        if not os.path.exists(get_pip):
            get_pip = os.path.join(os.path.dirname(__file__), "..", "..", "python-embed", "get-pip.py")
        if os.path.exists(get_pip):
            try:
                run([embed_python, get_pip, "--no-warn-script-location"])
                emit_progress(1, TOTAL_STEPS, "pip bootstrapped", 100)
            except RuntimeError as e:
                emit_progress(1, TOTAL_STEPS, f"pip bootstrap warning (may be OK): {str(e)[:80]}", 100)
        else:
            emit_progress(1, TOTAL_STEPS, "pip bootstrap skipped — get-pip.py not found", 100)

    emit_progress(2, TOTAL_STEPS, "Creating Python virtual environment…")

    if os.path.exists(venv_python):
        emit_progress(2, TOTAL_STEPS, "Virtual environment already exists — skipping", 100)
    else:
        os.makedirs(os.path.dirname(venv_dir) if os.path.dirname(venv_dir) else venv_dir, exist_ok=True)
        try:
            run([embed_python, "-m", "venv", venv_dir])
        except RuntimeError:
            try:
                run([embed_python, "-m", "pip", "install", "virtualenv", "--quiet"])
                run([embed_python, "-m", "virtualenv", venv_dir])
            except RuntimeError as e:
                emit_error(f"Failed to create virtual environment: {e}")
                sys.exit(1)

        if not os.path.exists(venv_python):
            emit_error(f"Virtual environment not found after creation at {venv_dir}")
            sys.exit(1)

    emit_progress(2, TOTAL_STEPS, f"Virtual environment ready: {venv_dir}", 100)

    if args.cuda:
        torch_cmd = [
            venv_pip, "install", "torch", "--quiet",
            "--index-url", "https://download.pytorch.org/whl/cu121"
        ]
        label3 = "Installing PyTorch with CUDA 12.1 (this takes a few minutes)…"
    else:
        torch_cmd = [venv_pip, "install", "torch", "--quiet"]
        label3 = "Installing PyTorch CPU build (this takes a few minutes)…"

    run_streaming(torch_cmd, 3, TOTAL_STEPS, label3)

    packages = [
        "transformers>=4.40.0",
        "accelerate>=0.26.0",
        "safetensors>=0.4.0",
        "huggingface_hub>=0.20.0",
        "fastapi>=0.110.0",
        "uvicorn>=0.27.0",
    ]
    run_streaming(
        [venv_pip, "install", "--quiet"] + packages,
        4, TOTAL_STEPS,
        "Installing transformers and server dependencies…"
    )

    emit_progress(5, TOTAL_STEPS, f"Downloading {args.model} from HuggingFace (~7 GB)…", 0)

    dl_script = "\n".join([
        "import os",
        "from huggingface_hub import snapshot_download",
        "import json, sys",
        f"repo = '{args.model}'",
        "print(json.dumps({'step':5,'total':5,'label':'Downloading model files...','pct':5}), flush=True)",
        "path = snapshot_download(repo_id=repo, repo_type='model')",
        "print(json.dumps({'step':5,'total':5,'label':'Model downloaded','sub':path,'pct':100}), flush=True)",
    ])

    proc = subprocess.Popen(
        [venv_python, "-u", "-c", dl_script],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        text=True,
    )

    pct_pattern = re.compile(r'(\d+)%')
    last_pct = 5

    model_path = None
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            evt = json.loads(line)
            emit(evt)
            if evt.get("pct") == 100:
                model_path = evt.get("sub")
            elif evt.get("pct") is not None:
                last_pct = evt.get("pct")
        except Exception:
            match = pct_pattern.search(line)
            if match:
                last_pct = int(match.group(1))
            emit({"step": 5, "total": 5, "label": f"Downloading {args.model}…", "sub": line[:200], "pct": last_pct})

    stderr_out = proc.stderr.read().strip() if proc.stderr else ""
    proc.wait()

    if proc.returncode != 0:
        emit_error(f"Model download failed (exit {proc.returncode}): {stderr_out[:300]}")
        sys.exit(1)

    emit({
        "done": True,
        "venv": venv_dir,
        "model": model_path or args.model
    })


if __name__ == "__main__":
    main()
