# Meta — LLaMA Model Family

## Models

### LLaMA 3.1 405B
- **Context:** 128K tokens
- **Params:** 405 billion
- **Strengths:** Frontier open-source, matches GPT-4 on many benchmarks
- **License:** Llama 3.1 Community License
- **Run locally:** Requires ~810GB VRAM (8x H100)
- **Cloud:** Available via Together.ai, Fireworks, AWS Bedrock

### LLaMA 3.2 90B Vision
- **Context:** 128K tokens
- **Params:** 90 billion
- **Strengths:** Vision + text, strong multilingual
- **VRAM:** ~180GB (2x H100)

### LLaMA 3.2 11B Vision
- **Context:** 128K tokens
- **Params:** 11 billion
- **Strengths:** Vision, runs on single A100 80GB
- **VRAM:** ~22GB

### LLaMA 3.2 3B / 1B
- **Context:** 128K tokens
- **Strengths:** On-device, edge deployment
- **VRAM:** 6-8GB (3B), 2-4GB (1B)

## Run Locally via Ollama

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull and run LLaMA
ollama pull llama3.2
ollama run llama3.2

# Larger models
ollama pull llama3.1:70b
ollama run llama3.1:70b
```

## Python via Ollama API

```python
import ollama

response = ollama.chat(
    model="llama3.2",
    messages=[
        {"role": "system", "content": "You are an expert programmer."},
        {"role": "user", "content": "Write a REST API in FastAPI with JWT auth."}
    ]
)
print(response["message"]["content"])
```

## Python via HuggingFace Transformers

```python
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

model_id = "meta-llama/Llama-3.1-8B-Instruct"

tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    torch_dtype=torch.bfloat16,
    device_map="auto"
)

messages = [
    {"role": "system", "content": "You are a coding assistant."},
    {"role": "user", "content": "Implement a linked list in Python."}
]

input_ids = tokenizer.apply_chat_template(
    messages,
    add_generation_prompt=True,
    return_tensors="pt"
).to(model.device)

output = model.generate(input_ids, max_new_tokens=2048, temperature=0.7)
print(tokenizer.decode(output[0][input_ids.shape[-1]:], skip_special_tokens=True))
```

## Via Together.ai (hosted)

```python
from openai import OpenAI

client = OpenAI(
    api_key="TOGETHER_API_KEY",
    base_url="https://api.together.xyz/v1"
)

response = client.chat.completions.create(
    model="meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
    messages=[{"role": "user", "content": "Write a binary search."}]
)
```

## Benchmark Scores (LLaMA 3.1 405B)
| Benchmark | Score |
|-----------|-------|
| MMLU | 88.6% |
| HumanEval | 89.0% |
| GSM8K | 96.8% |
| MATH | 73.8% |
| GPQA | 51.1% |

## Links
- Meta AI: https://ai.meta.com/llama/
- HuggingFace: https://huggingface.co/meta-llama
- Ollama library: https://ollama.ai/library/llama3.2
- GitHub: https://github.com/meta-llama/llama
