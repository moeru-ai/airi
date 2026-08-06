import type { Fetch } from '@xsai/shared'
import type { Message } from '@xsai/shared-chat'

import process from 'node:process'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { errorMessageFrom, errorNameFrom } from '@moeru/std'
import { generateText } from '@xsai/generate-text'
import { APICallError, XSAIError } from '@xsai/shared'

import * as core from '@actions/core'
import * as v from 'valibot'

import { buildPrompt } from './compact'
import { fetchPullRequest, syncLabels } from './github'

const actionDirectory = fileURLToPath(new URL('../', import.meta.url))

const tagCatalogSchema = v.object({
  tags: v.array(v.object({
    description: v.optional(v.string()),
    name: v.pipe(v.string(), v.minLength(1)),
  })),
})
const modelResultSchema = v.object({
  summary: v.optional(v.string()),
  tags: v.array(v.string()),
})
const desiredTagsSchema = v.array(v.string())

type TagCatalog = v.InferOutput<typeof tagCatalogSchema>

interface Inputs {
  githubToken: string
  llmApiKey: string
  llmApiUrl: string
  maxPromptBytes: number
  model: string
  number: number
  operation: 'apply-labels' | 'classify'
  repository: string
  tagsJson: string
}

interface ValidatedResult {
  rejectedTags: string[]
  summary: string
  tags: string[]
}

const fetchWithoutRedirects: Fetch = (input, init) => globalThis.fetch(input, {
  ...init,
  // Never forward the provider credential through an HTTP redirect.
  redirect: 'error',
})

function safeError(error: unknown): string {
  return (errorMessageFrom(error) ?? String(error))
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 1000)
}

function escapeMarkdown(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}[\]()#+.!|>-])/g, '\\$1')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function readTrustedFiles(): { catalog: TagCatalog, prompt: string } {
  const prompt = readFileSync(`${actionDirectory}/prompt.md`, 'utf8')
  const catalogText = readFileSync(`${actionDirectory}/tags.json`, 'utf8')
  return {
    catalog: v.parse(tagCatalogSchema, JSON.parse(catalogText)),
    prompt,
  }
}

function catalogNames(catalog: TagCatalog): Set<string> {
  const names = new Set(catalog.tags.map(tag => tag.name))
  if (names.size !== catalog.tags.length)
    throw new Error('Tag catalog contains duplicate names.')
  return names
}

function conflictingLabelRule(tags: readonly string[]): string | undefined {
  if (tags.includes('pending triage') && tags.length > 1)
    return '`pending triage` must be exclusive'

  if (tags.includes('bug') && tags.includes('feature'))
    return '`bug` and `feature` are mutually exclusive'

  if (tags.filter(tag => tag.startsWith('priority/')).length > 1)
    return 'priority labels are mutually exclusive'

  const osLabels = tags.filter(tag => tag.startsWith('env/os-'))
  if (osLabels.includes('env/os-all') && osLabels.length > 1)
    return '`env/os-all` cannot be combined with a specific OS label'

  return undefined
}

function validateModelResult(result: unknown, catalog: TagCatalog): ValidatedResult {
  const parsed = v.parse(modelResultSchema, result)
  const allowed = catalogNames(catalog)
  const unique = [...new Set(parsed.tags)]
  const valid = unique.filter(tag => allowed.has(tag)).sort()
  if (valid.length > 12)
    throw new Error('Model result must not contain more than 12 catalog tags.')

  const rejectedTags = unique.filter(tag => !allowed.has(tag)).sort()
  const conflict = conflictingLabelRule(valid)
  if (conflict) {
    if (!allowed.has('pending triage'))
      throw new Error(`Model returned conflicting tags and no fallback exists: ${conflict}.`)
    core.warning(`Model returned conflicting managed labels; using pending triage: ${conflict}.`)
    return {
      rejectedTags,
      summary: (parsed.summary ?? '').slice(0, 240),
      tags: ['pending triage'],
    }
  }

  const tags = valid.length === 0 && allowed.has('pending triage')
    ? ['pending triage']
    : valid
  return {
    rejectedTags,
    summary: (parsed.summary ?? '').slice(0, 240),
    tags,
  }
}

function validateDesiredTags(value: unknown, catalog: TagCatalog): string[] {
  const parsed = v.parse(desiredTagsSchema, value)
  const allowed = catalogNames(catalog)
  const unique = [...new Set(parsed)]
  if (unique.length > 12)
    throw new Error('Validated tags output must not contain more than 12 tags.')

  const rejected = unique.filter(tag => !allowed.has(tag))
  if (rejected.length > 0)
    throw new Error(`Validated tags output contains ${rejected.length} non-catalog tag(s).`)

  const sorted = unique.sort()
  const conflict = conflictingLabelRule(sorted)
  if (conflict)
    throw new Error(`Validated tags output contains conflicting labels: ${conflict}.`)

  return sorted
}

