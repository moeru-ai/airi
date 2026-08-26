import { readFile } from 'node:fs/promises'

import { maskClipboardPreview } from './clipboard'

export interface ReadEnvValueInput {
  allowPlaceholder?: boolean
  filePath: string
  keys: string[]
}

export interface ReadEnvValueResult {
  filePath: string
  key: string
  value: string
}

const placeholderFragments = [
  'replace-with',
  'your-token-here',
  'your_api_key_here',
  'example',
  'placeholder',
  'changeme',
  'dummy',
  'sample',
  'todo',
]

function parseEnvLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#'))
    return undefined

  const normalized = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed
  const separatorIndex = normalized.indexOf('=')
  if (separatorIndex <= 0)
    return undefined

  const key = normalized.slice(0, separatorIndex).trim()
  let value = normalized.slice(separatorIndex + 1).trim()

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  ) {
    value = value.slice(1, -1)
  }
  else {
    const commentIndex = value.indexOf(' #')
    if (commentIndex >= 0)
      value = value.slice(0, commentIndex).trim()
  }

  return { key, value }
}

function valueLooksLikePlaceholder(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized)
    return true

  return placeholderFragments.some(fragment => normalized.includes(fragment))
}

export function maskEnvValuePreview(value: string) {
  return maskClipboardPreview(value)
}

export async function readEnvValue(input: ReadEnvValueInput): Promise<ReadEnvValueResult> {
  const source = await readFile(input.filePath, 'utf-8')
  const requestedKeys = input.keys
    .map(key => key.trim())
    .filter(Boolean)

  if (requestedKeys.length === 0) {
    throw new Error('secret_read_env_value requires at least one key')
  }

  const values = new Map<string, string>()
  for (const line of source.split(/\r?\n/g)) {
    const parsed = parseEnvLine(line)
    if (!parsed)
      continue
    values.set(parsed.key, parsed.value)
  }

  for (const key of requestedKeys) {
    if (!values.has(key))
      continue

    const value = values.get(key) ?? ''
    if (input.allowPlaceholder !== true && valueLooksLikePlaceholder(value)) {
      throw new Error(`secret_read_env_value found key "${key}" in ${input.filePath}, but the value looks like a placeholder/template value`)
    }

    return {
      filePath: input.filePath,
      key,
      value,
    }
  }

  throw new Error(`secret_read_env_value could not find any of [${requestedKeys.join(', ')}] in ${input.filePath}`)
}
