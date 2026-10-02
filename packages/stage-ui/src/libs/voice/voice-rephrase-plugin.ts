import type { TranscriptEdit, VoicePlugin } from '@proj-airi/core-agent'

export interface VoiceRephraseOptions {
  /** Reads the setting when an input starts. A disabled input submits the provider text unchanged. */
  enabled: () => boolean
  /** Returns the rewritten text. An empty result keeps the provider text. */
  rephrase: (text: string, signal: AbortSignal) => Promise<string>
  /** The longest time a rewrite can delay submission. After it, the input submits the provider text. */
  timeoutMs: number
}

/**
 * Rewrites the final transcript of each input with a chat model before submission.
 *
 * The rewrite is a checked transcript patch. The raw provider text stays in the transcript history.
 * Interim text is not rewritten, because the provider can still revise it.
 *
 * Use when:
 * - Install it on a controller with the `transcript-patch` grant.
 *
 * Returns:
 * - A voice plugin named `voice-rephrase`.
 */
export function createVoiceRephrasePlugin(options: VoiceRephraseOptions): VoicePlugin {
  return {
    name: 'voice-rephrase',
    setup(scope) {
      scope.onSpeechInput((input) => {
        if (!options.enabled())
          return undefined

        input.subscribe({ transcript: 'raw', scheduling: 'latest', timeoutMs: options.timeoutMs, waitForSubmissionMs: options.timeoutMs }, async (ctx) => {
          const { segments, text } = ctx.snapshot.transcript
          if (!segments.length || segments.some(segment => !segment.final) || !text.trim())
            return

          const rewritten = (await options.rephrase(text, ctx.signal)).trim()
          if (!rewritten || rewritten === text.trim())
            return

          // The first segment carries the complete rewrite. The other segments become empty.
          const edits: TranscriptEdit[] = segments.map((segment, index) => ({
            segmentId: segment.id,
            range: { kind: 'segment' },
            expectedText: segment.text,
            replacement: index === 0 ? rewritten : '',
          }))
          ctx.patch({ edits, evidenceIds: [] })
        })
        return undefined
      })
      return undefined
    },
  }
}
