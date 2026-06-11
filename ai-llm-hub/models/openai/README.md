# OpenAI — Model Family

## Models

### GPT-4o (`gpt-4o`)
- **Context window:** 128,000 tokens
- **Output limit:** 16,384 tokens
- **Strengths:** General intelligence, vision, audio, tool use
- **Modalities:** Text, image, audio input; text + audio output
- **Pricing:** ~$5/M input · $15/M output
- **Best for:** General coding assistant, multimodal tasks

### GPT-4o Mini (`gpt-4o-mini`)
- **Context window:** 128,000 tokens
- **Pricing:** ~$0.15/M input · $0.60/M output
- **Best for:** High-volume, cost-sensitive tasks

### o3 (`o3`)
- **Context window:** 200,000 tokens
- **Strengths:** Frontier reasoning, math, competitive coding
- **Reasoning tokens:** Uses internal chain-of-thought (billed separately)
- **Best for:** Hard algorithmic problems, STEM research

### o3-mini (`o3-mini`)
- **Context window:** 200,000 tokens
- **Strengths:** Coding, math reasoning at lower cost
- **Reasoning effort:** low / medium / high
- **Best for:** Coding tasks requiring step-by-step reasoning

## API Usage

```python
from openai import OpenAI

client = OpenAI(api_key="OPENAI_API_KEY")

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are an expert software engineer."},
        {"role": "user", "content": "Write a Redis-backed rate limiter in Python."}
    ],
    max_tokens=4096
)
print(response.choices[0].message.content)
```

## Tool / Function Calling

```python
tools = [
    {
        "type": "function",
        "function": {
            "name": "run_python",
            "description": "Execute Python code",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"}
                },
                "required": ["code"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Sort a list of dicts by nested key."}],
    tools=tools,
    tool_choice="auto"
)
```

## Structured Output

```python
from pydantic import BaseModel

class CodeResponse(BaseModel):
    language: str
    code: str
    explanation: str

response = client.beta.chat.completions.parse(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Write a quicksort implementation."}],
    response_format=CodeResponse
)
parsed = response.choices[0].message.parsed
```

## o3 Reasoning

```python
response = client.chat.completions.create(
    model="o3-mini",
    reasoning_effort="high",
    messages=[{"role": "user", "content": "Solve this dynamic programming problem..."}]
)
```

## Links
- Docs: https://platform.openai.com/docs
- Models: https://platform.openai.com/docs/models
- SDK: https://github.com/openai/openai-python
