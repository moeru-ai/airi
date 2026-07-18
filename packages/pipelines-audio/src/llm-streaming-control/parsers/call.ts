import type {
  LlmStreamingControlCallManifest,
  LlmStreamingControlParser,
  LlmStreamingControlTokenCall,
} from '../types'

const callTokenPrefix = '<|CALL '
const markerSuffix = '|>'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function renderCallManifestExamples(manifest: LlmStreamingControlCallManifest): string[] {
  if (manifest.examples?.length) {
    return manifest.examples
  }

  return [
    `<|CALL ["${manifest.name}"]|>`,
  ]
}

/**
 * Renders model-facing instructions for registered `<|CALL [...]|>` manifests.
 *
 * Use when:
 * - Injecting currently available CALL token affordances into a model prompt
 *
 * Expects:
 * - Manifests are already normalized by the streaming-control registry
 *
 * Returns:
 * - Empty string when no manifests are registered
 * - A CALL-specific instruction block with syntax rules and examples otherwise
 */
export function renderCallManifestPrompt(manifests: LlmStreamingControlCallManifest[]) {
  if (manifests.length === 0) {
    return ''
  }

  const lines = [
    'Available streaming CALL tokens:',
    'Use these only as text special tokens when the matching plugin action is needed.',
    'Syntax: <|CALL ["call.name"]|> or <|CALL ["call.name", {"key":"value"}]|>.',
    'Never write provider tool names inside <|CALL ...|>.',
    'Never write JSON payload after the closing |>; all payload data belongs inside the JSON array.',
    '',
  ]

  for (const manifest of manifests) {
    lines.push(`- ${manifest.name}: ${manifest.prompt}`)
    lines.push('  Examples:')
    for (const example of renderCallManifestExamples(manifest)) {
      lines.push(`  - ${example}`)
    }
  }

  return lines.join('\n')
}

/**
 * Creates the parser for `<|CALL [...]|>` streaming-control tokens.
 *
 * Use when:
 * - Loading the built-in plugin callback control
 *
 * Expects:
 * - The token body is a JSON array: `[name]` or `[name, payloadObject]`
 *
 * Returns:
 * - Parsed call data with no side effects
 */
export function tokenCall(): LlmStreamingControlParser<LlmStreamingControlTokenCall> {
  return {
    name: 'CALL',
    match(special) {
      const trimmed = special.trim()
      return trimmed.startsWith(callTokenPrefix) && trimmed.endsWith(markerSuffix)
    },
    parse(special) {
      const trimmed = special.trim()
      const rawPayload = trimmed.slice(callTokenPrefix.length, -markerSuffix.length).trim()

      let parsed: unknown
      try {
        parsed = JSON.parse(rawPayload)
      }
      catch {
        return undefined
      }

      if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 2) {
        return undefined
      }

      const [name, payload] = parsed
      if (typeof name !== 'string' || name.trim().length === 0) {
        return undefined
      }

      if (payload !== undefined && !isPlainObject(payload)) {
        return undefined
      }

      return {
        type: 'call',
        name: name.trim(),
        payload,
      }
    },
  }
}
