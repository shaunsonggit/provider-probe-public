#!/usr/bin/env node
// provider-probe-public: send a bare request to an LLM provider, analyze identity & hidden prompt injection
// Usage: node probe.js <provider-name|--all> [prompt]
// Notes: this script does NOT embed any keys; it reads provider keys from your local config file.

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const CONFIG_PATH = process.env.OPENCLAW_CONFIG || path.join(process.env.HOME, '.openclaw/openclaw.json');
const DEFAULT_PROMPT = '你是谁';

const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', dim: '\x1b[2m'
};

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function getProviders(cfg) {
  return (cfg.models && cfg.models.providers) || {};
}

function estimatePromptTokens(text) {
  // rough: CJK chars ~1.5 tok each, ASCII words ~1.3 tok each
  const cjk = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const ascii = text.length - cjk;
  return Math.ceil(cjk * 1.5 + ascii / 3.5);
}

function redactText(input, secrets = []) {
  let s = String(input ?? '');
  // redact explicit secrets first
  for (const sec of secrets) {
    if (sec && typeof sec === 'string' && sec.length >= 8) {
      s = s.split(sec).join('[REDACTED]');
    }
  }
  // common key-like patterns
  s = s.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[REDACTED]');
  s = s.replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, 'Bearer [REDACTED]');
  s = s.replace(/"x-api-key"\s*:\s*"[^"]+"/gi, '"x-api-key":"[REDACTED]"');
  s = s.replace(/"apiKey"\s*:\s*"[^"]+"/gi, '"apiKey":"[REDACTED]"');
  return s;
}

