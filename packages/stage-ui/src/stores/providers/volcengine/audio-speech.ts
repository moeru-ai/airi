import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { PepTutorBackendAuthConfig } from '../../../utils/peptutor-backend-auth'

import { resolvePepTutorBackendAuth } from '../../../utils/peptutor-backend-auth'
import { fetchPepTutorBackend } from '../../peptutor-backend-auth'

const DEFAULT_DOUBAO_TTS_PROXY_PATH = '/api/peptutor/doubao-tts'
const DEFAULT_DOUBAO_TTS_CLUSTER = 'volcano_tts'

function resolveBaseOrigin(): string {
  if (typeof globalThis.location?.origin === 'string' && globalThis.location.origin) {
    return globalThis.location.origin
  }

  return 'http://localhost'
}

interface DoubaoOfficialSpeechExtraOptions {
  app?: {
    appId?: string
    cluster?: string
  }
  user?: {
    uid?: string
  }
  audio?: {
    encoding?: string
    speed_ratio?: number
    volume_ratio?: number
    pitch_ratio?: number
  }
  proxyUrl?: string
  proxyAuth?: PepTutorBackendAuthConfig
}

interface OpenAISpeechRequestLike {
  input?: string
  voice?: string
  model?: string
}

function resolveProxyUrl(proxyUrl: string | undefined) {
  const raw = proxyUrl?.trim() || DEFAULT_DOUBAO_TTS_PROXY_PATH
  return new URL(raw, resolveBaseOrigin()).toString()
}

export function createOfficialVolcengineSpeechProvider(
  config: Record<string, unknown>,
): SpeechProviderWithExtraOptions<string, DoubaoOfficialSpeechExtraOptions> {
  return {
    speech: (model, options) => ({
      baseURL: 'http://peptutor-doubao-tts.local/v1/',
      model,
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.body || typeof init.body !== 'string') {
          throw new Error('Invalid Doubao TTS request body.')
        }

        const body = JSON.parse(init.body) as OpenAISpeechRequestLike
        const proxyUrl = resolveProxyUrl(
          (options?.proxyUrl || config.proxyUrl) as string | undefined,
        )
        const proxyAuth = (
          options?.proxyAuth
          || resolvePepTutorBackendAuth()
          || config.proxyAuth
        ) as PepTutorBackendAuthConfig | undefined
        const response = await fetchPepTutorBackend(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: body.input,
            voice: body.voice,
            model: body.model || model,
            appId: options?.app?.appId || (config.app as { appId?: string } | undefined)?.appId,
            cluster: options?.app?.cluster || (config.app as { cluster?: string } | undefined)?.cluster || DEFAULT_DOUBAO_TTS_CLUSTER,
            user: options?.user,
            audio: options?.audio,
          }),
        }, {
          auth: proxyAuth,
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(errorText || `Doubao TTS proxy failed with HTTP ${response.status}`)
        }

        return response
      },
    }),
  }
}
