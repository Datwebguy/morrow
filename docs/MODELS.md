# Decision provider configuration

Morrow uses a configurable decision provider to classify situations before a market reopening. The provider may return one of four decisions: do nothing, alert, pay down, or add backing. It never sets an amount; deterministic application code sizes and validates every action.

## Configuration

Set these variables on the worker host only:

| Variable | Purpose |
|---|---|
| `LLM_BASE_URL` | Base URL for an OpenAI-compatible chat-completions service. |
| `LLM_MODEL` | Model identifier accepted by that service. |
| `LLM_API_KEY` | Provider credential. Store it only in the host's secret-variable settings. |
| `LLM_PROVIDER` | Optional provider selector when a provider needs explicit selection. |

The legacy names `MODEL_BASE_URL`, `MODEL_NAME`, and `MODEL_API_KEY` remain supported for existing deployments. The `LLM_` variables take precedence when both forms are present.

If no provider is configured, Morrow uses its deterministic rules advisor. This is a safe operating mode: unclear, unavailable, or invalid provider responses become alerts and never become actions.

## Anthropic (Claude)

Set `LLM_PROVIDER=anthropic` and `LLM_API_KEY` to an Anthropic key. The worker then uses Anthropic's official SDK, defaults to `claude-sonnet-5-5` at medium effort, and ignores any leftover non-Claude address or model name. `LLM_MODEL` can pick another Claude model.

## Safety boundary

The decision provider can recommend only:

- no action;
- an alert;
- paying down part of the borrowed coin; or
- adding more of the existing backing token.

Application code independently enforces the amount, user limits, available balance, price-trust checks, pause state, and the rules that prevent selling backing, borrowing, withdrawing, or removing backing.

## Failure behavior

A timeout, network failure, invalid response, refusal, or unclear recommendation becomes an alert. It does not stop the monitoring cycle and cannot authorize an action by itself.

The worker's health endpoint reports whether a decision provider is configured. It does not expose credentials or provider response content.
