'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  callLlm,
  escapeMarkdown,
  getInput,
  main,
  parseModelContent,
  safeError,
  setOutput,
  validateDesiredTags,
  validateModelResult,
} = require('../src/index.cjs');

function response(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('classify operation runs from action inputs through validated outputs', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-triage-integration-'));
  const output = path.join(directory, 'output.txt');
  const summary = path.join(directory, 'summary.md');
  const keys = [
    'GITHUB_OUTPUT',
    'GITHUB_REPOSITORY',
    'GITHUB_STEP_SUMMARY',
    'INPUT_GITHUB-TOKEN',
    'INPUT_MAX-PROMPT-BYTES',
    'INPUT_LLM-API-KEY',
    'INPUT_LLM-API-URL',
    'INPUT_LLM-MODEL',
    'INPUT_OPERATION',
    'INPUT_PULL-REQUEST-NUMBER',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const originalFetch = global.fetch;
  Object.assign(process.env, {
    GITHUB_OUTPUT: output,
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_STEP_SUMMARY: summary,
    'INPUT_GITHUB-TOKEN': 'github-token',
    'INPUT_MAX-PROMPT-BYTES': '65536',
    'INPUT_LLM-API-KEY': 'provider-key',
    'INPUT_LLM-API-URL': 'https://openrouter.ai/api/v1/chat/completions',
    'INPUT_LLM-MODEL': '@preset/pr-triage',
    INPUT_OPERATION: 'classify',
    'INPUT_PULL-REQUEST-NUMBER': '17',
  });
  global.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/pulls/17')) {
      return response({
        additions: 4,
        base: { ref: 'main' },
        body: 'A focused test fixture.',
        changed_files: 1,
        deletions: 0,
        draft: false,
        head: { ref: 'fixture' },
        labels: [],
        number: 17,
        title: 'test: add fixture',
        user: { login: 'fixture-user' },
      });
    }
    if (target.includes('/pulls/17/files?')) {
      return response([{
        additions: 4,
        changes: 4,
        deletions: 0,
        filename: 'fixtures/example.test.js',
        patch: '@@ -0,0 +1,4 @@\n+fixture',
        status: 'added',
      }]);
    }
    if (target === 'https://openrouter.ai/api/v1/chat/completions') {
      return response({
        choices: [{ message: { content: '{"tags":["feature","apps/stage-web","scope/ui"],"summary":"Adds a focused web fixture."}' } }],
        model: 'fixture/model',
        usage: { completion_tokens: 30, prompt_tokens: 500, total_tokens: 530 },
      });
    }
    throw new Error(`Unexpected test URL: ${target}`);
  };

  try {
    await main();
    const actionOutput = fs.readFileSync(output, 'utf8');
    assert.match(actionOutput, /pr-number=17/);
    assert.match(actionOutput, /tags-json=\["apps\/stage-web","feature","scope\/ui"\]/);
    const actionSummary = fs.readFileSync(summary, 'utf8');
    assert.match(actionSummary, /Agentic PR Triage/);
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test('model content accepts plain and fenced JSON without leaking invalid content', () => {
  assert.deepEqual(parseModelContent('{"tags":[]}').value, { tags: [] });
  assert.deepEqual(parseModelContent('```json\n{"tags":["risk:low"]}\n```').value, { tags: ['risk:low'] });
  assert.throws(() => parseModelContent('private model prose'), /bytes=19 lines=1 sha256=[a-f0-9]{64}/);
});

test('generic LLM client omits provider-specific fields for another endpoint', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { options, url: String(url) };
    return response({
      choices: [{ message: { content: '{"tags":[],"summary":"ok"}' } }],
      model: 'fixture/model',
      usage: { completion_tokens: 10, prompt_tokens: 20, total_tokens: 30 },
    });
  };
  const value = await callLlm({
    apiKey: 'secret',
    apiUrl: 'https://ai.example.test/v1/chat/completions',
    context: 'context',
    fetchImpl,
    model: 'fixture/model',
    repository: 'owner/repo',
    system: 'system',
  });
  const request = JSON.parse(captured.options.body);
  assert.equal(captured.url, 'https://ai.example.test/v1/chat/completions');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(request.reasoning, undefined);
  assert.equal(captured.options.headers['HTTP-Referer'], undefined);
  assert.deepEqual(value, { tags: [], summary: 'ok' });
});

test('OpenRouter compatibility adds its optional routing fields', async () => {
  let captured;
  await callLlm({
    apiKey: 'secret',
    apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
    context: 'context',
    fetchImpl: async (_url, options) => {
      captured = options;
      return response({ choices: [{ message: { content: '{"tags":[]}' } }] });
    },
    model: '@preset/pr-triage',
    repository: 'owner/repo',
    system: 'system',
  });
  assert.equal(JSON.parse(captured.body).reasoning.effort, 'minimal');
  assert.equal(captured.headers['HTTP-Referer'], 'https://github.com/owner/repo');
});

test('runtime helpers support action inputs and safe outputs', () => {
  const key = 'INPUT_PULL-REQUEST-NUMBER';
  const previousInput = process.env[key];
  process.env[key] = '42';
  assert.equal(getInput('pull-request-number', { required: true }), '42');
  if (previousInput === undefined) delete process.env[key];
  else process.env[key] = previousInput;

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-triage-output-'));
  const output = path.join(directory, 'output.txt');
  const previousOutput = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = output;
  setOutput('tags-json', '["risk:low"]');
  assert.equal(fs.readFileSync(output, 'utf8'), 'tags-json=["risk:low"]\n');
  if (previousOutput === undefined) delete process.env.GITHUB_OUTPUT;
  else process.env.GITHUB_OUTPUT = previousOutput;

  assert.equal(safeError(new Error('first\n::warning::second')), 'first ::warning::second');
  assert.equal(escapeMarkdown('[click](javascript:alert(1))'), '\\[click\\]\\(javascript:alert\\(1\\)\\)');
});

test('tag validation rejects unknown values and invalid shapes', () => {
  const catalog = { tags: [{ name: 'feature' }, { name: 'scope/ui' }, { name: 'apps/stage-web' }, { name: 'pending triage' }] };
  const result = validateModelResult({
    tags: ['feature', 'rce-detected', 'scope/ui', 'feature'],
    summary: 'A feature.',
  }, catalog);
  assert.deepEqual(result.tags, ['feature', 'scope/ui']);
  assert.deepEqual(result.rejectedTags, ['rce-detected']);
  assert.throws(() => validateModelResult({ tags: 'feature' }, catalog), /array of strings/);
  assert.deepEqual(validateDesiredTags(['scope/ui', 'apps/stage-web'], catalog), ['apps/stage-web', 'scope/ui']);
  assert.throws(() => validateDesiredTags(['rce-detected'], catalog), /non-catalog/);
  assert.deepEqual(validateModelResult({ tags: [] }, catalog).tags, ['pending triage']);
});

test('tag validation enforces the AIRI managed-label limit', () => {
  const catalog = {
    tags: Array.from({ length: 13 }, (_, index) => ({ name: `scope/test-${index}` })),
  };
  assert.throws(() => validateModelResult({
    tags: catalog.tags.map((tag) => tag.name),
  }, catalog), /more than 12/);
  const result = validateModelResult({ tags: [], summary: 'x'.repeat(300) }, catalog);
  assert.equal(result.summary.length, 240);
  assert.throws(() => validateDesiredTags(catalog.tags.map((tag) => tag.name), catalog), /more than 12/);
});
