import { OPENROUTER_ATTRIBUTION_HEADERS } from './openrouter-ai'

export function isChatAudioModel(model: string | undefined) {
  const id = (model || '').toLowerCase()
  return id.includes('gpt-audio') || id.includes('lyria') || id.includes('lyra')
}

export function enrichSpeechRequestBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const model = String(parsed.model || '')
    const voice = String(parsed.voice || '')
    if (voice && /fish-audio/i.test(model)) {
      const extraBody = (parsed.extra_body && typeof parsed.extra_body === 'object')
        ? parsed.extra_body as Record<string, unknown>
        : {}
      parsed.extra_body = { ...extraBody, reference_id: voice }
    }
    if (!parsed.response_format)
      parsed.response_format = 'mp3'
    return JSON.stringify(parsed)
  }
  catch {
    return body
  }
}

export async function fetchSpeechAudio(input: RequestInfo | URL, init: RequestInit | undefined, options?: {
  apiKey?: string
  openRouter?: boolean
}): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (options?.apiKey)
    headers.set('Authorization', `Bearer ${options.apiKey}`)
  if (options?.openRouter) {
    for (const [key, value] of Object.entries(OPENROUTER_ATTRIBUTION_HEADERS))
      headers.set(key, value)
  }

  const nextInit: RequestInit = { ...init, headers }
  if (typeof nextInit.body === 'string')
    nextInit.body = enrichSpeechRequestBody(nextInit.body)

  const response = await fetch(input, nextInit)
  const contentType = response.headers.get('content-type') || ''
  const buffer = await response.arrayBuffer()
  const looksLikeJson = contentType.includes('json') || contentType.includes('text')
  if (!response.ok || looksLikeJson) {
    const text = new TextDecoder().decode(buffer)
    let detail = text.slice(0, 800) || response.statusText
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string, message?: string }
      if (typeof json.error === 'string')
        detail = json.error
      else if (json.error?.message)
        detail = json.error.message
      else if (json.message)
        detail = json.message
    }
    catch {
      // keep raw body
    }
    throw new Error(`TTS request failed (${response.status}): ${detail}`)
  }

  if (buffer.byteLength < 64)
    throw new Error('TTS returned empty audio. Check the model id and voice code.')

  return new Response(buffer, {
    status: 200,
    headers: { 'Content-Type': contentType || 'audio/mpeg' },
  })
}
