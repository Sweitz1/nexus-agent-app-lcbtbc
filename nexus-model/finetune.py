"""
Fine-tune NexusLLM on your own data using LoRA (low-rank adaptation).
Runs on a single GPU (24GB+). Uses PEFT + TRL for efficient training.

Usage:
    python finetune.py --model ./nexus-llm-merged --data ./data/train.jsonl
    python finetune.py --model ./nexus-llm-merged --data ./data/train.jsonl --4bit
"""

import os
import json
import argparse
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class TrainingConfig:
    # Model
    model_path: str = "./nexus-llm-merged"
    output_dir: str = "./nexus-llm-finetuned"

    # LoRA
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    lora_target_modules: list = field(default_factory=lambda: [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ])

    # Training
    num_epochs: int = 3
    batch_size: int = 2
    grad_accumulation: int = 8       # effective batch = batch_size * grad_accumulation
    learning_rate: float = 2e-4
    max_seq_length: int = 4096
    warmup_ratio: float = 0.03
    lr_scheduler: str = "cosine"
    save_steps: int = 100
    logging_steps: int = 10

    # Memory
    load_in_4bit: bool = False
    load_in_8bit: bool = False
    bf16: bool = True
    gradient_checkpointing: bool = True


def load_dataset_from_jsonl(path: str) -> list[dict]:
    """
    Load training data from JSONL.
    Each line should be one of:
      {"prompt": "...", "response": "..."}           # instruction format
      {"messages": [{"role": "user", ...}, ...]}     # chat format
      {"text": "..."}                                # raw text
    """
    data = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                data.append(json.loads(line))
    return data


def format_instruction(example: dict) -> str:
    """Format a training example into the model's chat template."""
    if "messages" in example:
        return example  # already in chat format
    if "prompt" in example and "response" in example:
        return {
            "messages": [
                {"role": "user", "content": example["prompt"]},
                {"role": "assistant", "content": example["response"]},
            ]
        }
    if "text" in example:
        return {"text": example["text"]}
    return example


def finetune(config: TrainingConfig, data_path: str):
    try:
        import torch
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
        from peft import LoraConfig, get_peft_model, TaskType
        from trl import SFTTrainer, SFTConfig
        from datasets import Dataset
    except ImportError as e:
        print(f"Missing dependency: {e}")
        print("Install: pip install peft trl datasets bitsandbytes")
        return

    print(f"=== NexusLLM Fine-Tuning ===")
    print(f"Model:  {config.model_path}")
    print(f"Data:   {data_path}")
    print(f"Output: {config.output_dir}")
    print()

    # Load data
    raw_data = load_dataset_from_jsonl(data_path)
    formatted = [format_instruction(ex) for ex in raw_data]
    dataset = Dataset.from_list(formatted)
    print(f"Loaded {len(dataset)} training examples")

    # Quantization
    quant_config = None
    if config.load_in_4bit:
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
        )

    # Load model
    tokenizer = AutoTokenizer.from_pretrained(config.model_path, trust_remote_code=True)
    if not tokenizer.pad_token:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        config.model_path,
        quantization_config=quant_config,
        torch_dtype=torch.bfloat16 if not quant_config else None,
        device_map="auto",
        trust_remote_code=True,
    )

    # LoRA
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=config.lora_r,
        lora_alpha=config.lora_alpha,
        lora_dropout=config.lora_dropout,
        target_modules=config.lora_target_modules,
        bias="none",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Training
    sft_config = SFTConfig(
        output_dir=config.output_dir,
        num_train_epochs=config.num_epochs,
        per_device_train_batch_size=config.batch_size,
        gradient_accumulation_steps=config.grad_accumulation,
        learning_rate=config.learning_rate,
        max_seq_length=config.max_seq_length,
        warmup_ratio=config.warmup_ratio,
        lr_scheduler_type=config.lr_scheduler,
        save_steps=config.save_steps,
        logging_steps=config.logging_steps,
        bf16=config.bf16,
        gradient_checkpointing=config.gradient_checkpointing,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        args=sft_config,
    )

    print("\nStarting training...")
    trainer.train()

    # Save merged model (LoRA weights merged into base)
    print(f"\nSaving fine-tuned model to {config.output_dir}...")
    merged = model.merge_and_unload()
    merged.save_pretrained(config.output_dir)
    tokenizer.save_pretrained(config.output_dir)
    print(f"✓ Saved to {config.output_dir}")
    print(f"\n  Run:    python model.py --model {config.output_dir}")
    print(f"  Upload: python upload_hf.py upload --model {config.output_dir} --repo your-username/nexus-llm-ft")


def main():
    parser = argparse.ArgumentParser(description="Fine-tune NexusLLM with LoRA")
    parser.add_argument("--model", default="./nexus-llm-merged")
    parser.add_argument("--data", required=True, help="JSONL training data file")
    parser.add_argument("--output", default="./nexus-llm-finetuned")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--batch", type=int, default=2)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--4bit", dest="bit4", action="store_true", help="Load in 4-bit quantization")
    parser.add_argument("--8bit", dest="bit8", action="store_true")
    args = parser.parse_args()

    config = TrainingConfig(
        model_path=args.model,
        output_dir=args.output,
        num_epochs=args.epochs,
        learning_rate=args.lr,
        batch_size=args.batch,
        lora_r=args.lora_r,
        load_in_4bit=args.bit4,
        load_in_8bit=args.bit8,
    )

    finetune(config, args.data)


if __name__ == "__main__":
    main()
