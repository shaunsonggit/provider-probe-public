[English README](./README.md)

# 🔍 Provider Probe — AI 编程助手技能

> 一个 AI 编程助手技能，用于探测 LLM 供应商的真实身份、隐藏的系统提示词和 token 开销。

## 这是什么？

Provider Probe 是一个为 [OpenClaw](https://github.com/nicepkg/openclaw) 等 AI 编程助手设计的 **skill（技能）**。安装后，你的 AI 助手将能够向任何已配置的 LLM 供应商发送最简化的、零上下文的 API 请求，从而揭示供应商是否在暗中：

- 🎭 **套壳换名** — 把 Claude 包装成自己的品牌模型
- 🔐 **注入隐藏系统提示词** — 偷偷在请求中添加你看不到的 system prompt
- 📊 **产生额外 token 开销** — 导致你多花冤枉钱

## 🧩 安装为技能

### OpenClaw 用户

将此文件夹复制到 OpenClaw 的 skills 目录：

```
~/.openclaw/skills/provider-probe-public/
├── SKILL.md
└── scripts/
    └── probe.js
```

或直接克隆：

```bash
git clone https://github.com/<your-username>/provider-probe-public.git ~/.openclaw/skills/provider-probe-public
```

### 其他 AI 助手

本技能使用通用结构（`SKILL.md` + `scripts/`），适配方法：

1. 将此文件夹放置到你的助手的 skill 目录中
2. 确保助手可以读取 `SKILL.md` 获取使用说明
3. 助手需要有权限执行 `node scripts/probe.js`

## 💬 使用方式（与 AI 助手对话）

安装完成后，直接用自然语言跟 AI 助手说：

```
"探测一下 gac-claude 这个供应商"
"测试一下 moonshot 是不是在用 GPT 套壳"
"探测所有供应商，对比一下结果"
"检查一下我的 LLM 供应商有没有注入隐藏的系统提示词"
```

AI 助手会自动读取技能说明，运行相应的探测命令。

### 手动命令行使用

也可以直接运行脚本：

```bash
# 探测单个供应商
node scripts/probe.js <供应商名称> [提示词]

# 探测所有已配置的供应商
node scripts/probe.js --all [提示词]
```

示例：

```bash
node scripts/probe.js gac-claude
node scripts/probe.js gac-claude "你是谁"
node scripts/probe.js --all
```

## ✨ 能检测什么

| 信号 | 含义 |
|------|------|
| `input_tokens` 远超预期 | 供应商正在**注入隐藏的系统提示词** |
| 模型自称是 "Kiro/xxx" | 供应商在**套壳换名** |
| 模型自称是 "Claude/GPT" | 可能是干净的直通代理 |
| 低开销（~0-20 tokens） | 未检测到隐藏注入 |

## ⚙️ 工作原理

1. **读取供应商配置** — 从本地 `~/.openclaw/openclaw.json`（或 `$OPENCLAW_CONFIG` 环境变量）
2. **发送单条消息请求** — **不携带任何 system prompt**，仅发送一条用户消息（默认：`你是谁`）
3. **分析响应**：
   - 📝 模型的自我介绍（回复内容）
   - 📊 实际 `input_tokens` 与预期对比（暴露隐藏 system prompt 大小）
   - 🏷️ 检测到的 API 类型（Anthropic Messages / OpenAI Chat）
4. **识别模型身份** — 支持检测：Claude、GPT、Gemini、Kiro、DeepSeek、Qwen、Kimi、Llama、MiniMax

## 📋 前置条件

- [Node.js](https://nodejs.org/) v14+
- 在 `~/.openclaw/openclaw.json` 中配置好供应商信息：

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

## 🔧 支持的 API 类型

| API 类型 | 说明 |
|----------|------|
| `anthropic-messages` | Anthropic Messages API |
| `openai-chat` / `openai` | OpenAI Chat Completions API |

根据供应商配置中的 `api` 字段自动检测，默认为 `openai-chat`。

## ⚠️ 安全说明

- **不嵌入密钥** — 仅在运行时从本地配置文件读取 API 密钥
- **自动脱敏** — 输出内容会自动遮蔽 API 密钥、Bearer token 等敏感信息
- **切勿分享你的 `openclaw.json`** — 它包含你的 API 密钥

## 📄 许可证

MIT
