[中文](./README.md)

# 🔍 Provider Probe — AI Coding Assistant Skill

> An AI coding assistant skill that probes LLM providers to reveal their real identity, hidden system prompts, and token overhead.

## What Is This?

Provider Probe is a **skill** designed for AI coding assistants like [OpenClaw](https://github.com/nicepkg/openclaw). When installed, your AI assistant gains the ability to probe any configured LLM provider with minimal, zero-context API requests — uncovering whether a provider is secretly rebranding models, injecting hidden system prompts, or adding unexpected token overhead.

## 🧩 Installing as a Skill

### For OpenClaw

Copy this folder into your OpenClaw skills directory:

```
~/.openclaw/skills/provider-probe-public/
├── SKILL.md
└── scripts/
    └── probe.js
```

Or clone directly:

```bash
git clone https://github.com/shaunsonggit/provider-probe-public.git ~/.openclaw/skills/provider-probe-public
```

### For Other AI Assistants

This skill follows a common structure (`SKILL.md` + `scripts/`). To adapt it:

1. Place this folder in your assistant's skill directory
2. Ensure the assistant can read `SKILL.md` for instructions
3. The assistant needs access to run `node scripts/probe.js`

## 💬 Usage (Talking to Your AI Assistant)

Once installed, simply ask your AI assistant in natural language:

```
"Probe the gac-claude provider"
"Test if moonshot is actually using GPT under the hood"
"Probe all my providers and compare the results"
"Check if my LLM provider is injecting hidden system prompts"
```

Your AI assistant will read the skill instructions and run the appropriate probe commands for you.

### Manual CLI Usage

You can also run the probe script directly:

```bash
# Probe a single provider
node scripts/probe.js <provider-name> [prompt]

# Probe all configured providers
node scripts/probe.js --all [prompt]
```

Examples:

```bash
node scripts/probe.js gac-claude
node scripts/probe.js gac-claude "What model are you?"
node scripts/probe.js --all
```

## ✨ What It Detects

| Signal | Meaning |
|--------|---------|
| `input_tokens >> expected` | Provider is injecting a **hidden system prompt** |
| Model says "I'm Kiro/xxx" | Provider is **rebranding** the underlying model |
| Model says "I'm Claude/GPT" | Likely a clean pass-through |
| Low overhead (~0-20 tokens) | No hidden injection detected |

## ⚙️ How It Works

1. **Reads provider config** from `~/.openclaw/openclaw.json` (or `$OPENCLAW_CONFIG`)
2. **Sends a single-message request** with **NO system prompt** — just a bare user prompt (default: `你是谁`)
3. **Analyzes the response**:
   - 📝 Model's self-identification (the reply text)
   - 📊 `input_tokens` vs expected (reveals hidden system prompt size)
   - 🏷️ Provider API type detected (Anthropic Messages / OpenAI Chat)
4. **Reports findings** with identity detection for: Claude, GPT, Gemini, Kiro, DeepSeek, Qwen, Kimi, Llama, MiniMax

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) v14+
- Provider config in `~/.openclaw/openclaw.json`:

```json
{
  "models": {
    "providers": {
      "my-provider": {
        "baseUrl": "https://api.example.com",
        "apiKey": "your-api-key",
        "api": "openai-chat",
        "models": [{ "id": "gpt-4" }]
      }
    }
  }
}
```

## 🔧 Supported API Types

| API Type | Description |
|----------|-------------|
| `anthropic-messages` | Anthropic Messages API |
| `openai-chat` / `openai` | OpenAI Chat Completions API |

Auto-detected from the provider config `api` field; defaults to `openai-chat`.

## ⚠️ Security

- **No embedded keys** — reads API keys from your local config at runtime only
- **Auto-redaction** — output automatically redacts API keys, Bearer tokens, and secret patterns
- **Do NOT share your `openclaw.json`** — it contains your API keys

## 📄 License

MIT
