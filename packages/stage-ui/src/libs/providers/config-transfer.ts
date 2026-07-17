import { errorMessageFrom } from '@moeru/std'
import { record, safeParse, string, unknown } from 'valibot'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/**
 * Provider credentials keyed by provider id, as stored under
 * `settings/credentials/providers` (see `useProvidersStore().providers`).
 */
export type ProviderConfigs = Record<string, Record<string, unknown>>

export type TransferFormat = 'env' | 'json' | 'yaml'

/**
 * Version stamp written into JSON/YAML exports so future importers can
 * migrate old files instead of guessing their shape.
 */
const TRANSFER_VERSION = 1

const ENV_KEY_PREFIX = 'AIRI_PROVIDER'

// Provider id and field name are joined with double underscores because both
// segments may contain single underscores once converted to SCREAMING_SNAKE
// ('fish-audio' -> FISH_AUDIO), so a single underscore separator would make
// the split ambiguous. Segments themselves only allow single underscores
// between alphanumeric runs, which keeps the pattern free of backtracking
// ambiguity around the `__` separators.
const ENV_LINE_PATTERN = /^AIRI_PROVIDER__([A-Z0-9]+(?:_[A-Z0-9]+)*)__([A-Z0-9]+(?:_[A-Z0-9]+)*)=(.*)$/

const providerConfigsSchema = record(string(), record(string(), unknown()))

/**
 * Normalizes a provider id for use in an env variable name.
 *
 * Before:
 * - "fish-audio"
 *
 * After:
 * - "FISH_AUDIO"
 */
function providerIdToEnvSegment(providerId: string): string {
  return providerId.replaceAll('-', '_').toUpperCase()
}

/**
 * Normalizes an env variable provider segment back to a provider id.
 *
 * Before:
 * - "FISH_AUDIO"
 *
 * After:
 * - "fish-audio"
 */
function envSegmentToProviderId(segment: string): string {
  return segment.toLowerCase().replaceAll('_', '-')
}

/**
 * Normalizes a camelCase config field for use in an env variable name.
 *
 * Before:
 * - "apiKey"
 *
 * After:
 * - "API_KEY"
 */
function fieldToEnvSegment(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()
}

/**
 * Normalizes an env variable field segment back to a camelCase config field.
 *
 * Before:
 * - "API_KEY"
 *
 * After:
 * - "apiKey"
 */
function envSegmentToField(segment: string): string {
  const [head, ...rest] = segment.toLowerCase().split('_')
  return head + rest.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

/**
 * Encodes a config value for one .env line. Strings that could be mistaken
 * for JSON scalars on re-import (numbers, booleans, null, or JSON-looking
 * text) are JSON-quoted so the round-trip preserves their string type —
 * important for numeric-looking secrets.
 */
function encodeEnvValue(value: unknown): string {
  if (typeof value === 'string') {
    const ambiguous = /^-?\d+(?:\.\d+)?$/.test(value)
      || value === 'true' || value === 'false' || value === 'null'
      || /^["[{]/.test(value)
      || value.includes('\n') || value.includes('#')
    return ambiguous ? JSON.stringify(value) : value
  }

  return JSON.stringify(value)
}

/**
 * Decodes one .env value written by {@link encodeEnvValue}. JSON-looking
 * values (quoted strings, objects, arrays, numbers, booleans, null) are
 * JSON-parsed; everything else stays a raw string.
 */
function decodeEnvValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed === '')
    return ''

  const jsonLike = /^["[{]/.test(trimmed)
    || trimmed === 'true' || trimmed === 'false' || trimmed === 'null'
    || /^-?\d+(?:\.\d+)?$/.test(trimmed)

  if (jsonLike) {
    try {
      return JSON.parse(trimmed)
    }
    catch {
      // e.g. an unquoted API key that merely starts with a digit or brace;
      // treat it as the literal string it was.
      return trimmed
    }
  }

  return trimmed
}

function serializeToEnv(configs: ProviderConfigs): string {
  const lines: string[] = [
    '# AIRI provider configurations',
    `# Format: ${ENV_KEY_PREFIX}__<PROVIDER_ID>__<FIELD>=<value>`,
    '# Non-string values (and ambiguous strings) are JSON-encoded.',
    '',
  ]

  for (const [providerId, config] of Object.entries(configs)) {
    for (const [field, value] of Object.entries(config)) {
      if (value === undefined)
        continue

      lines.push(`${ENV_KEY_PREFIX}__${providerIdToEnvSegment(providerId)}__${fieldToEnvSegment(field)}=${encodeEnvValue(value)}`)
    }
  }

  return `${lines.join('\n')}\n`
}

function parseFromEnv(content: string): ProviderConfigs {
  const configs: ProviderConfigs = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#'))
      continue

    const match = trimmed.match(ENV_LINE_PATTERN)
    if (!match)
      continue

    const [, providerSegment, fieldSegment, rawValue] = match
    const providerId = envSegmentToProviderId(providerSegment)

    configs[providerId] ??= {}
    configs[providerId][envSegmentToField(fieldSegment)] = decodeEnvValue(rawValue)
  }

  return configs
}

