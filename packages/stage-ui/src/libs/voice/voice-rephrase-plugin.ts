import type { TranscriptEdit, VoicePlugin } from '@proj-airi/core-agent'

export interface VoiceRephraseOptions {
  /** Reads the setting when an input starts. A disabled input submits the provider text unchanged. */
  enabled: () => boolean
  /**
   * Returns one rewritten text for each segment, in the same order.
   * A result with another length leaves the transcript unchanged.
   */
  rephrase: (segments: readonly string[], signal: AbortSignal) => Promise<readonly string[]>
  /** The longest time a rewrite can delay submission. After it, the input submits the provider text. */
  timeoutMs: number
  /**
   * Interim text that stays the same this long starts a speculative rewrite. A pause before the end of speech
   * usually gives this quiet time, so the rewrite is often ready when the provider finishes.
   *
   * @default 600
   */
  speculateAfterMs?: number
}

/**
 * Rewrites the final transcript of each input with a chat model before submission.
 *
 * The rewrite is a checked transcript patch. The raw provider text stays in the transcript history.
 * Each segment keeps its own rewrite, so segment-level evidence, such as speaker labels, stays aligned.
 *
 * Speculation:
 * - While the speaker talks, interim text that stays the same for `speculateAfterMs` starts a rewrite.
 *   New text aborts that rewrite.
 * - At finalization, a speculative rewrite of the same segment texts is reused, even when it is still running.
 *   Other final text starts a new rewrite. Speculation costs one model request for each pause with new text.
 *
 * Use when:
 * - Install it on a voice controller. It needs no grant.
 *
 * Returns:
 * - A voice plugin named `voice-rephrase`.
 */
export function createVoiceRephrasePlugin(options: VoiceRephraseOptions): VoicePlugin {
  return {
    name: 'voice-rephrase',
    setup(scope) {
      scope.onInput((input) => {
        if (!options.enabled())
          return

        // The newest speculative rewrite and the segment texts that it read.
        let speculation: { key: string, result: Promise<readonly string[]> } | undefined

        input.watch(async (document, signal) => {
          const segments = document.raw.segments.map(segment => segment.text)
          if (!document.raw.text.trim())
            return

          const result = options.rephrase(segments, signal)
          // The key is the segment texts in order. Equal keys give equal rewrite requests.
          speculation = { key: JSON.stringify(segments), result }
          // The run stays active until the rewrite settles, so newer text aborts the request.
          // A failure is not reported here. Finalization starts a new rewrite instead.
          await result.catch(() => {})
        }, {
          key: document => JSON.stringify(document.raw.segments.map(segment => segment.text)),
          debounceMs: options.speculateAfterMs ?? 600,
        })

        input.finalize(async (ctx) => {
          const { segments, text } = ctx.document.raw
          if (!segments.length || !text.trim())
            return

          const texts = segments.map(segment => segment.text)
          const reusable = speculation?.key === JSON.stringify(texts) ? speculation.result : undefined
          // An aborted or failed speculation rejects. A fresh request then runs in the rest of the stage timeout.
          const rewritten = reusable
            ? await reusable.catch(() => options.rephrase(texts, ctx.signal))
            : await options.rephrase(texts, ctx.signal)
          // A merged or split answer cannot keep segment boundaries, so the provider text stays.
          if (rewritten.length !== segments.length)
            return

          // Segment texts join without a separator, so each replacement keeps its segment's outer whitespace.
          const edits: TranscriptEdit[] = segments.flatMap((segment, index) => {
            const content = rewritten[index].trim()
            if (content === segment.text.trim())
              return []
            const replacement = content ? `${/^\s*/.exec(segment.text)![0]}${content}${/\s*$/.exec(segment.text)![0]}` : ''
            return [{ segmentId: segment.id, range: { kind: 'segment' as const }, expectedText: segment.text, replacement }]
          })
          if (edits.length)
            ctx.patch(edits)
        }, { timeoutMs: options.timeoutMs })
      })
      return undefined
    },
  }
}
