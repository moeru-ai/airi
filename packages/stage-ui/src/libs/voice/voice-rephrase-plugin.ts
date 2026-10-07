import type { TranscriptEdit, VoicePlugin } from '@proj-airi/core-agent'

import { array, parse, string } from 'valibot'

const rephrasedSegmentsSchema = array(string())

/**
 * Reads the JSON array of rewritten segments from a model reply.
 * Some models wrap JSON in a Markdown code fence. Any other shape throws.
 */
export function parseRephrasedSegments(reply: string): string[] {
  const json = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return parse(rephrasedSegmentsSchema, JSON.parse(json))
}

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
}

/**
 * Rewrites the final transcript of each input with a chat model before submission.
 *
 * The rewrite is a checked transcript patch. The raw provider text stays in the transcript history.
 * Interim text is not rewritten, because the provider can still revise it.
 * Each segment keeps its own rewrite, so segment-level evidence, such as speaker labels, stays aligned.
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

          const rewritten = await options.rephrase(segments.map(segment => segment.text), ctx.signal)
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
            ctx.patch({ edits, evidenceIds: [] })
        })
        return undefined
      })
      return undefined
    },
  }
}
