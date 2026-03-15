import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

import { useLogg } from '@guiiai/logg'

import { env } from './env'

const log = useLogg('TTS').useGlobalConfig()

export interface TTSOptions {
  appId: string
  accessKey: string
  speaker: string
  speakerId?: string
}

export async function* synthesizeSpeech(
  text: string,
  options: TTSOptions,
): AsyncGenerator<Buffer> {
  const url = env.TTS_ADAPTER_URL
  const requestId = randomUUID()

  const payload: Record<string, unknown> = {
    app: {
      appid: options.appId,
      token: options.accessKey,
      cluster: 'volcano_tts',
    },
    user: {
      uid: 'voice-gateway',
    },
    audio: {
      voice_type: options.speaker,
      encoding: 'pcm',
      sample_rate: 24000,
      bits: 16,
      channel: 1,
    },
    request: {
      reqid: requestId,
      text,
      operation: 'unidirectional',
    },
  }

  if (options.speakerId) {
    (payload.audio as Record<string, unknown>).voice_type = options.speakerId
  }

  log.log(`TTS request: ${text.slice(0, 50)}...`)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer; ${options.accessKey}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`TTS request failed: ${response.status} ${errText}`)
  }

  if (!response.body) {
    throw new Error('TTS response has no body')
  }

  const reader = response.body.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (value && value.length > 0) {
        yield Buffer.from(value)
      }
    }
  }
  finally {
    reader.releaseLock()
  }

  log.log('TTS synthesis complete')
}
