# LLM Benchmarks Reference

## Coding Benchmarks

### HumanEval (Pass@1) — Python function synthesis
| Model | Score |
|-------|-------|
| Claude Sonnet 4.6 | ~92% |
| GPT-4o | 90.2% |
| o3-mini (high) | 92.7% |
| DeepSeek-R1 | 92.7% |
| DeepSeek-Coder-V2 | 90.2% |
| Qwen2.5-Coder-72B | 88.4% |
| Mistral Large 2 | 92.1% |
| Codestral | 81.1% |
| LLaMA 3.1 405B | 89.0% |
| Phi-4 | 82.6% |
| Mixtral 8x22B | 75.0% |
| CodeLlama 70B | 67.8% |
| StarCoder2-15B | 46.3% |
| Mistral 7B | 26.2% |

### LiveCodeBench — Real contest problems (harder)
| Model | Score |
|-------|-------|
| o3 | ~70% |
| DeepSeek-R1 | ~65% |
| Claude Sonnet 4.6 | ~50% |
| GPT-4o | 45.8% |
| Qwen2.5-Coder-72B | 43.5% |

### SWE-bench Verified — Real GitHub issues
| Model | Resolved % |
|-------|-----------|
| Claude Sonnet 3.7 (w/ tools) | 70.3% |
| GPT-4o (w/ SWE-agent) | 38.8% |
| DeepSeek-V3 | 42.0% |
| LLaMA 3.1 405B | 25.0% |

## General Intelligence

### MMLU — Knowledge across 57 subjects
| Model | Score |
|-------|-------|
| GPT-4o | 88.7% |
| Claude Opus 4.8 | ~90% |
| o3 | 92.3% |
| DeepSeek-R1 | 90.8% |
| LLaMA 3.1 405B | 88.6% |
| Mistral Large 2 | 84.0% |
| Mixtral 8x22B | 77.8% |
| Qwen2.5-72B | 85.0% |
| Phi-4 | 84.8% |
| Mistral 7B | 62.5% |

### GPQA Diamond — Graduate-level science Q&A
| Model | Score |
|-------|-------|
| o3 | 87.7% |
| Claude Opus 4.8 | ~80% |
| DeepSeek-R1 | 71.5% |
| GPT-4o | 53.6% |
| LLaMA 3.1 405B | 51.1% |
| Phi-4 | 56.1% |

## Math Reasoning

### MATH-500
| Model | Score |
|-------|-------|
| o3 | 97.8% |
| DeepSeek-R1 | 97.3% |
| Claude Sonnet 4.6 | ~80% |
| GPT-4o | 76.6% |
| Phi-4 | 80.4% |

### AIME 2024 (AMC12 competition)
| Model | Score |
|-------|-------|
| o3 | 91.6% |
| DeepSeek-R1 | 79.8% |
| o3-mini (high) | 63.6% |
| GPT-4o | 9.3% |
| Claude 3.5 Sonnet | 16.0% |

## Long Context

### RULER (needle-in-haystack at scale)
| Model | Context | Score |
|-------|---------|-------|
| Gemini 1.5 Pro | 1M | 94.4% |
| Claude 3.5 Sonnet | 200K | 91.0% |
| GPT-4o | 128K | 91.2% |
| LLaMA 3.1 405B | 128K | 88.5% |

## Choosing the Right Model

| Use Case | Best Model | Runner-up |
|----------|-----------|-----------|
| Production coding (API) | Claude Sonnet 4.6 | GPT-4o |
| Hard competitive coding | o3 | DeepSeek-R1 |
| Local coding (GPU) | DeepSeek-Coder-V2 | Qwen2.5-Coder-32B |
| Local coding (CPU/small GPU) | Phi-4 | Qwen2.5-Coder-7B |
| Chat assistant (API) | Claude Haiku 4.5 | GPT-4o-mini |
| Chat (local) | LLaMA 3.2 | Mistral 7B |
| Long document analysis | Gemini 1.5 Pro | Claude |
| Math & reasoning | o3 | DeepSeek-R1 |
| Code autocomplete (IDE) | Codestral | StarCoder2 |