function parseModelContent(content: string): { format: 'fenced-json' | 'plain-json', value: unknown } {
  if (content.trim() === '')
    throw new Error('LLM provider returned empty model content.')

  try {
    return { format: 'plain-json', value: JSON.parse(content) }
  }
  catch {
    const trimmed = content.trim()
    const firstNewline = trimmed.indexOf('\n')
    const openingFence = firstNewline >= 0
      ? trimmed.slice(0, firstNewline).trim().toLowerCase()
      : ''
    if (
      (openingFence === '```' || openingFence === '```json')
      && trimmed.endsWith('\n```')
    ) {
      try {
        return {
          format: 'fenced-json',
          value: JSON.parse(trimmed.slice(firstNewline + 1, -4)),
        }
      }
      catch {
        // Report bounded metadata below instead of including raw model output.
      }
    }

    const bytes = Buffer.byteLength(content, 'utf8')
    const lines = content.split('\n').length
    const hash = createHash('sha256').update(content).digest('hex')
    throw new Error(`LLM content was not valid JSON: bytes=${bytes} lines=${lines} sha256=${hash}`)
  }
}

function llmBaseUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  }
  catch {
    throw new Error('LLM API URL is invalid.')
  }

  if (url.protocol !== 'https:')
    throw new Error('LLM API URL must use HTTPS.')
  if (url.username || url.password)
    throw new Error('LLM API URL must not contain credentials.')
  if (/\/chat\/completions\/?$/.test(url.pathname)) {
    throw new Error(
      'LLM API URL must be the API base URL, not the /chat/completions endpoint.',
    )
  }

  if (!url.pathname.endsWith('/'))
    url.pathname += '/'
  return url.toString()
}

async function requestTags(options: {
  apiKey: string
  apiUrl: string
  context: string
  model: string
  system: string
}): Promise<unknown> {
  const messages: Message[] = [
    { content: options.system, role: 'system' },
    { content: options.context, role: 'user' },
  ]
  let lastError: unknown

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const startedAt = Date.now()
    core.info(`Sending bounded request through xsAI: attempt=${attempt}/4`)
    try {
      const result = await generateText({
        abortSignal: AbortSignal.timeout(120_000),
        apiKey: options.apiKey,
        baseURL: options.apiUrl,
        fetch: fetchWithoutRedirects,
        maxTokens: 2400,
        messages,
        model: options.model,
        responseFormat: { type: 'json_object' },
        temperature: 0,
      })
      const parsed = parseModelContent(result.text ?? '')
      const duration = ((Date.now() - startedAt) / 1000).toFixed(3)
      core.info(
        `LLM usage: model=${options.model} format=${parsed.format} duration=${duration}s `
        + `prompt_tokens=${result.usage.prompt_tokens} `
        + `completion_tokens=${result.usage.completion_tokens} `
        + `total_tokens=${result.usage.total_tokens}`,
      )
      return parsed.value
    }
    catch (error) {
      lastError = error
      const status = APICallError.isInstance(error) ? error.statusCode : undefined
      const errorName = errorNameFrom(error)
      const retryable = status === 429
        || (status !== undefined && status >= 500)
        || errorName === 'TimeoutError'
        || errorName === 'AbortError'
        || error instanceof TypeError

      if (retryable && attempt < 4) {
        core.warning(`LLM request attempt ${attempt} failed temporarily; retrying.`)
        await sleep(attempt * 500)
        continue
      }

      if (status !== undefined)
        throw new Error(`LLM provider returned HTTP ${status}.`)
      if (XSAIError.isInstance(error))
        throw new Error(`xsAI rejected the provider response: code=${error.code}.`)
      throw error
    }
  }

  throw new Error(safeError(lastError))
}

function parseInputs(): Inputs {
  const operation = core.getInput('operation', { required: true })
  if (operation !== 'classify' && operation !== 'apply-labels')
    throw new Error(`Invalid operation: ${operation}`)

  const rawNumber = core.getInput('pull-request-number', { required: true })
  if (!/^\d+$/.test(rawNumber) || Number(rawNumber) < 1)
    throw new Error(`Invalid pull request number: ${rawNumber}`)

  const repository = process.env.GITHUB_REPOSITORY ?? ''
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error('GITHUB_REPOSITORY is missing or invalid.')

  const rawMaxPromptBytes = core.getInput('max-prompt-bytes') || '65536'
  if (!/^\d+$/.test(rawMaxPromptBytes))
    throw new Error(`Invalid max prompt byte limit: ${rawMaxPromptBytes}`)

  const githubToken = core.getInput('github-token', { required: true })
  const llmApiKey = core.getInput('llm-api-key')
  core.setSecret(githubToken)
  if (llmApiKey)
    core.setSecret(llmApiKey)

  return {
    githubToken,
    llmApiKey,
    llmApiUrl: core.getInput('llm-api-url') || 'https://openrouter.ai/api/v1/',
    maxPromptBytes: Number(rawMaxPromptBytes),
    model: core.getInput('llm-model') || 'openai/gpt-4.1-mini',
    number: Number(rawNumber),
    operation,
    repository,
    tagsJson: core.getInput('tags-json') || '[]',
  }
}

