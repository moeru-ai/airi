import type { VoiceInputSessionLogLevel } from './voice-input-session'

export interface VoiceInputVadStartupOptions {
  init: () => Promise<void>
  loaded: () => boolean
  start: (stream: MediaStream) => Promise<void>
  stream: MediaStream
  getError?: () => unknown
  log?: (level: VoiceInputSessionLogLevel, event: string, message: string, details?: Record<string, unknown>) => void
}

export async function startVoiceInputVadDetectionSafely(options: VoiceInputVadStartupOptions) {
  try {
    await options.init()

    if (options.loaded()) {
      options.log?.('info', 'vad-start', 'VAD initialized successfully; starting against microphone stream.', {
        stream: options.stream,
      })
      await options.start(options.stream)
      return true
    }

    const error = options.getError?.()
    if (error) {
      options.log?.('error', 'vad-init-failed', 'VAD initialization failed.', {
        error,
      })
    }
  }
  catch (error) {
    options.log?.('error', 'vad-init-failed', 'VAD initialization failed.', {
      error,
    })
  }

  return false
}
