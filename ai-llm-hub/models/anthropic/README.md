# Anthropic — Claude Model Family

## Models

### Claude Sonnet 4.6 (`claude-sonnet-4-6`)
- **Context window:** 200,000 tokens (~150,000 words)
- **Output limit:** 8,192 tokens (standard) / 64K extended
- **Strengths:** Coding, analysis, instruction following, long-document QA
- **Tool use:** Full function calling + computer use
- **Vision:** Yes (images, PDFs, documents)
- **Pricing:** ~$3/M input · $15/M output
- **Best for:** Production coding assistant, complex reasoning tasks

### Claude Opus 4.8 (`claude-opus-4-8`)
- **Context window:** 200,000 tokens
- **Strengths:** Hardest reasoning tasks, nuanced writing, research
- **Tool use:** Full function calling + computer use
- **Pricing:** ~$15/M input · $75/M output
- **Best for:** Complex agentic workflows, deep analysis

### Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)
- **Context window:** 200,000 tokens
- **Strengths:** Speed, cost, high-volume tasks
- **Tool use:** Full function calling
- **Pricing:** ~$0.80/M input · $4/M output
- **Best for:** Fast chat, classification, summarization

## API Usage

```python
import anthropic

client = anthropic.Anthropic(api_key="ANTHROPIC_API_KEY")

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=8192,
    system="You are an expert software engineer.",
    messages=[
        {"role": "user", "content": "Write a binary search tree in Python."}
    ]
)
print(response.content[0].text)
```

## Tool Use (Function Calling)

```python
tools = [
    {
        "name": "execute_code",
        "description": "Execute Python code and return output",
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Python code to run"}
            },
            "required": ["code"]
        }
    }
]

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    tools=tools,
    messages=[{"role": "user", "content": "Calculate the first 20 Fibonacci numbers."}]
)
```

## Streaming

```python
with client.messages.stream(
    model="claude-sonnet-4-6",
    max_tokens=4096,
    messages=[{"role": "user", "content": "Explain async/await in Python."}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

## Capabilities
- Multi-turn conversation with memory
- Code generation, review, debugging, refactoring
- File reading (PDF, images, CSVs via vision)
- Computer use (browser, terminal automation)
- Agentic task execution
- Multilingual (English-first but supports 50+ languages)

## Links
- Docs: https://docs.anthropic.com
- API Reference: https://docs.anthropic.com/en/api
- Model IDs: https://docs.anthropic.com/en/docs/about-claude/models
- SDK: https://github.com/anthropics/anthropic-sdk-python
