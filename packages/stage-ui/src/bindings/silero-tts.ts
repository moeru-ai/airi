/**
 * Bindings for Silero TTS API
 */

export interface SileroTTSRequest {
  text: string
  speaker: string
  sample_rate: number
  format?: string
}

export interface SileroTTSResponse {
  audio: ArrayBuffer
}

export interface SileroSpeaker {
  id: string
  name: string
  language: string
  gender?: string
}

/**
 * Generate speech using Silero TTS server
 */
export async function generateSileroSpeech(
  baseUrl: string,
  options: SileroTTSRequest,
): Promise<ArrayBuffer> {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  // Try different possible endpoints for Silero TTS with correct formats
  const endpoints = [
    {
      path: '/',
      method: 'GET',
      params: new URLSearchParams({
        text: options.text,
        speaker: options.speaker,
        sample_rate: String(options.sample_rate),
        format: options.format || 'wav',
      }),
    },
    {
      path: '/say',
      method: 'GET',
      params: new URLSearchParams({
        text: options.text,
        speaker: options.speaker,
        sample_rate: String(options.sample_rate),
        format: options.format || 'wav',
      }),
    },
    {
      path: '/tts',
      method: 'POST',
      body: JSON.stringify({
        text: options.text,
        speaker: options.speaker,
        sample_rate: options.sample_rate,
        format: options.format || 'wav',
      }),
    },
    {
      path: '/audio/speech',
      method: 'POST',
      body: JSON.stringify({
        model: 'tts-1',
        input: options.text,
        voice: options.speaker,
        response_format: options.format || 'wav',
      }),
    },
  ]

  let lastError: Error | null = null

  for (const endpoint of endpoints) {
    try {
      const url = endpoint.method === 'GET'
        ? `${cleanBaseUrl}${endpoint.path}?${endpoint.params}`
        : `${cleanBaseUrl}${endpoint.path}`

      const response = await fetch(url, {
        method: endpoint.method,
        headers: endpoint.method === 'POST'
          ? {
              'Content-Type': 'application/json',
            }
          : {},
        body: endpoint.method === 'POST' ? endpoint.body : undefined,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      })

      if (response.ok) {
        // Check content type to ensure we got audio
        const contentType = response.headers.get('content-type') || ''
        console.warn(`Silero TTS response: ${response.status}, Content-Type: ${contentType}, Size: ${response.headers.get('content-length')} bytes`)

        if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
          const arrayBuffer = await response.arrayBuffer()
          console.warn(`Successfully received audio: ${arrayBuffer.byteLength} bytes`)
          return arrayBuffer
        }
        else {
          throw new Error(`Unexpected content type: ${contentType}`)
        }
      }

      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`Endpoint ${endpoint.path} (${endpoint.method}) failed:`, error)
      continue
    }
  }

  throw lastError || new Error('All Silero TTS endpoints failed')
}

/**
 * Get available speakers from Silero TTS server
 */
export async function getSileroSpeakers(baseUrl: string): Promise<SileroSpeaker[]> {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  try {
    const response = await fetch(`${cleanBaseUrl}/tts/speakers`)

    if (!response.ok) {
      throw new Error(`Failed to fetch speakers: ${response.status} ${response.statusText}`)
    }

    const speakers = await response.json()

    // Convert API response to our format
    return Object.keys(speakers).map(speakerId => ({
      id: speakerId,
      name: speakers[speakerId].name || speakerId,
      language: speakers[speakerId].language || 'unknown',
      gender: speakers[speakerId].gender,
    }))
  }
  catch (error) {
    // If API endpoint is not available, return default speakers
    console.warn('Could not fetch speakers from API, using defaults:', error)
    return [
      { id: 'baya', name: 'Baya', language: 'ru', gender: 'female' },
      { id: 'baya', name: 'Baya', language: 'ru', gender: 'female' },
      { id: 'kseniya', name: 'Kseniya', language: 'ru', gender: 'female' },
      { id: 'xenia', name: 'Xenia', language: 'ru', gender: 'female' },
      { id: 'en_0', name: 'English Speaker 0', language: 'en', gender: 'female' },
      { id: 'en_1', name: 'English Speaker 1', language: 'en', gender: 'male' },
      { id: 'en_2', name: 'English Speaker 2', language: 'en', gender: 'female' },
    ]
  }
}

/**
 * Test Silero TTS server connection
 */
export async function testSileroConnection(baseUrl: string): Promise<boolean> {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  try {
    const response = await fetch(`${cleanBaseUrl}/health`, {
      method: 'GET',
      timeout: 5000,
    } as any)

    return response.ok
  }
  catch (error) {
    console.error('Silero TTS connection test failed:', error)
    return false
  }
}

/**
 * Get a sample audio for a speaker
 */
export async function getSileroSample(
  baseUrl: string,
  speaker: string,
): Promise<ArrayBuffer> {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  const response = await fetch(`${cleanBaseUrl}/tts/sample`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      speaker,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to get sample: ${response.status} ${response.statusText}`)
  }

  return await response.arrayBuffer()
}
