import type { StreamingTranscriber, TranscriptionBias } from '@proj-airi/core-agent'

import { errorMessageFrom } from '@moeru/std'
import { microphoneSource } from '@proj-airi/audio/browser'
import { encodeWav, fileSource } from '@proj-airi/audio/encoding'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { onScopeDispose, shallowRef } from 'vue'

/** One transcription of the clip. `bias` is absent for the plain run. */
export interface ComparisonRun {
  readonly label: string
  readonly bias?: TranscriptionBias
  readonly text?: string
  readonly milliseconds?: number
  readonly error?: string
}

async function transcribeClip(transcriber: StreamingTranscriber, clip: Blob, bias: TranscriptionBias | undefined, signal: AbortSignal) {
  let text = ''
  let completed = false
  for await (const event of transcriber.transcribe({ audio: fileSource(clip).open(signal), signal, ...(bias ? { bias } : {}) })) {
    if (event.type === 'update')
      text = event.segments.map(segment => segment.text).join('')
    else
      completed = true
  }
  if (!completed)
    throw new Error('The provider stopped before it completed the transcription')
  return text
}

/**
 * Transcribes one clip with the active Hearing provider twice: once without bias, then once with the given phrases.
 *
 * The runs go one after the other, because a local model allocates its memory for each request.
 * Both runs use one transcriber, made from the Hearing settings when the comparison starts. A new comparison or the page unmount aborts the run in flight.
 */
export function useBiasComparison() {
  const hearing = useHearingStore()
  const runs = shallowRef<readonly ComparisonRun[]>([])
  const running = shallowRef(false)
  let current: AbortController | undefined

  async function compare(clip: Blob, phrases: readonly string[]) {
    current?.abort('Replaced by a new comparison')
    const controller = new AbortController()
    current = controller
    running.value = true

    const planned: ComparisonRun[] = [
      { label: 'Without bias' },
      { label: `With ${phrases.length} phrases`, bias: { phrases } },
    ]
    runs.value = planned
    try {
      let transcriber: StreamingTranscriber
      try {
        transcriber = hearing.createTranscriber()
      }
      catch (cause) {
        const error = errorMessageFrom(cause) ?? 'The Hearing provider is not ready'
        runs.value = planned.map(run => ({ ...run, error }))
        return
      }
      for (const [index, run] of planned.entries()) {
        const startedAt = performance.now()
        let result: ComparisonRun
        try {
          const text = await transcribeClip(transcriber, clip, run.bias, controller.signal)
          result = { ...run, text, milliseconds: performance.now() - startedAt }
        }
        catch (cause) {
          if (controller.signal.aborted)
            return
          result = { ...run, error: errorMessageFrom(cause) ?? 'Transcription failed' }
        }
        runs.value = runs.value.map((existing, position) => position === index ? result : existing)
      }
    }
    finally {
      if (current === controller)
        running.value = false
    }
  }

  onScopeDispose(() => current?.abort('Devtool closed'))

  return { runs, running, compare }
}

/**
 * Records the microphone as a 16 kHz mono WAV clip.
 *
 * `stop` ends the input normally, so the clip keeps all audio up to that moment.
 * The page unmount cancels a recording that is still open.
 */
export function useClipRecorder() {
  const recording = shallowRef(false)
  const error = shallowRef<string>()
  let stopInput: (() => void) | undefined

  async function record(): Promise<Blob | undefined> {
    error.value = undefined
    const connection = new AbortController()
    const reader = microphoneSource({ audio: true }).open(connection.signal).getReader()
    // Cancelling the reader resolves its pending read as done. The wrapper then closes, and the WAV encoder finishes.
    stopInput = () => void reader.cancel('Recording stopped').catch(() => {})
    const input = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done)
          controller.close()
        else
          controller.enqueue(value)
      },
    })
    recording.value = true
    try {
      return await encodeWav(input, { sampleRate: 16000, channels: 1 })
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Recording failed'
      return undefined
    }
    finally {
      recording.value = false
      stopInput = undefined
      connection.abort('Recording finished')
    }
  }

  onScopeDispose(() => stopInput?.())

  return { recording, error, record, stop: () => stopInput?.() }
}
