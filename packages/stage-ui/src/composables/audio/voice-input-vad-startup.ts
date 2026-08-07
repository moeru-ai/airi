import type { VoiceInputSessionLogLevel } from './voice-input-session'

export interface VoiceInputVadStartupOptions {
  init: () => Promise<void>
  loaded: () => boolean
  start: (stream: MediaStream) => Promise<void>
  stream: MediaStream
  getError?: () => unknown
  log?: (level: VoiceInputSessionLogLevel, event: string, message: string, details?: Record<string, unknown>) => void
}

/**
 * Initializes Silero VAD and attaches it to a microphone stream without throwing.
 *
 * Returns `true` only when both init and start succeed. Callers should treat
 * `false` as "VAD is not actively detecting" even if the model finished loading —
 * for example when `start(stream)` rejects after a successful init.
 */
export async function startVoiceInputVadDetectionSafely(options: VoiceInputVadStartupOptions) {
  try {
    await options.init()

    if (!options.loaded()) {
      const error = options.getError?.()
      if (error) {
        options.log?.('error', 'vad-init-failed', 'VAD initialization failed.', {
          error,
        })
      }
      return false
    }

    try {
      options.log?.('info', 'vad-start', 'VAD initialized successfully; starting against microphone stream.', {
        stream: options.stream,
      })
      await options.start(options.stream)
      return true
    }
    catch (error) {
      // Init can succeed while attaching the worklet/stream still fails. Callers
      // must not treat `loaded === true` as "detection is running" in that case.
      options.log?.('error', 'vad-start-failed', 'VAD start against microphone stream failed.', {
        error,
      })
      return false
    }
  }
  catch (error) {
    options.log?.('error', 'vad-init-failed', 'VAD initialization failed.', {
      error,
    })
  }

  return false
}
