#!/usr/bin/env python3
# ──────────────────────────────────────────────────────────────────
# File:    sdoa_lora_finetune.py
# Version: 1.0.0
# Updated: 2026-06-27T00:00:00Z
# Changes: Phase 2 of the SDOA LoRA Fine-Tune Gameplan.
#          QLoRA fine-tune using PEFT + TRL SFTTrainer + bitsandbytes.
#          Reads sdoa_training_data/sdoa_dataset.jsonl produced by Phase 1.
#          Exports LoRA adapter, then converts to GGUF and registers
#          the Ollama sdoa-qwen model automatically.
# ──────────────────────────────────────────────────────────────────
"""
Prerequisites (install once):
    pip install torch transformers accelerate peft trl bitsandbytes datasets

GGUF export also requires llama.cpp checked out adjacent to this project:
    git clone https://github.com/ggerganov/llama.cpp ../llama.cpp
    pip install -r ../llama.cpp/requirements.txt

Usage:
    # Full pipeline (fine-tune + GGUF export + Ollama register):
    python scripts/sdoa_lora_finetune.py

    # Fine-tune only (skip GGUF / Ollama steps):
    python scripts/sdoa_lora_finetune.py --no-gguf

    # Override dataset path:
    python scripts/sdoa_lora_finetune.py --dataset scripts/sdoa_training_data/sdoa_dataset.jsonl

    # Override base model:
    python scripts/sdoa_lora_finetune.py --base-model Qwen/Qwen2.5-7B-Instruct
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys

ROOT      = pathlib.Path(__file__).parent.parent
DATASET   = ROOT / "datasets" / "sdoa_lora_dataset.jsonl"
LORA_OUT  = ROOT / "models" / "sdoa-lora-adapter"
GGUF_OUT  = ROOT / "models" / "sdoa-lora.gguf"
MODELFILE = ROOT / "ollama" / "Modelfile.sdoa"

BASE_MODEL   = "Qwen/Qwen2.5-7B-Instruct"
OLLAMA_MODEL = "sdoa-qwen"

LORA_CONFIG = dict(
    r=16,
    lora_alpha=32,
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
)

TRAIN_CONFIG = dict(
    num_train_epochs=3,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    warmup_ratio=0.05,
    logging_steps=10,
    save_steps=100,
    save_total_limit=2,
    fp16=True,            # set False if GPU does not support fp16
    bf16=False,
    optim="paged_adamw_8bit",
    report_to="none",
)


# ── Dataset helpers ────────────────────────────────────────────────

def _load_dataset_hf(path: pathlib.Path):
    """Load ShareGPT JSONL into a HuggingFace Dataset."""
    from datasets import Dataset

    records = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            # Flatten ShareGPT conversations to a single "text" field
            # using the Qwen2.5 chat template format:
            #   <|im_start|>system\n...<|im_end|>\n
            #   <|im_start|>user\n...<|im_end|>\n
            #   <|im_start|>assistant\n...<|im_end|>
            parts = []
            for turn in obj.get("conversations", []):
                role = turn["from"]
                value = turn["value"]
                if role == "system":
                    parts.append(f"<|im_start|>system\n{value}<|im_end|>")
                elif role == "human":
                    parts.append(f"<|im_start|>user\n{value}<|im_end|>")
                elif role == "gpt":
                    parts.append(f"<|im_start|>assistant\n{value}<|im_end|>")
            records.append({"text": "\n".join(parts)})

    return Dataset.from_list(records)


# ── Fine-tune ──────────────────────────────────────────────────────

def run_finetune(base_model: str, dataset_path: pathlib.Path, output_dir: pathlib.Path):
    """QLoRA fine-tune using PEFT + TRL SFTTrainer + bitsandbytes 4-bit quantisation."""
    print(f"[Phase 2] Loading base model: {base_model}")

    try:
        import torch
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
            TrainingArguments,
        )
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from trl import SFTTrainer
    except ImportError as e:
        print(f"[ERROR] Missing dependency: {e}")
        print("Install with: pip install torch transformers accelerate peft trl bitsandbytes datasets")
        sys.exit(1)

    # ── BitsAndBytes 4-bit config ──────────────────────────────────
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    model = AutoModelForCausalLM.from_pretrained(
        base_model,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model.config.use_cache = False
    model = prepare_model_for_kbit_training(model)

    # ── LoRA adapter ───────────────────────────────────────────────
    lora_config = LoraConfig(**LORA_CONFIG)
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # ── Dataset ────────────────────────────────────────────────────
    print(f"[Phase 2] Loading dataset: {dataset_path}")
    dataset = _load_dataset_hf(dataset_path)
    print(f"[Phase 2] Training samples: {len(dataset)}")

    # ── Training ───────────────────────────────────────────────────
    output_dir.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(output_dir),
        **TRAIN_CONFIG,
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=2048,
        args=training_args,
        packing=False,
    )

    print("[Phase 2] Starting QLoRA fine-tune…")
    trainer.train()
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    print(f"[Phase 2] LoRA adapter saved → {output_dir}")


# ── GGUF export ────────────────────────────────────────────────────

def export_gguf(adapter_dir: pathlib.Path, gguf_path: pathlib.Path):
    """
    Merge LoRA into base model and convert to GGUF using llama.cpp.
    Requires llama.cpp cloned at ../llama.cpp relative to the project root.
    """
    print("[Phase 2] Merging LoRA adapter into base model for GGUF export…")

    try:
        from peft import AutoPeftModelForCausalLM
        from transformers import AutoTokenizer
    except ImportError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)

    merged_dir = adapter_dir.parent / "sdoa-merged"
    if not merged_dir.exists():
        tokenizer = AutoTokenizer.from_pretrained(str(adapter_dir), trust_remote_code=True)
        model = AutoPeftModelForCausalLM.from_pretrained(
            str(adapter_dir), device_map="auto", trust_remote_code=True
        )
        model = model.merge_and_unload()
        model.save_pretrained(str(merged_dir), safe_serialization=True)
        tokenizer.save_pretrained(str(merged_dir))
        print(f"[Phase 2] Merged model saved → {merged_dir}")
    else:
        print(f"[Phase 2] Merged model already exists at {merged_dir}, skipping merge step.")

    # Locate llama.cpp convert script
    llama_cpp_candidates = [
        ROOT.parent / "llama.cpp" / "convert_hf_to_gguf.py",
        ROOT.parent / "llama.cpp" / "convert-hf-to-gguf.py",
        pathlib.Path(os.environ.get("LLAMA_CPP_PATH", "")) / "convert_hf_to_gguf.py",
    ]
    convert_script = next((p for p in llama_cpp_candidates if p.exists()), None)

    if not convert_script:
        print("[WARNING] llama.cpp convert script not found. Skipping GGUF conversion.")
        print("  Clone llama.cpp to ../llama.cpp and re-run with --no-finetune to export GGUF only.")
        return False

    gguf_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, str(convert_script),
        str(merged_dir),
        "--outfile", str(gguf_path),
        "--outtype", "q4_k_m",   # 4-bit quantized GGUF (good quality/size balance)
    ]
    print(f"[Phase 2] Running GGUF conversion: {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"[ERROR] GGUF conversion failed:\n{result.stderr}")
        return False

    print(f"[Phase 2] GGUF exported → {gguf_path}")
    return True


# ── Ollama registration ────────────────────────────────────────────

def register_ollama(modelfile: pathlib.Path, model_name: str):
    """Create the Ollama model from the Modelfile."""
    if not modelfile.exists():
        print(f"[ERROR] Modelfile not found: {modelfile}")
        return False

    print(f"[Phase 3] Registering Ollama model '{model_name}'…")
    result = subprocess.run(
        ["ollama", "create", model_name, "-f", str(modelfile)],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print(f"[ERROR] ollama create failed:\n{result.stderr}")
        return False

    print(f"[Phase 3] Ollama model '{model_name}' registered successfully.")
    print("[Phase 3] Test with: ollama run sdoa-qwen \"Explain SDOA governance gates.\"")
    return True


# ── Entry point ────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SDOA LoRA fine-tune pipeline")
    parser.add_argument("--base-model",    default=BASE_MODEL,     help="HuggingFace base model ID")
    parser.add_argument("--dataset",       default=str(DATASET),   help="Path to JSONL training data")
    parser.add_argument("--lora-out",      default=str(LORA_OUT),  help="LoRA adapter output directory")
    parser.add_argument("--gguf-out",      default=str(GGUF_OUT),  help="GGUF output file path")
    parser.add_argument("--ollama-model",  default=OLLAMA_MODEL,   help="Ollama model name to register")
    parser.add_argument("--modelfile",     default=str(MODELFILE), help="Path to Ollama Modelfile")
    parser.add_argument("--no-finetune",   action="store_true",    help="Skip fine-tune (GGUF + Ollama only)")
    parser.add_argument("--no-gguf",       action="store_true",    help="Skip GGUF export + Ollama registration")
    args = parser.parse_args()

    dataset_path = pathlib.Path(args.dataset)
    lora_out     = pathlib.Path(args.lora_out)
    gguf_out     = pathlib.Path(args.gguf_out)
    modelfile    = pathlib.Path(args.modelfile)

    if not args.no_finetune:
        if not dataset_path.exists():
            print(f"[ERROR] Dataset not found: {dataset_path}")
            print("Run Phase 1 first: python scripts/sdoa_dataset_builder.py")
            sys.exit(1)
        run_finetune(args.base_model, dataset_path, lora_out)

    if not args.no_gguf:
        ok = export_gguf(lora_out, gguf_out)
        if ok:
            register_ollama(modelfile, args.ollama_model)

    print("\n[sdoa_lora_finetune] Done.")
    print("  Next: run the certification suite:")
    print("        node scripts/sdoa_model_validate.js")


if __name__ == "__main__":
    main()
