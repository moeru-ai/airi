'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const { buildPrompt } = require('./compact.cjs');
const { fetchPullRequest, syncLabels } = require('./github.cjs');

const actionDirectory = path.resolve(__dirname, '..');

function getInput(name, { required = false, defaultValue = '' } = {}) {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  const value = process.env[key] ?? defaultValue;
  if (required && value.trim() === '') throw new Error(`Missing required action input: ${name}`);
  return value;
}

function appendFileFromEnv(envName, content) {
  const target = process.env[envName];
  if (target) fs.appendFileSync(target, content, 'utf8');
}

function setOutput(name, value) {
  const text = String(value);
  if (!text.includes('\n')) {
    appendFileFromEnv('GITHUB_OUTPUT', `${name}=${text}\n`);
    return;
  }
  const delimiter = `pr_triage_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  appendFileFromEnv('GITHUB_OUTPUT', `${name}<<${delimiter}\n${text}\n${delimiter}\n`);
}

function addMask(value) {
  if (value) console.log(`::add-mask::${String(value).replace(/[\r\n]/g, '')}`);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n]+/g, ' ').slice(0, 1000);
}

function escapeMarkdown(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}[\]()#+.!|>-])/g, '\\$1')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function catalogNames(catalog) {
  if (!catalog || !Array.isArray(catalog.tags) || !catalog.tags.every((tag) => tag && typeof tag.name === 'string')) {
    throw new Error('Tag catalog must contain a tags array with string names.');
  }
  return new Set(catalog.tags.map((tag) => tag.name));
}

function validateModelResult(result, catalog) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Model result must be a JSON object.');
  if (!Array.isArray(result.tags) || !result.tags.every((tag) => typeof tag === 'string')) {
    throw new Error('Model result tags must be an array of strings.');
  }
  if (result.summary !== undefined && typeof result.summary !== 'string') throw new Error('Model result summary must be a string.');
  const allowed = catalogNames(catalog);
  const unique = [...new Set(result.tags)];
  const valid = unique.filter((tag) => allowed.has(tag)).sort();
  if (valid.length > 12) throw new Error('Model result must not contain more than 12 catalog tags.');
  const rejectedTags = unique.filter((tag) => !allowed.has(tag)).sort();
  const tags = valid.length === 0 && allowed.has('pending triage') ? ['pending triage'] : valid;
  return {
    rejectedTags,
    summary: (result.summary ?? '').slice(0, 240),
    tags,
  };
}

function validateDesiredTags(value, catalog) {
  if (!Array.isArray(value) || !value.every((tag) => typeof tag === 'string')) {
    throw new Error('Validated tags output must be an array of strings.');
  }
  const allowed = catalogNames(catalog);
  const unique = [...new Set(value)];
  if (unique.length > 12) throw new Error('Validated tags output must not contain more than 12 tags.');
  const rejected = unique.filter((tag) => !allowed.has(tag));
  if (rejected.length > 0) throw new Error(`Validated tags output contains ${rejected.length} non-catalog tag(s).`);
  return unique.sort();
}

function parseModelContent(content) {
  if (typeof content !== 'string' || content.trim() === '') throw new Error('LLM provider returned empty model content.');
  try {
    return { format: 'plain-json', value: JSON.parse(content) };
  } catch {
    const match = content.match(/^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i);
    if (match) {
      try {
        return { format: 'fenced-json', value: JSON.parse(match[1]) };
      } catch {
        // Report bounded metadata below instead of raw model output.
      }
    }
    const bytes = Buffer.byteLength(content, 'utf8');
    const lines = content.split('\n').length;
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    throw new Error(`LLM content was not valid JSON: bytes=${bytes} lines=${lines} sha256=${hash}`);
  }
}

async function callLlm({ apiKey, apiUrl, model, system, context, repository, fetchImpl = fetch }) {
  let endpoint;
  try {
    endpoint = new URL(apiUrl);
  } catch {
    throw new Error('LLM API URL is invalid.');
  }
  if (endpoint.protocol !== 'https:') throw new Error('LLM API URL must use HTTPS.');
  const isOpenRouter = endpoint.hostname === 'openrouter.ai' || endpoint.hostname.endsWith('.openrouter.ai');
  const payload = {
    model,
    temperature: 0,
    max_tokens: 2400,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: context },
    ],
  };
  if (isOpenRouter) payload.reasoning = { effort: 'minimal', exclude: true };

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const startedAt = Date.now();
    console.log(`Sending bounded request to LLM provider: attempt=${attempt}/4`);
    try {
      const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
      if (isOpenRouter) {
        headers['HTTP-Referer'] = `https://github.com/${repository}`;
        headers['X-Title'] = 'Agentic PR Triage Lab';
      }
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        // Never forward the provider credential through an HTTP redirect.
        redirect: 'error',
        signal: AbortSignal.timeout(120000),
      });
      const text = await response.text();
      const duration = ((Date.now() - startedAt) / 1000).toFixed(3);
      console.log(`LLM transport: attempt=${attempt} http=${response.status} duration=${duration}s bytes=${Buffer.byteLength(text, 'utf8')}`);
      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && attempt < 4) {
          lastError = new Error(`LLM provider returned retryable HTTP ${response.status}`);
          await sleep(attempt * 500);
          continue;
        }
        throw new Error(`LLM provider returned HTTP ${response.status}`);
      }
      let responseJson;
      try {
        responseJson = JSON.parse(text);
      } catch {
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        throw new Error(`LLM response envelope was not valid JSON: bytes=${Buffer.byteLength(text, 'utf8')} sha256=${hash}`);
      }
      if (responseJson.error) {
        throw new Error(`LLM provider returned an error: ${String(responseJson.error.message ?? 'unknown error').slice(0, 500)}`);
      }
      const message = responseJson.choices?.[0]?.message;
      if (!message?.content) {
        const finishReason = responseJson.choices?.[0]?.finish_reason ?? 'null';
        const completionTokens = responseJson.usage?.completion_tokens ?? 'unknown';
        throw new Error(`LLM provider returned empty content: finish_reason=${finishReason} completion_tokens=${completionTokens}`);
      }
      const parsed = parseModelContent(message.content);
      console.log(
        `LLM usage: model=${String(responseJson.model ?? 'unknown').replace(/[\r\n]/g, '')} format=${parsed.format} prompt_tokens=${responseJson.usage?.prompt_tokens ?? 'unknown'} completion_tokens=${responseJson.usage?.completion_tokens ?? 'unknown'} total_tokens=${responseJson.usage?.total_tokens ?? 'unknown'}`,
      );
      return parsed.value;
    } catch (error) {
      lastError = error;
      const retryable = error?.name === 'TimeoutError' || error?.name === 'AbortError' || error instanceof TypeError;
      if (!retryable || attempt === 4) throw error;
      console.log(`::warning::LLM request attempt ${attempt} failed before a complete response; retrying.`);
      await sleep(attempt * 500);
    }
  }
  throw lastError ?? new Error('LLM request failed.');
}

