import type { Buffer } from 'node:buffer'

import type { EnvelopeAad, EnvelopeCrypto } from '../../utils/envelope-crypto'

import { array, looseObject, optional, parse, parseJson, pipe, record, string } from 'valibot'

import { STREAM_MODEL_LABEL_FALLBACK } from '../../routes/audio-speech-ws/session'

/** Which master key can open one stored value. */
export type EnvelopeState = 'current' | 'previous' | 'unreadable' | 'not-envelope'

export interface RotationCounts {
  current: number
  previous: number
  unreadable: number
  notEnvelope: number
}

export interface RotatedValue {
  state: EnvelopeState
  /** The value to store. It differs from the input only when `state` is `previous`. */
  ciphertext: string
}

/** A key entry that the rotation found in an unexpected state. */
export interface RotationProblem {
  location: string
  state: Extract<EnvelopeState, 'unreadable' | 'not-envelope'>
}

const ENVELOPE_PREFIX = 'v1.'

export function emptyCounts(): RotationCounts {
  return { current: 0, previous: 0, unreadable: 0, notEnvelope: 0 }
}

export function addCount(counts: RotationCounts, state: EnvelopeState): void {
  if (state === 'not-envelope')
    counts.notEnvelope += 1
  else
    counts[state] += 1
}

/**
 * Re-encrypts envelope values from the previous master key to the current one.
 *
 * Use when:
 * - `LLM_ROUTER_MASTER_KEY` holds the new key and the old key must be retired.
 *
 * Expects:
 * - `current` and `previous` are each built from one master key, without a fallback key.
 *
 * Returns:
 * - `rotate(...)` gives the value to store and the state of the input value.
 */
export function createEnvelopeRotation(options: { current: EnvelopeCrypto, previous: EnvelopeCrypto }) {
  function opens(crypto: EnvelopeCrypto, ciphertext: string, aad: EnvelopeAad): Buffer | null {
    try {
      return crypto.decryptKey(ciphertext, aad)
    }
    catch {
      return null
    }
  }

  return {
    rotate(ciphertext: string, aad: EnvelopeAad): RotatedValue {
      if (!ciphertext.startsWith(ENVELOPE_PREFIX))
        return { state: 'not-envelope', ciphertext }

      const underCurrent = opens(options.current, ciphertext, aad)
      if (underCurrent) {
        underCurrent.fill(0)
        return { state: 'current', ciphertext }
      }

      const underPrevious = opens(options.previous, ciphertext, aad)
      if (!underPrevious)
        return { state: 'unreadable', ciphertext }

      try {
        return { state: 'previous', ciphertext: options.current.encryptKey(underPrevious.toString('utf8'), aad) }
      }
      finally {
        underPrevious.fill(0)
      }
    },
  }
}

export type EnvelopeRotation = ReturnType<typeof createEnvelopeRotation>

// NOTICE:
// These schemas name only the fields that hold key entries. `looseObject`
// keeps every other field, so the rewritten JSON keeps the full config
// without the defaults that the strict ConfigKV schemas add.
const keyEntrySchema = looseObject({ id: string(), ciphertext: string() })
const upstreamWithKeysSchema = looseObject({ keys: array(keyEntrySchema) })
const modelSectionSchema = looseObject({
  models: record(string(), looseObject({ upstreams: array(upstreamWithKeysSchema) })),
})

const routerConfigKeysSchema = pipe(string(), parseJson(), looseObject({
  llm: modelSectionSchema,
  tts: modelSectionSchema,
  asr: optional(modelSectionSchema),
}))

const unspeechUpstreamKeysSchema = pipe(string(), parseJson(), looseObject({
  streaming: optional(looseObject({ keys: array(keyEntrySchema) })),
}))

export interface RotatedConfig {
  /** The JSON to store, or `null` when no key entry changed. */
  value: string | null
  counts: RotationCounts
  problems: RotationProblem[]
}

function rotateEntries(
  rotation: EnvelopeRotation,
  entries: Array<{ id: string, ciphertext: string }>,
  modelName: string,
  location: string,
  result: { counts: RotationCounts, problems: RotationProblem[] },
): boolean {
  let changed = false
  for (const entry of entries) {
    const rotated = rotation.rotate(entry.ciphertext, { modelName, keyEntryId: entry.id })
    addCount(result.counts, rotated.state)
    if (rotated.state === 'unreadable' || rotated.state === 'not-envelope')
      result.problems.push({ location: `${location}.keys[${entry.id}]`, state: rotated.state })
    if (rotated.state === 'previous') {
      entry.ciphertext = rotated.ciphertext
      changed = true
    }
  }
  return changed
}

/** Rotates every key entry in the raw `LLM_ROUTER_CONFIG` JSON. */
export function rotateRouterConfig(rotation: EnvelopeRotation, raw: string): RotatedConfig {
  const config = parse(routerConfigKeysSchema, raw)
  const result = { counts: emptyCounts(), problems: [] as RotationProblem[] }
  let changed = false

  for (const section of ['llm', 'tts', 'asr'] as const) {
    const models = config[section]?.models ?? {}
    for (const [modelName, model] of Object.entries(models)) {
      model.upstreams.forEach((upstream, index) => {
        const location = `${section}.models[${modelName}].upstreams[${index}]`
        changed = rotateEntries(rotation, upstream.keys, modelName, location, result) || changed
      })
    }
  }

  return { value: changed ? JSON.stringify(config) : null, ...result }
}

/** Rotates the streaming key entries in the raw `UNSPEECH_UPSTREAM` JSON. */
export function rotateUnspeechUpstream(rotation: EnvelopeRotation, raw: string): RotatedConfig {
  const config = parse(unspeechUpstreamKeysSchema, raw)
  const result = { counts: emptyCounts(), problems: [] as RotationProblem[] }
  const keys = config.streaming?.keys ?? []
  const changed = rotateEntries(rotation, keys, STREAM_MODEL_LABEL_FALLBACK, 'streaming', result)
  return { value: changed ? JSON.stringify(config) : null, ...result }
}
