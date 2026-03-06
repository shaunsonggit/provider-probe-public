---
name: provider-probe-public
description: Publishable version of provider-probe. Send bare/minimal API requests to LLM providers to probe their real identity, hidden system prompt injection, and token overhead, without embedding any API keys in the skill itself. Use for sharing with others and for testing if a provider is rebranding/proxying another model (e.g. Claude → Kiro).
---

# Provider Probe (Public)

This folder is safe to share.

- It does **not** contain your API keys.
- It reads keys at runtime from your local `openclaw.json`.
- Do **not** share your `openclaw.json`.

Send a zero-context request to an LLM provider and analyze the response for identity leaks and hidden prompt injection.

## Quick Start

```bash
node scripts/probe.js <provider-name> [prompt]
```

- `provider-name`: key under `models.providers` in `~/.openclaw/openclaw.json`
- `prompt`: optional, defaults to `你是谁`

Example:
```bash
node scripts/probe.js gac-claude
node scripts/probe.js gac-claude "What model are you?"
node scripts/probe.js moonshot "你是谁"
```

## What It Does

1. Reads provider config (baseUrl, apiKey, api type) from your local `~/.openclaw/openclaw.json` (or `$OPENCLAW_CONFIG` if set)
   - Do NOT share your `openclaw.json` publicly (it contains API keys).
2. Sends a single-message request with NO system prompt
3. Reports:
   - Model's self-identification (the reply text)
   - `input_tokens` vs expected (reveals hidden system prompt size)
   - Provider API type detected (anthropic-messages / openai-chat)

## Interpreting Results

- **input_tokens >> expected**: provider is injecting a hidden system prompt
- **Model says "I'm Kiro/xxx"** instead of its real identity: provider is rebranding
- **Model says "I'm Claude/GPT/etc"**: likely clean or lightly wrapped

## Multi-Provider Batch

```bash
node scripts/probe.js --all [prompt]
```

Probes every provider in config and outputs a comparison table.

## Supported API Types

- `anthropic-messages` → Anthropic Messages API format
- `openai-chat` / `openai` → OpenAI Chat Completions format
- Auto-detected from provider config `api` field; falls back to openai-chat