function logDiagnostics(inputs: Inputs, diagnostics: ReturnType<typeof buildPrompt>['diagnostics']): void {
  core.info(
    `Triage request: pr=${inputs.number} model=${inputs.model} `
    + `api_host=${new URL(inputs.llmApiUrl).host}`,
  )
  core.info(
    `Prompt budget: final=${diagnostics.inputBytes} max=${inputs.maxPromptBytes} `
    + `context=${diagnostics.contextBytes}/${diagnostics.contextRawBytes} bytes`,
  )
  core.info(
    `Description: compact=${diagnostics.bodyBytes} raw=${diagnostics.bodyRawBytes} bytes`,
  )
  core.info(
    `File manifest: compact=${diagnostics.manifestBytes} `
    + `raw=${diagnostics.manifestRawBytes} bytes`,
  )
  core.info(
    `Diffs: compact=${diagnostics.diffBytes} raw=${diagnostics.diffRawBytes} bytes `
    + `sampled=${diagnostics.selectedDiffFiles} omitted=${diagnostics.omittedDiffFiles} `
    + `unavailable=${diagnostics.unavailablePatches}`,
  )
  core.info(
    `Truncation markers: lines=${diagnostics.lineTruncationMarkers} `
    + `files=${diagnostics.fileTruncationMarkers}`,
  )
}

async function writeSummary(
  inputs: Inputs,
  diagnostics: ReturnType<typeof buildPrompt>['diagnostics'],
  validated: ValidatedResult,
): Promise<void> {
  const tags = validated.tags.length > 0
    ? validated.tags.map(tag => `- \`${escapeMarkdown(tag)}\``).join('\n')
    : '- No tags returned.'
  const rejected = validated.rejectedTags.length > 0
    ? `- Rejected non-catalog tags:\n${validated.rejectedTags.map(tag => `  - \`${escapeMarkdown(tag)}\``).join('\n')}`
    : '- No non-catalog tags were returned.'

  await core.summary
    .addRaw(`## Agentic PR Triage

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
`)
    .write()
  core.info(`Wrote safe triage summary for PR #${inputs.number}`)
}

async function classify(
  inputs: Inputs,
  trusted: ReturnType<typeof readTrustedFiles>,
): Promise<void> {
  if (!Number.isInteger(inputs.maxPromptBytes) || inputs.maxPromptBytes < 1000)
    throw new Error(`Invalid max prompt byte limit: ${inputs.maxPromptBytes}`)
  if (!inputs.llmApiKey)
    throw new Error('Missing LLM provider API key repository secret.')

  const apiUrl = llmBaseUrl(inputs.llmApiUrl)
  core.info(`Validated action inputs: operation=classify pr=${inputs.number}`)
  const { pr, files } = await fetchPullRequest(
    inputs.repository,
    inputs.number,
    inputs.githubToken,
  )

  core.info('Building trusted system prompt from action directory')
  const built = buildPrompt({
    catalog: trusted.catalog,
    files,
    maxBytes: inputs.maxPromptBytes,
    pr,
    prompt: trusted.prompt,
  })
  core.info(
    `Prompt build complete: total_bytes=${built.diagnostics.inputBytes} `
    + `selected_diffs=${built.diagnostics.selectedDiffFiles}`,
  )
  logDiagnostics({ ...inputs, llmApiUrl: apiUrl }, built.diagnostics)

  const modelResult = await requestTags({
    apiKey: inputs.llmApiKey,
    apiUrl,
    context: built.context,
    model: inputs.model,
    system: built.system,
  })
  const validated = validateModelResult(modelResult, trusted.catalog)
  core.info(
    `Validated result: tags=${validated.tags.join(', ') || 'none'} `
    + `rejected=${validated.rejectedTags.length}`,
  )
  core.setOutput('pr-number', inputs.number)
  core.setOutput('tags-json', JSON.stringify(validated.tags))
  await writeSummary(inputs, built.diagnostics, validated)
}

async function applyLabels(
  inputs: Inputs,
  trusted: ReturnType<typeof readTrustedFiles>,
): Promise<void> {
  core.info(`Validated action inputs: operation=apply-labels pr=${inputs.number}`)
  let parsed: unknown
  try {
    parsed = JSON.parse(inputs.tagsJson)
  }
  catch {
    throw new Error('Validated tags output was not valid JSON.')
  }

  await syncLabels({
    desired: validateDesiredTags(parsed, trusted.catalog),
    managed: catalogNames(trusted.catalog),
    number: inputs.number,
    repository: inputs.repository,
    token: inputs.githubToken,
  })
}

/**
 * Runs the local GitHub Action from trusted metadata and dispatches one
 * permission-scoped operation.
 *
 * Call stack:
 *
 * run
 *   -> classify
 *     -> {@link fetchPullRequest}
 *     -> {@link buildPrompt}
 *     -> requestTags
 *   -> applyLabels
 *     -> {@link syncLabels}
 */
async function run(): Promise<void> {
  try {
    const inputs = parseInputs()
    const trusted = readTrustedFiles()
    if (inputs.operation === 'classify')
      await classify(inputs, trusted)
    else
      await applyLabels(inputs, trusted)
  }
  catch (error) {
    core.setFailed(`PR triage failed: ${safeError(error)}`)
  }
}

void run()
