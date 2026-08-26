import type { VoiceInputSessionLogLevel } from './voice-input-session'

export interface VoiceInputVadStartupOptions {
  getError?: () => unknown
  init: () => Promise<void>
  loaded: () => boolean
  log?: (level: VoiceInputSessionLogLevel, event: string, message: string, details?: Record<string, unknown>) => void
  start: (stream: MediaStream) => Promise<void>
  stream: MediaStream
}

export async function startVoiceInputVadDetectionSafely(options: VoiceInputVadStartupOptions) {
  try {
    await options.init()

    if (options.loaded()) {
      options.log?.('info', 'vad-start', 'VAD initialized successfully; starting against microphone stream.', {
        stream: options.stream,
      })
      await options.start(options.stream)
      options.log?.('info', 'vad-ready', 'VAD is connected to the microphone stream.')
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
