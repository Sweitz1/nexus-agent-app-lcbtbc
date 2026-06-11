# All Major LLM Models — Complete Reference

## Model Comparison Matrix

| Model | Provider | Context | Code | Chat | Reasoning | Tool Use | Local | License |
|-------|----------|---------|------|------|-----------|----------|-------|---------|
| claude-sonnet-4-6 | Anthropic | 200K | ★★★★★ | ★★★★★ | ★★★★★ | ✓ | ✗ | Commercial |
| claude-opus-4-8 | Anthropic | 200K | ★★★★★ | ★★★★★ | ★★★★★ | ✓ | ✗ | Commercial |
| claude-haiku-4-5 | Anthropic | 200K | ★★★★ | ★★★★ | ★★★★ | ✓ | ✗ | Commercial |
| gpt-4o | OpenAI | 128K | ★★★★★ | ★★★★★ | ★★★★★ | ✓ | ✗ | Commercial |
| gpt-4o-mini | OpenAI | 128K | ★★★★ | ★★★★ | ★★★★ | ✓ | ✗ | Commercial |
| o3 | OpenAI | 200K | ★★★★★ | ★★★★ | ★★★★★ | ✓ | ✗ | Commercial |
| o3-mini | OpenAI | 200K | ★★★★★ | ★★★ | ★★★★★ | ✓ | ✗ | Commercial |
| gemini-2.0-flash | Google | 1M | ★★★★ | ★★★★ | ★★★★ | ✓ | ✗ | Commercial |
| gemini-1.5-pro | Google | 2M | ★★★★ | ★★★★ | ★★★★ | ✓ | ✗ | Commercial |
| mistral-large | Mistral | 128K | ★★★★★ | ★★★★ | ★★★★ | ✓ | ✗ | Commercial |
| codestral | Mistral | 256K | ★★★★★ | ★★★ | ★★★★ | ✓ | ✗ | Commercial |
| llama-3.1-405b | Meta | 128K | ★★★★★ | ★★★★★ | ★★★★★ | ✓ | ✓ | Llama 3 |
| llama-3.2-90b | Meta | 128K | ★★★★ | ★★★★★ | ★★★★ | ✓ | ✓ | Llama 3 |
| llama-3.2-11b | Meta | 128K | ★★★★ | ★★★★ | ★★★ | ✓ | ✓ | Llama 3 |
| deepseek-r1 | DeepSeek | 64K | ★★★★★ | ★★★★ | ★★★★★ | ✗ | ✓ | MIT |
| deepseek-coder-v2 | DeepSeek | 128K | ★★★★★ | ★★★ | ★★★★ | ✓ | ✓ | DeepSeek |
| qwen2.5-coder-72b | Alibaba | 128K | ★★★★★ | ★★★★ | ★★★★ | ✓ | ✓ | Qwen |
| phi-4 | Microsoft | 16K | ★★★★ | ★★★★ | ★★★★★ | ✓ | ✓ | MIT |
| mistral-7b | Mistral | 32K | ★★★ | ★★★★ | ★★★ | ✓ | ✓ | Apache 2.0 |
| mixtral-8x22b | Mistral | 64K | ★★★★★ | ★★★★★ | ★★★★★ | ✓ | ✓ | Apache 2.0 |
| codellama-34b | Meta | 100K | ★★★★★ | ★★★ | ★★★★ | ✗ | ✓ | Llama 2 |
| starcoder2-15b | BigCode | 16K | ★★★★★ | ★★ | ★★★ | ✗ | ✓ | BigCode |
| falcon-180b | TII | 2K | ★★★ | ★★★★ | ★★★ | ✗ | ✓ | Falcon |
| yi-34b | 01.AI | 200K | ★★★★ | ★★★★ | ★★★★ | ✗ | ✓ | Yi |
| gemma-2-27b | Google | 8K | ★★★★ | ★★★★ | ★★★★ | ✗ | ✓ | Gemma |

---

See subdirectories for full specs on each model family:
- [anthropic/](./anthropic/) — Claude models
- [openai/](./openai/) — GPT-4, o1, o3
- [meta/](./meta/) — LLaMA family
- [mistral/](./mistral/) — Mistral & Mixtral
- [google/](./google/) — Gemini & Gemma
- [deepseek/](./deepseek/) — DeepSeek Coder & R1
- [coding-models/](./coding-models/) — CodeLlama, StarCoder, Qwen Coder
- [microsoft/](./microsoft/) — Phi family