function readTrustedFiles() {
  return {
    prompt: fs.readFileSync(path.join(actionDirectory, 'prompt.md'), 'utf8'),
    catalog: JSON.parse(fs.readFileSync(path.join(actionDirectory, 'tags.json'), 'utf8')),
  };
}

function parseInputs() {
  const operation = getInput('operation', { required: true });
  if (!['classify', 'apply-labels'].includes(operation)) throw new Error(`Invalid operation: ${operation}`);
  const rawNumber = getInput('pull-request-number', { required: true });
  if (!/^\d+$/.test(rawNumber) || Number(rawNumber) < 1) throw new Error(`Invalid pull request number: ${rawNumber}`);
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY is missing or invalid.');
  const githubToken = getInput('github-token', { required: true });
  addMask(githubToken);
  return {
    llmApiKey: getInput('llm-api-key'),
    llmApiUrl: getInput('llm-api-url', { defaultValue: 'https://openrouter.ai/api/v1/chat/completions' }),
    githubToken,
    maxPromptBytes: Number(getInput('max-prompt-bytes', { defaultValue: '65536' })),
    model: getInput('llm-model', { defaultValue: 'openai/gpt-4.1-mini' }),
    number: Number(rawNumber),
    operation,
    repository,
    tagsJson: getInput('tags-json', { defaultValue: '[]' }),
  };
}

