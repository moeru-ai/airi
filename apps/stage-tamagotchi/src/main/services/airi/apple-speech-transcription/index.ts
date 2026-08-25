import type { Lifecycle } from 'injeca'

import { createContext } from '@moeru/eventa/adapters/electron/main'
import { setupAppleSpeechTranscription } from '@xsai-apple-speech/transcription-electron-plugin/main'
import { createAppleSpeechProvider } from '@xsai-apple-speech/transcription-native'
import { ipcMain } from 'electron'

/**
 * Registers the app-wide Apple Speech transport and its native Provider.
 *
 * The Electron main process owns native work. Renderer Providers communicate
 * with it through the Eventa handlers registered by the xsAI plugin.
 *
 * Call stack:
 *
 * setupAppleSpeechTranscriptionService
 *   -> {@link createContext}
 *     -> {@link setupAppleSpeechTranscription}
 *       -> {@link createAppleSpeechProvider}
 */
export function setupAppleSpeechTranscriptionService(options: { lifecycle: Lifecycle }) {
  const eventa = createContext(ipcMain)
  const setup = setupAppleSpeechTranscription({
    context: eventa.context,
    provider: createAppleSpeechProvider(),
  })
  let disposal: Promise<void> | undefined

  const dispose = () => {
    disposal ??= (async () => {
      // Stop accepting native work before the transport cancels remaining invokes.
      await setup.dispose()
      eventa.dispose()
    })()
    return disposal
  }

  options.lifecycle.appHooks.onStop(dispose)

  return { dispose }
}
