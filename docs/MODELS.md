# Choosing the AI model

Morrow's AI makes one choice per loan that needs attention: do nothing, alert, pay down, or add backing. It never sets an amount. Code sizes every action and checks every rule, so the model can be swapped without touching the safety layer (`docs/RISKS.md`).

## The three settings

Set these on the worker (Railway, Variables). Nothing else changes when you switch model.

| Variable | What it is |
|---|---|
| `LLM_BASE_URL` | The provider's chat-completions base address |
| `LLM_MODEL` | The model name the provider uses |
| `LLM_API_KEY` | Your key for that provider. Type it into the host's variables page only |

The older names `MODEL_BASE_URL`, `MODEL_NAME` and `MODEL_API_KEY` still work. The `LLM_` names win when both are set. With none set, Morrow runs "rules only" and every log line says so.

## Which model is running

`GET /public/health` on the worker returns `model`: the name in `LLM_MODEL`, or `rules only`. Every logged decision also records the model that made it. The submission names the model that actually made the logged decisions.

## Providers

Any host that accepts the common chat-completions request format works. Base addresses, from each provider's own documentation (only the first row was checked against the provider's page for this project; the others have not been run here):

| Provider | `LLM_BASE_URL` | Example `LLM_MODEL` |
|---|---|---|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.8-flash` (Google's current fast model, per its models page, 5 Oct 2026) |
| OpenAI | `https://api.openai.com/v1` | a current OpenAI model name |
| Qwen (Alibaba Model Studio) | the compatible-mode address in your account | `qwen3.8-max` was reported by another builder, not Bitget. Check the details Bitget sends |
| OpenRouter | `https://openrouter.ai/api/v1` | any listed model |
| Groq | `https://api.groq.com/openai/v1` | any listed model |
| Anthropic | `https://api.anthropic.com/v1/` (its compatibility layer) | a current Claude model name |
| A local model (Ollama) | `http://localhost:11434/v1` | the local model name |

## What happens when the model fails

A timeout (25 seconds), a network error, a non-answer or an unclear answer becomes an alert. It never becomes an action, and it never stops the cycle.
