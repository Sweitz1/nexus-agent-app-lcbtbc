# LLM Capabilities & Skills Matrix

## Skill Coverage by Model

| Capability | Claude | GPT-4o | o3 | LLaMA 3.1 | DeepSeek-R1 | Mistral L | Qwen2.5-C |
|------------|--------|--------|-----|-----------|-------------|-----------|-----------|
| Code generation | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★★★★ | ★★★★★ | ★★★★★ |
| Code review | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★★★ |
| Debugging | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★★ |
| Refactoring | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★★★ |
| Unit tests | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★★★ |
| Architecture | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ | ★★★ | ★★★★ | ★★★ |
| Math reasoning | ★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★★ |
| Long context | ★★★★★ | ★★★★ | ★★★★ | ★★★★ | ★★★ | ★★★★ | ★★★★ |
| Tool use | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★ | ★★★ | ★★★★★ | ★★★★ |
| Conversation | ★★★★★ | ★★★★★ | ★★★ | ★★★★★ | ★★★ | ★★★★ | ★★★★ |
| RAG | ★★★★★ | ★★★★★ | ★★★★ | ★★★★ | ★★★ | ★★★★ | ★★★★ |
| Multilingual | ★★★★ | ★★★★★ | ★★★★ | ★★★★★ | ★★★★ | ★★★★★ | ★★★★★ |
| Vision | ★★★★★ | ★★★★★ | ✗ | ★★★★ | ✗ | ✗ | ✗ |
| Streaming | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Local | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Open weights | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |

---

## Detailed Skill Categories

### Coding Skills
See [coding-skills.md](./coding-skills.md)
- Code generation (all languages)
- Fill-in-the-middle / autocomplete
- Code review and security auditing
- Debugging and root-cause analysis
- Refactoring and optimization
- Test generation (unit, integration, e2e)
- Documentation generation
- API design
- Database schema design
- Architecture diagrams (Mermaid, PlantUML)

### Chat & Conversation Skills
See [chat-skills.md](./chat-skills.md)
- Multi-turn dialogue with memory
- Persona/character consistency
- Instruction following
- Summarization
- Q&A over documents
- Translation
- Tone adaptation

### Reasoning Skills
- Step-by-step chain-of-thought
- Math and algorithm proofs
- Logical deduction
- Hypothesis testing
- Competitive programming (o3, DeepSeek-R1)

### Agentic Skills
- Tool / function calling
- Multi-step task planning
- Web search integration
- Code execution
- Computer use (Claude)
- Browser automation

---

## Context Window Comparison

| Model | Context | Notes |
|-------|---------|-------|
| Gemini 1.5 Pro | 2,000,000 | Largest available |
| Gemini 2.0 Flash | 1,000,000 | |
| Claude 3.x / 4.x | 200,000 | High recall across full window |
| GPT-4o | 128,000 | |
| o3 | 200,000 | |
| LLaMA 3.1 | 128,000 | |
| Mistral Large | 128,000 | |
| Codestral | 256,000 | |
| DeepSeek-V3 | 128,000 | |
| DeepSeek-R1 | 64,000 | |
| Mixtral 8x22B | 64,000 | |
| Mixtral 8x7B | 32,000 | |
| Phi-4 | 16,000 | |
| Mistral 7B | 32,000 | |

---

## Benchmark Reference
See [benchmarks.md](./benchmarks.md)