function logDiagnostics(inputs, diagnostics) {
  console.log(`Triage request: pr=${inputs.number} model=${inputs.model.replace(/[\r\n]/g, '')} api_host=${new URL(inputs.llmApiUrl).host}`);
  console.log(`Prompt budget: final=${diagnostics.inputBytes} max=${inputs.maxPromptBytes} context=${diagnostics.contextBytes}/${diagnostics.contextRawBytes} bytes`);
  console.log(`Description: compact=${diagnostics.bodyBytes} raw=${diagnostics.bodyRawBytes} bytes`);
  console.log(`File manifest: compact=${diagnostics.manifestBytes} raw=${diagnostics.manifestRawBytes} bytes`);
  console.log(`Diffs: compact=${diagnostics.diffBytes} raw=${diagnostics.diffRawBytes} bytes sampled=${diagnostics.selectedDiffFiles} omitted=${diagnostics.omittedDiffFiles} unavailable=${diagnostics.unavailablePatches}`);
  console.log(`Truncation markers: lines=${diagnostics.lineTruncationMarkers} files=${diagnostics.fileTruncationMarkers}`);
}

function writeSummary(inputs, diagnostics, validated) {
  const tags = validated.tags.length > 0 ? validated.tags.map((tag) => `- \`${escapeMarkdown(tag)}\``).join('\n') : '- No tags returned.';
  const rejected = validated.rejectedTags.length > 0
    ? `- Rejected non-catalog tags:\n${validated.rejectedTags.map((tag) => `  - \`${escapeMarkdown(tag)}\``).join('\n')}`
    : '- No non-catalog tags were returned.';
  appendFileFromEnv('GITHUB_STEP_SUMMARY', `## Agentic PR Triage

- PR: #${inputs.number}
- Model: \`${escapeMarkdown(inputs.model)}\`
- Prompt bytes: ${diagnostics.inputBytes} / ${inputs.maxPromptBytes}
- Changed files: ${diagnostics.totalFiles}
- Files with sampled diff: ${diagnostics.selectedDiffFiles}

### Validated tags
${tags}

### Model summary
${escapeMarkdown(validated.summary)}

### Validation
${rejected}
`);
  console.log(`Wrote safe triage summary for PR #${inputs.number}`);
}

async function classify(inputs, trusted) {
  if (!Number.isInteger(inputs.maxPromptBytes) || inputs.maxPromptBytes < 1000) throw new Error(`Invalid max prompt byte limit: ${inputs.maxPromptBytes}`);
  if (!inputs.llmApiKey) throw new Error('Missing LLM provider API key repository secret.');
  addMask(inputs.llmApiKey);
  console.log(`Validated action inputs: operation=classify pr=${inputs.number}`);
  const { pr, files } = await fetchPullRequest(inputs.repository, inputs.number, inputs.githubToken);
  console.log('Building trusted system prompt from action directory');
  const built = buildPrompt({ catalog: trusted.catalog, files, maxBytes: inputs.maxPromptBytes, pr, prompt: trusted.prompt });
  built.diagnostics.totalFiles = files.length;
  console.log(`Prompt build complete: total_bytes=${built.diagnostics.inputBytes} selected_diffs=${built.diagnostics.selectedDiffFiles}`);
  logDiagnostics(inputs, built.diagnostics);
  const modelResult = await callLlm({
    apiKey: inputs.llmApiKey,
    apiUrl: inputs.llmApiUrl,
    context: built.context,
    model: inputs.model,
    repository: inputs.repository,
    system: built.system,
  });
  const validated = validateModelResult(modelResult, trusted.catalog);
  console.log(`Validated result: tags=${validated.tags.join(', ') || 'none'} rejected=${validated.rejectedTags.length}`);
  setOutput('pr-number', inputs.number);
  setOutput('tags-json', JSON.stringify(validated.tags));
  writeSummary(inputs, built.diagnostics, validated);
}

async function applyLabels(inputs, trusted) {
  console.log(`Validated action inputs: operation=apply-labels pr=${inputs.number}`);
  let parsed;
  try {
    parsed = JSON.parse(inputs.tagsJson);
  } catch {
    throw new Error('Validated tags output was not valid JSON.');
  }
  await syncLabels({
    catalog: trusted.catalog,
    desired: validateDesiredTags(parsed, trusted.catalog),
    number: inputs.number,
    repository: inputs.repository,
    token: inputs.githubToken,
  });
}

async function main() {
  const inputs = parseInputs();
  const trusted = readTrustedFiles();
  if (inputs.operation === 'classify') await classify(inputs, trusted);
  else await applyLabels(inputs, trusted);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`PR triage failed: ${safeError(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  callLlm,
  escapeMarkdown,
  getInput,
  main,
  parseModelContent,
  safeError,
  setOutput,
  validateDesiredTags,
  validateModelResult,
};
