# Specialized Coding Models

## CodeLlama (Meta)
- **Variants:** 7B, 13B, 34B, 70B
- **Context:** 100K tokens
- **Strengths:** Code generation, infilling, instruction following for code
- **Languages:** Python, C++, Java, PHP, TypeScript, C#, Bash
- **Variants:** Base, Instruct, Python-specialized
- **License:** Llama 2
- **VRAM:** 14GB (7B) → 140GB (70B)

```bash
ollama pull codellama:34b
ollama run codellama:34b
```

```python
# Via Ollama
import ollama
response = ollama.generate(model="codellama:34b", prompt="# Python function to merge two sorted arrays\ndef merge_sorted(")
print(response["response"])

# Fill-in-middle
response = ollama.generate(
    model="codellama:7b-code",
    prompt="<PRE> def fibonacci(n): <SUF> return result <MID>"
)
```

---

## StarCoder 2 (BigCode / HuggingFace)
- **Variants:** 3B, 7B, 15B
- **Context:** 16K tokens
- **Strengths:** Code completion, 600+ programming languages
- **Training:** The Stack v2 (6TB code)
- **License:** BigCode Open RAIL-M
- **VRAM:** 6GB (3B) → 32GB (15B)

```bash
ollama pull starcoder2:15b
```

```python
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

checkpoint = "bigcode/starcoder2-15b-instruct-v0.1"
tokenizer = AutoTokenizer.from_pretrained(checkpoint)
model = AutoModelForCausalLM.from_pretrained(
    checkpoint, torch_dtype=torch.bfloat16, device_map="auto"
)

prompt = "Write a Python function that implements merge sort with type hints."
inputs = tokenizer.encode(prompt, return_tensors="pt").to(model.device)
output = model.generate(inputs, max_new_tokens=512, temperature=0.2)
print(tokenizer.decode(output[0], skip_special_tokens=True))
```

---

## Qwen2.5-Coder (Alibaba)
- **Variants:** 0.5B, 1.5B, 3B, 7B, 14B, 32B, 72B
- **Context:** 128K tokens
- **Strengths:** Top open-source coding model as of 2025, matches GPT-4o on coding
- **Languages:** 92 programming languages
- **License:** Qwen (Apache-like for ≤72B)

```bash
ollama pull qwen2.5-coder:7b
ollama pull qwen2.5-coder:32b
ollama run qwen2.5-coder:32b
```

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11434/v1",
    api_key="ollama"
)

response = client.chat.completions.create(
    model="qwen2.5-coder:32b",
    messages=[
        {"role": "system", "content": "You are an expert software engineer. Write clean, well-documented code."},
        {"role": "user", "content": "Implement a persistent skip list in Rust."}
    ]
)
print(response.choices[0].message.content)
```

---

## Phi-4 (Microsoft)
- **Params:** 14B
- **Context:** 16K tokens
- **Strengths:** Exceptional reasoning per parameter — outperforms many larger models
- **License:** MIT
- **VRAM:** ~28GB

```bash
ollama pull phi4
ollama run phi4
```

```python
import ollama

response = ollama.chat(
    model="phi4",
    messages=[
        {"role": "user", "content": "Debug this code and explain the fix:\n\n```python\ndef divide(a, b):\n    return a / b\n\nprint(divide(10, 0))\n```"}
    ]
)
print(response["message"]["content"])
```

---

## DeepSeek-Coder-V2 (DeepSeek)
See [../deepseek/README.md](../deepseek/README.md)

---

## WizardCoder (WizardLM)
- **Variants:** 7B, 13B, 34B
- **Base:** CodeLlama / Mistral
- **Strengths:** Instruction-following for complex coding tasks
- **License:** Llama 2 / other

```bash
ollama pull wizardcoder:34b
```

---

## Benchmark Comparison (HumanEval Pass@1)

| Model | HumanEval | MBPP | LiveCodeBench |
|-------|-----------|------|---------------|
| DeepSeek-Coder-V2 | 90.2% | 82.6% | — |
| Qwen2.5-Coder-72B | 88.4% | 83.5% | 43.5% |
| Claude Sonnet 4.6 | ~92% | ~85% | ~50% |
| GPT-4o | 90.2% | 87.1% | 45.8% |
| Codestral | 81.1% | 78.2% | — |
| CodeLlama-70B | 67.8% | 62.4% | — |
| StarCoder2-15B | 46.3% | 52.7% | — |
| Phi-4 (14B) | 82.6% | 70.8% | — |
| WizardCoder-34B | 73.2% | 68.2% | — |