/**
 * Serializes provider configurations for download or clipboard transfer.
 *
 * JSON and YAML exports carry a `{ version, providers }` envelope and
 * preserve nested values exactly. The .env export flattens top-level fields
 * into `AIRI_PROVIDER__*` lines (nested values are JSON-encoded) so configs
 * can be kept alongside other development environment variables.
 *
 * Exports contain API keys in plain text — callers must warn users before
 * writing the result anywhere.
 */
export function serializeProviderConfigs(configs: ProviderConfigs, format: TransferFormat): string {
  switch (format) {
    case 'json':
      return `${JSON.stringify({ version: TRANSFER_VERSION, providers: configs }, null, 2)}\n`
    case 'yaml':
      return stringifyYaml({ version: TRANSFER_VERSION, providers: configs })
    case 'env':
      return serializeToEnv(configs)
  }
}

/**
 * Parses provider configurations from a previously exported (or hand-written)
 * file. Accepts the versioned `{ version, providers }` envelope as well as a
 * bare provider-id record, so users can paste minimal hand-rolled YAML/JSON.
 *
 * @throws Error with a user-facing message when the content cannot be parsed
 * or does not match the expected shape.
 */
export function parseProviderConfigs(content: string, format: TransferFormat): ProviderConfigs {
  if (format === 'env') {
    const configs = parseFromEnv(content)
    if (Object.keys(configs).length === 0)
      throw new Error(`No ${ENV_KEY_PREFIX}__* entries found in the provided .env content.`)

    return configs
  }

  let data: unknown
  try {
    data = format === 'json' ? JSON.parse(content) : parseYaml(content)
  }
  catch (error) {
    throw new Error(`Failed to parse ${format.toUpperCase()} content: ${errorMessageFrom(error)}`)
  }

  // Envelope exports wrap the record; bare records are accepted for
  // hand-written files.
  const candidate = (
    typeof data === 'object' && data !== null && 'providers' in data
  )
    ? (data as { providers: unknown }).providers
    : data

  const result = safeParse(providerConfigsSchema, candidate)
  if (!result.success)
    throw new Error('Content does not look like provider configurations (expected a map of provider ids to config objects).')

  return result.output
}

/**
 * Infers the transfer format from a file name, falling back to content
 * sniffing for pasted text.
 */
export function detectTransferFormat(fileName: string | undefined, content: string): TransferFormat {
  const name = fileName?.toLowerCase() ?? ''
  if (name.endsWith('.json'))
    return 'json'
  if (name.endsWith('.yaml') || name.endsWith('.yml'))
    return 'yaml'
  if (name.endsWith('.env') || name.includes('.env.'))
    return 'env'

  const trimmed = content.trim()
  if (trimmed.startsWith('{'))
    return 'json'
  if (trimmed.split('\n').some(line => ENV_LINE_PATTERN.test(line.trim())))
    return 'env'

  return 'yaml'
}
