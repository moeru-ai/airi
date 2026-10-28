import type { AudioInputSession } from '../../../src/types'

import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared/perf/io-trace'

/**
 * Waits until the voice host keeps a spoken input as a draft.
 *
 * Only the desktop inlay shows voice drafts, so the case reads the input outcome from the IO trace on every runtime.
 * The voice input span ends when the host settles the input. A kept draft sets the `drafted` outcome.
 *
 * Source: `settle` in `packages/stage-ui/src/composables/voice-input-trace.ts`.
 */
export async function waitForVoiceDraft(runtime: AudioInputSession, options: { timeout?: number } = {}): Promise<void> {
  const deadline = Date.now() + (options.timeout ?? 30_000)
  while (Date.now() < deadline) {
    const inputs = await runtime.completedSpans(IOSpanNames.VoiceInput)
    if (inputs.some(span => span.attributes[IOAttributes.VoiceInputOutcome] === 'drafted'))
      return
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const outcomes = (await runtime.completedSpans(IOSpanNames.VoiceInput)).map(span => String(span.attributes[IOAttributes.VoiceInputOutcome]))
  throw new Error(`Timed out waiting for a drafted voice input. Voice input outcomes: ${outcomes.join(', ') || 'none'}`)
}
