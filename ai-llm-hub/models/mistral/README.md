# Mistral AI — Model Family

## Models

### Mistral Large 2 (`mistral-large-latest`)
- **Context:** 128K tokens
- **Strengths:** Coding, multilingual (dozens of languages), function calling
- **License:** Commercial (MRL)
- **Best for:** Production API, coding assistant

### Codestral (`codestral-latest`)
- **Context:** 256K tokens
- **Strengths:** Code-first — fill-in-the-middle (FIM), 80+ languages
- **Best for:** IDE autocomplete, code generation, code review

### Mistral Small (`mistral-small-latest`)
- **Context:** 128K tokens
- **Strengths:** Fast, cheap, good reasoning
- **Best for:** High-volume classification, summarization

### Mixtral 8x22B (open weights)
- **Context:** 64K tokens
- **Params:** 141B (8 experts, 39B active)
- **Strengths:** Flagship open model, matches GPT-4 on most tasks
- **License:** Apache 2.0
- **VRAM:** ~90GB for full precision

### Mixtral 8x7B (open weights)
- **Context:** 32K tokens
- **Params:** 46.7B (8 experts, 12.9B active)
- **Strengths:** Fast, efficient, great quality-per-compute
- **License:** Apache 2.0
- **VRAM:** ~26GB

### Mistral 7B v0.3 (open weights)
- **Context:** 32K tokens
- **Strengths:** Smallest useful Mistral, runs on 8GB GPU
- **License:** Apache 2.0

## API Usage

```python
from mistralai import Mistral

client = Mistral(api_key="MISTRAL_API_KEY")

response = client.chat.complete(
    model="mistral-large-latest",
    messages=[
        {"role": "system", "content": "You are an expert software engineer."},
        {"role": "user", "content": "Implement a thread-safe LRU cache in Python."}
    ]
)
print(response.choices[0].message.content)
```

## Codestral (Code Completion / FIM)

```python
# Fill-in-the-middle for IDE-style completion
response = client.fim.complete(
    model="codestral-latest",
    prompt="def binary_search(arr, target):\n    ",
    suffix="\n    return -1",
    max_tokens=512
)
print(response.choices[0].message.content)
```

## Function Calling

```python
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_code_review",
            "description": "Review code for bugs and improvements",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"},
                    "language": {"type": "string"}
                },
                "required": ["code", "language"]
            }
        }
    }
]

response = client.chat.complete(
    model="mistral-large-latest",
    messages=[{"role": "user", "content": "Review this Python code..."}],
    tools=tools,
    tool_choice="auto"
)
```

## Run Locally via Ollama

```bash
ollama pull mistral           # Mistral 7B
ollama pull mixtral           # Mixtral 8x7B
ollama pull mixtral:8x22b     # Mixtral 8x22B
ollama pull codestral         # Codestral

ollama run codestral
```

## Benchmark Scores

| Model | MMLU | HumanEval | GSM8K |
|-------|------|-----------|-------|
| Mistral Large 2 | 84.0% | 92.1% | 93.0% |
| Codestral | — | 81.1% | — |
| Mixtral 8x22B | 77.8% | 75.0% | 88.2% |
| Mixtral 8x7B | 70.6% | 40.2% | 74.4% |
| Mistral 7B | 62.5% | 26.2% | 52.1% |

## Links
- Platform: https://console.mistral.ai
- Docs: https://docs.mistral.ai
- HuggingFace: https://huggingface.co/mistralai
- GitHub: https://github.com/mistralai