function fetch(url, options, body) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function probeProvider(name, provCfg, prompt) {
  const modelId = (provCfg.models && provCfg.models[0] && provCfg.models[0].id) || provCfg.model || 'unknown';
  const apiType = provCfg.api || 'openai-chat';
  const baseUrl = (provCfg.baseUrl || provCfg.baseURL || '').replace(/\/+$/, '');
  const apiKey = provCfg.apiKey || '';
  const secrets = [apiKey];
  console.log(`\n${C.cyan}━━━ Probing: ${name} ━━━${C.reset}`);
  console.log(`  Provider:  ${name}`);
  console.log(`  Model:     ${modelId}`);
  console.log(`  API type:  ${apiType}`);
  console.log(`  Base URL:  ${baseUrl}`);
  console.log(`  Prompt:    ${prompt}\n`);

  let url, headers, payload;
  const isAnthropic = apiType.startsWith('anthropic');

  if (isAnthropic) {
    url = `${baseUrl}/v1/messages`;
    headers = {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01'
    };
    payload = JSON.stringify({
      model: modelId,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    });
  } else {
    // OpenAI-compatible: if baseUrl already ends with /v1, don't double it
    const hasV1 = /\/v1\/?$/.test(baseUrl);
    url = hasV1 ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json'
    };
    payload = JSON.stringify({
      model: modelId,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    });
  }

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers }, payload);
  } catch (e) {
    console.log(`  ${C.red}✗ Request failed: ${e.message}${C.reset}`);
    return { provider: name, model: modelId, error: e.message };
  }

  let json;
  try {
    json = JSON.parse(res.body);
  } catch {
    console.log(`  ${C.red}✗ Invalid JSON (HTTP ${res.status}):${C.reset}`);
    console.log(`  ${redactText(res.body.slice(0, 500), secrets)}`);
    return { provider: name, model: modelId, error: `HTTP ${res.status}` };
  }

  if (res.status !== 200) {
    const msg = JSON.stringify(json.error || json).slice(0, 300);
    console.log(`  ${C.red}✗ HTTP ${res.status}: ${redactText(msg, secrets)}${C.reset}`);
    return { provider: name, model: modelId, error: `HTTP ${res.status}` };
  }
  // Extract reply text and usage
  let replyText, inputTokens, outputTokens, reportedModel;

  if (isAnthropic) {
    replyText = (json.content && json.content[0] && json.content[0].text) || '(empty)';
    inputTokens = json.usage && json.usage.input_tokens;
    outputTokens = json.usage && json.usage.output_tokens;
    reportedModel = json.model || modelId;
  } else {
    const choice = json.choices && json.choices[0];
    replyText = (choice && choice.message && choice.message.content) || '(empty)';
    inputTokens = json.usage && (json.usage.prompt_tokens || json.usage.input_tokens);
    outputTokens = json.usage && (json.usage.completion_tokens || json.usage.output_tokens);
    reportedModel = json.model || modelId;
  }

  const expectedTokens = estimatePromptTokens(prompt);
  const overhead = inputTokens ? inputTokens - expectedTokens : null;
  const overheadPct = inputTokens ? ((overhead / inputTokens) * 100).toFixed(1) : null;

  // Identity detection
  const replyLower = replyText.toLowerCase();
  const identities = [];
  const checks = [
    ['Claude', /claude/i], ['Kiro', /kiro/i], ['GPT', /gpt|openai/i],
    ['Gemini', /gemini|google/i], ['Llama', /llama|meta/i],
    ['Qwen', /qwen|通义/i], ['DeepSeek', /deepseek/i],
    ['Kimi', /kimi|moonshot/i], ['MiniMax', /minimax/i]
  ];
  for (const [label, re] of checks) {
    if (re.test(replyText)) identities.push(label);
  }

  // Print results
  console.log(`${C.bold}  📝 Reply:${C.reset}`);
  console.log(`  ${redactText(replyText.slice(0, 500), secrets)}\n`);
  console.log(`${C.bold}  📊 Analysis:${C.reset}`);
  console.log(`  Reported model:   ${reportedModel}`);
  console.log(`  Input tokens:     ${inputTokens ?? 'N/A'}`);
  console.log(`  Output tokens:    ${outputTokens ?? 'N/A'}`);
  console.log(`  Expected tokens:  ~${expectedTokens} (prompt only)`);

  if (overhead !== null && overhead > 20) {
    console.log(`  ${C.yellow}⚠ Hidden overhead:  ~${overhead} tokens (${overheadPct}% of input)${C.reset}`);
    console.log(`  ${C.yellow}  → Provider likely injects a hidden system prompt${C.reset}`);
  } else if (overhead !== null) {
    console.log(`  ${C.green}✓ Overhead:  ~${overhead} tokens (minimal, looks clean)${C.reset}`);
  }

  if (identities.length > 0) {
    console.log(`  ${C.bold}Identity detected:  ${identities.join(', ')}${C.reset}`);
  }
  console.log('');

  return { provider: name, model: reportedModel, reply: redactText(replyText.slice(0, 200), secrets), inputTokens, overhead, identities };
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node probe.js <provider-name|--all> [prompt]');
    process.exit(1);
  }

  const cfg = loadConfig();
  const providers = getProviders(cfg);
  const providerArg = args[0];
  const prompt = args[1] || DEFAULT_PROMPT;

  let targets;
  if (providerArg === '--all') {
    targets = Object.keys(providers);
  } else {
    if (!providers[providerArg]) {
      console.error(`Provider "${providerArg}" not found. Available: ${Object.keys(providers).join(', ')}`);
      process.exit(1);
    }
    targets = [providerArg];
  }

  console.log(`${C.bold}Provider Probe — testing ${targets.length} provider(s)${C.reset}`);
  console.log(`Prompt: "${prompt}"\n`);

  const results = [];
  for (const t of targets) {
    results.push(await probeProvider(t, providers[t], prompt));
  }

  // Summary table for --all
  if (targets.length > 1) {
    console.log(`\n${C.bold}${C.cyan}━━━ Summary ━━━${C.reset}`);
    console.log('Provider'.padEnd(20) + 'Model'.padEnd(25) + 'Input'.padEnd(10) + 'Overhead'.padEnd(12) + 'Identity');
    console.log('─'.repeat(80));
    for (const r of results) {
      const oh = r.overhead != null ? `${r.overhead}` : 'N/A';
      const id = r.identities ? r.identities.join(',') : r.error || '?';
      console.log(
        (r.provider || '').padEnd(20) +
        (r.model || '').padEnd(25) +
        String(r.inputTokens ?? 'err').padEnd(10) +
        oh.padEnd(12) +
        id
      );
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
