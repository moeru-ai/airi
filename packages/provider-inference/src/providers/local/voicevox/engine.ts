/**
 * The HTTP contract of a VOICEVOX-family speech engine.
 *
 * The renderer calls the engine directly. An engine accepts a request that
 * carries no `Origin` header, which is what both the web page and the packaged
 * desktop renderer send to a local address.
 */

/** The four endpoints this provider uses. A caller composes no path of its own. */
type VoicevoxEngineEndpoint = 'audio_query' | 'speakers' | 'synthesis' | 'version'

const VOICEVOX_ENGINE_PATHS = {
  audio_query: 'audio_query',
  speakers: 'speakers',
  synthesis: 'synthesis',
  version: 'version',
} as const satisfies Record<VoicevoxEngineEndpoint, string>

/** `audio_query` sends no body: its text and style id travel in the query string. */
const POST_ENDPOINTS = new Set<VoicevoxEngineEndpoint>(['audio_query', 'synthesis'])

interface VoicevoxEngineRequest {
  baseUrl: string
  body?: unknown
  endpoint: VoicevoxEngineEndpoint
  query?: Record<string, string>
}

export interface VoicevoxEngineRequestOptions {
  /** Injected in tests. Defaults to the ambient `fetch`. */
  fetch?: typeof globalThis.fetch
  signal?: AbortSignal
}

/**
 * The synthesis plan that `/audio_query` returns and `/synthesis` consumes.
 *
 * Only the four fields this provider writes are named. Every other field, such
 * as the accent phrases and the output format, goes back to `/synthesis`
 * unchanged, so the engine keeps its own defaults.
 */
export interface VoicevoxAudioQuery {
  [field: string]: unknown
  intonationScale: number
  pitchScale: number
  speedScale: number
  volumeScale: number
}

/** One character returned by `GET /speakers`. */
export interface VoicevoxSpeaker {
  name: string
  speaker_uuid?: string
  styles: VoicevoxSpeakerStyle[]
}

/** One voice of one character. The `speaker` query parameter takes this `id`, not a character id. */
export interface VoicevoxSpeakerStyle {
  id: number
  name: string
  type?: string
}

/**
 * The four controls the settings page exposes.
 *
 * `intonation` reaches `intonationScale`. VOICEVOX reads that field as the
 * intonation, and AivisSpeech reads it as the strength of the emotion
 * expression. The wire field is the same, so only the label differs per engine.
 */
export interface VoicevoxSynthesisParameters {
  intonation?: number
  pitch?: number
  speed?: number
  volume?: number
}

/**
 * Writes the four controls onto the plan, in place.
 *
 * An absent control keeps the value the engine returned. A control set to zero
 * is written, so the check is the type and not the truthiness.
 */
export function applyVoicevoxParameters(
  audioQuery: VoicevoxAudioQuery,
  parameters: VoicevoxSynthesisParameters,
): VoicevoxAudioQuery {
  if (typeof parameters.speed === 'number')
    audioQuery.speedScale = parameters.speed
  if (typeof parameters.pitch === 'number')
    audioQuery.pitchScale = parameters.pitch
  if (typeof parameters.intonation === 'number')
    audioQuery.intonationScale = parameters.intonation
  if (typeof parameters.volume === 'number')
    audioQuery.volumeScale = parameters.volume

  return audioQuery
}

export async function fetchEngineVersion(
  baseUrl: string,
  options?: VoicevoxEngineRequestOptions,
): Promise<string> {
  const response = await request({ baseUrl, endpoint: 'version' }, options)
  // `/version` answers with a bare JSON string, so the quotes are part of the body.
  return (await response.text()).replace(/^"|"$/g, '')
}

export async function fetchSpeakers(
  baseUrl: string,
  options?: VoicevoxEngineRequestOptions,
): Promise<VoicevoxSpeaker[]> {
  const response = await request({ baseUrl, endpoint: 'speakers' }, options)
  const speakers = await decodeJson<VoicevoxSpeaker[]>(response, 'speakers')
  return Array.isArray(speakers) ? speakers : []
}

/**
 * Turns text into audio with two requests: `/audio_query`, then `/synthesis`.
 *
 * `/audio_query` takes the text as a query parameter, not as a body. The speech
 * pipeline passes one segment per call, so the URL stays short.
 *
 * @returns WAV bytes, at the sampling rate the engine is configured for.
 */
export async function synthesizeSpeech(
  baseUrl: string,
  synthesis: { parameters?: VoicevoxSynthesisParameters, styleId: string, text: string },
  options?: VoicevoxEngineRequestOptions,
): Promise<ArrayBuffer> {
  const query = { speaker: synthesis.styleId, text: synthesis.text }
  const audioQueryResponse = await request({ baseUrl, endpoint: 'audio_query', query }, options)
  const audioQuery = applyVoicevoxParameters(
    await decodeJson<VoicevoxAudioQuery>(audioQueryResponse, 'audio_query'),
    synthesis.parameters ?? {},
  )

  const synthesisResponse = await request(
    { baseUrl, body: audioQuery, endpoint: 'synthesis', query: { speaker: synthesis.styleId } },
    options,
  )

  return await synthesisResponse.arrayBuffer()
}

/**
 * Appends a trailing slash so that a base URL with a path segment keeps it.
 *
 * @example
 * normalizeBaseUrl('http://localhost:50021')
 * // => 'http://localhost:50021/'
 *
 * @example
 * normalizeBaseUrl('http://example.internal/engine')
 * // => 'http://example.internal/engine/'
 */
function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function buildUrl(engineRequest: VoicevoxEngineRequest): URL {
  const url = new URL(VOICEVOX_ENGINE_PATHS[engineRequest.endpoint], normalizeBaseUrl(engineRequest.baseUrl))
  for (const [key, value] of Object.entries(engineRequest.query ?? {}))
    url.searchParams.set(key, value)

  return url
}

async function decodeJson<T>(response: Response, endpoint: string): Promise<T> {
  const body = await response.text()
  try {
    return JSON.parse(body) as T
  }
  catch {
    throw new Error(`Speech engine answered /${endpoint} with a body that is not JSON. Check that the Base URL points at a VOICEVOX-compatible engine.`)
  }
}

async function request(
  engineRequest: VoicevoxEngineRequest,
  options?: VoicevoxEngineRequestOptions,
): Promise<Response> {
  let url: URL
  try {
    url = buildUrl(engineRequest)
  }
  catch {
    throw new Error('The Base URL is not an absolute http:// or https:// address.')
  }

  const doFetch = options?.fetch ?? globalThis.fetch
  const response = await doFetch(url, {
    method: POST_ENDPOINTS.has(engineRequest.endpoint) ? 'POST' : 'GET',
    // No engine in the family redirects. A redirect therefore means the Base URL
    // points at something else, and following it would hide that.
    redirect: 'error',
    signal: options?.signal,
    ...(engineRequest.body === undefined
      ? {}
      : { body: JSON.stringify(engineRequest.body), headers: { 'Content-Type': 'application/json' } }),
  })

  if (!response.ok) {
    const detail = (await response.text()).trim()
    const suffix = detail ? `: ${detail.slice(0, 200)}` : ''
    throw new Error(`Speech engine answered ${response.status} ${response.statusText} for /${engineRequest.endpoint}${suffix}`)
  }

  return response
}
