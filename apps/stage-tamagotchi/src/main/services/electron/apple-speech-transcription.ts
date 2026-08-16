import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { ElectronAppleSpeechStreamInput } from '../../../shared/eventa'

import { defineInvokeHandler, defineStreamInvokeHandler, isReadableStream } from '@moeru/eventa'
import { getCapabilities, transcribeAudio, transcribePcmStream } from '@proj-airi/apple-speech-transcription'

import {
  electronAppleSpeechGetCapabilities,
  electronAppleSpeechTranscribe,
  electronAppleSpeechTranscribeStream,
} from '../../../shared/eventa'

/** Registers the macOS Apple Speech control boundary for one Electron window. */
export function createAppleSpeechTranscriptionService(params: {
  context: ReturnType<typeof createContext>['context']
}) {
  const disposeCapabilities = defineInvokeHandler(
    params.context,
    electronAppleSpeechGetCapabilities,
    () => getCapabilities(),
  )
  const disposeTranscription = defineInvokeHandler(
    params.context,
    electronAppleSpeechTranscribe,
    payload => transcribeAudio(payload.audio, payload.locale, payload.fileExtension),
  )
  const disposeStreamingTranscription = defineStreamInvokeHandler(
    params.context,
    electronAppleSpeechTranscribeStream,
    async function* (input, options) {
      if (!isReadableStream<ElectronAppleSpeechStreamInput>(input))
        throw new TypeError('Apple Speech streaming transcription requires a readable input stream.')

      const reader = input.getReader()
      const abortSignal = options?.abortController?.signal
      const cancelInput = () => {
        void reader.cancel(abortSignal?.reason).catch(() => undefined)
      }
      abortSignal?.addEventListener('abort', cancelInput, { once: true })

      try {
        const firstFrame = await reader.read()
        if (firstFrame.done || firstFrame.value.type !== 'start')
          throw new TypeError('Apple Speech streaming transcription requires a start frame before audio.')

        async function* audioFrames() {
          while (true) {
            const frame = await reader.read()
            if (frame.done)
              return
            if (frame.value.type !== 'audio')
              throw new TypeError('Apple Speech received more than one start frame.')

            yield frame.value.audio
          }
        }

        yield* transcribePcmStream(
          audioFrames(),
          firstFrame.value.locale,
          firstFrame.value.sampleRate,
          { signal: abortSignal },
        )
      }
      finally {
        abortSignal?.removeEventListener('abort', cancelInput)
        // Cancel pending reads before release so the native input pump cannot
        // retain this reader after the Eventa invocation stops.
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    },
  )

  return () => {
    disposeCapabilities()
    disposeTranscription()
    disposeStreamingTranscription()
  }
}
