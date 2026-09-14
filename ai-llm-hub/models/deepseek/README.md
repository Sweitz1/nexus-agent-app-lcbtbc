# DeepSeek — Model Family

## Models

### DeepSeek-R1
- **Context:** 64K tokens
- **Params:** 671B (MoE, 37B active)
- **Strengths:** Frontier reasoning — matches o1 on math/coding benchmarks
- **License:** MIT (fully open weights)
- **Distilled variants:** R1-Distill-Llama-70B, R1-Distill-Qwen-32B, R1-Distill-Llama-8B
- **Special:** Exposes chain-of-thought reasoning tokens (think tokens)

### DeepSeek-V3
- **Context:** 128K tokens
- **Params:** 671B (MoE, 37B active)
- **Strengths:** General coding + chat, top open-source on coding benchmarks
- **License:** DeepSeek License

### DeepSeek-Coder-V2
- **Context:** 128K tokens
- **Params:** 236B (MoE, 21B active) / 16B dense
- **Strengths:** Best open-source coding model — outperforms GPT-4 on HumanEval
- **Languages:** 338 programming languages
- **License:** DeepSeek

### DeepSeek-Coder 6.7B / 33B
- **Context:** 16K tokens
- **Strengths:** Fast, efficient code completion and generation
- **Good for:** Local deployment on consumer GPUs

## Run via Ollama

```bash
ollama pull deepseek-r1:7b       # Small reasoning model
ollama pull deepseek-r1:32b      # Larger reasoning model
ollama pull deepseek-coder-v2    # Coding specialist
ollama pull deepseek-v3          # General purpose

ollama run deepseek-coder-v2
```

## Python — R1 with Reasoning

```python
import ollama

response = ollama.chat(
    model="deepseek-r1:32b",
    messages=[{"role": "user", "content": "Implement a red-black tree with all rotations."}],
    options={"temperature": 0.6}
)

# R1 returns <think>...</think> reasoning + final answer
print(response["message"]["content"])
```

## Via DeepSeek API (OpenAI-compatible)

```python
from openai import OpenAI

client = OpenAI(
    api_key="DEEPSEEK_API_KEY",
    base_url="https://api.deepseek.com/v1"
)

response = client.chat.completions.create(
    model="deepseek-reasoner",   # R1
    messages=[{"role": "user", "content": "Design a distributed rate limiter."}]
)
```

## HuggingFace

```python
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

model_id = "deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct"  # 16B
tokenizer = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    torch_dtype=torch.bfloat16,
    device_map="auto",
    trust_remote_code=True
)

messages = [{"role": "user", "content": "Write a Rust async TCP server."}]
inputs = tokenizer.apply_chat_template(messages, return_tensors="pt", add_generation_prompt=True)
output = model.generate(inputs.to(model.device), max_new_tokens=2048)
print(tokenizer.decode(output[0][inputs.shape[-1]:], skip_special_tokens=True))
```

## Benchmark Scores

### DeepSeek-R1 vs Competitors
| Benchmark | DeepSeek-R1 | OpenAI o1 | Claude 3.5 |
|-----------|-------------|-----------|------------|
| AIME 2024 | 79.8% | 79.2% | 16.0% |
| MATH-500 | 97.3% | 96.4% | 78.3% |
| HumanEval | 92.7% | 92.4% | 92.0% |
| Codeforces | 2029 ELO | 1891 ELO | — |
| MMLU | 90.8% | 91.8% | 88.7% |

## Links
- HuggingFace: https://huggingface.co/deepseek-ai
- API: https://platform.deepseek.com
- GitHub: https://github.com/deepseek-ai/DeepSeek-R1
- Paper (R1): https://arxiv.org/abs/2501.12948
