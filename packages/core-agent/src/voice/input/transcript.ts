import { nanoid } from 'nanoid/non-secure'

/** A write never starts another asynchronous operation. It checks and changes state synchronously. */
export type WriteResult
  = { readonly status: 'applied' }
    | { readonly status: 'rejected', readonly reason: 'stale' | 'closed' | 'conflict' | 'denied' }

/** Edits refer to raw tokens of the document that the author read. `expectedText` rejects an edit of changed text. */
export interface TranscriptEdit {
  readonly segmentId: string
  readonly range: { readonly kind: 'tokens', readonly start: number, readonly end: number } | { readonly kind: 'segment' }
  readonly expectedText: string
  readonly replacement: string
}

/** Token offsets address UTF-16 positions in their raw segment. */
export interface TranscriptToken {
  readonly text: string
  readonly start: number
  readonly end: number
}

/** Providers retain a segment ID only when they can identify the same segment across revisions. */
export interface TranscriptSegment {
  readonly id: string
  readonly revision: number
  readonly text: string
  readonly tokens: readonly TranscriptToken[]
  readonly final: boolean
}

/** Updates replace the complete raw document. Completion must match its last accepted revision. */
export type TranscriptionEvent
  = { readonly type: 'update', readonly revision: number, readonly segments: readonly TranscriptSegment[] }
    | { readonly type: 'complete', readonly revision: number }

/** Snapshots retain the accepted text independently of later provider updates. */
export interface TranscriptSnapshot {
  readonly revision: number
  readonly text: string
  readonly segments: readonly TranscriptSegment[]
}

/** Patch history keeps patches that a later provider update deactivated, for inspection. */
export interface TranscriptPatch {
  readonly id: string
  readonly author: string
  readonly manual: boolean
  readonly edits: readonly TranscriptEdit[]
  readonly evidenceIds: readonly string[]
  readonly active: boolean
}

interface AppliedPatch {
  readonly record: Omit<TranscriptPatch, 'active'>
  readonly spans: readonly { segmentId: string, revision: number, start: number, end: number, expectedText: string, replacement: string }[]
  active: boolean
}

/** Owns provider revisions and raw history. A completed transcript cannot reopen. */
export class Transcript {
  private current: TranscriptSnapshot = Object.freeze({ revision: 0, text: '', segments: Object.freeze([]) })

  private readonly updates: TranscriptSnapshot[] = []
  private complete = false
  private revision = 0
  private readonly patches: AppliedPatch[] = []

  get raw(): TranscriptSnapshot {
    return this.current
  }

  get history(): readonly TranscriptSnapshot[] {
    return this.updates.slice()
  }

  get ended(): boolean {
    return this.complete
  }

  /** Raw text with every active patch applied. `revision` counts raw updates and patch changes. */
  get corrected(): TranscriptSnapshot {
    const patches = this.patches.filter(patch => patch.active)
    const segments = this.raw.segments.map((segment) => {
      const spans = patches.flatMap(patch => patch.spans.filter(span => span.segmentId === segment.id)).sort((a, b) => b.start - a.start)
      let text = segment.text
      for (const span of spans)
        text = text.slice(0, span.start) + span.replacement + text.slice(span.end)

      return Object.freeze({ ...segment, text })
    })

    return Object.freeze({
      revision: this.revision,
      text: segments.map(segment => segment.text).join(''),
      segments: Object.freeze(segments),
    })
  }

  get patchHistory(): readonly TranscriptPatch[] {
    return this.patches.map(patch => Object.freeze({ ...patch.record, active: patch.active }))
  }

  patch(author: string, proposal: { edits: readonly TranscriptEdit[], evidenceIds: readonly string[] }, manual = false): WriteResult {
    const spans: AppliedPatch['spans'][number][] = []
    for (const edit of proposal.edits) {
      if (edit.range.kind === 'tokens' && (!Number.isSafeInteger(edit.range.start) || !Number.isSafeInteger(edit.range.end) || edit.range.start < 0 || edit.range.end <= edit.range.start))
        return { status: 'rejected', reason: 'conflict' }

      const segment = this.raw.segments.find(segment => segment.id === edit.segmentId)
      if (!segment)
        return { status: 'rejected', reason: 'stale' }

      const start = edit.range.kind === 'segment' ? 0 : segment.tokens[edit.range.start]?.start
      const end = edit.range.kind === 'segment' ? segment.text.length : segment.tokens[edit.range.end - 1]?.end
      if (start === undefined || end === undefined || end < start || segment.text.slice(start, end) !== edit.expectedText)
        return { status: 'rejected', reason: 'conflict' }

      const overlaps = (span: AppliedPatch['spans'][number]) => span.segmentId === segment.id && ((start < span.end && end > span.start) || (start === end && start === span.start))
      if (spans.some(overlaps) || this.patches.some(patch => patch.active && patch.spans.some(overlaps)))
        return { status: 'rejected', reason: 'conflict' }

      spans.push({ segmentId: segment.id, revision: segment.revision, start, end, expectedText: edit.expectedText, replacement: edit.replacement })
    }

    if (!spans.length)
      return { status: 'rejected', reason: 'conflict' }

    this.patches.push({ record: Object.freeze({ id: nanoid(), author, manual, edits: Object.freeze(proposal.edits.map(edit => Object.freeze({ ...edit, range: Object.freeze({ ...edit.range }) }))), evidenceIds: Object.freeze([...proposal.evidenceIds]) }), spans, active: true })
    this.revision += 1

    return { status: 'applied' }
  }

  invalidate(): boolean {
    let changed = false

    for (const patch of this.patches) {
      const targetChanged = patch.spans.some((span) => {
        const segment = this.raw.segments.find(segment => segment.id === span.segmentId)
        if (!segment)
          return true

        // Provider finality and unrelated appended text cannot revoke a user's unchanged target span.
        return patch.record.manual
          ? segment.text.slice(span.start, span.end) !== span.expectedText
          : segment.revision !== span.revision
      })
      if (patch.active && targetChanged) {
        patch.active = false
        changed = true
      }
    }

    if (changed)
      this.revision += 1

    return changed
  }

  /** Triggering workflow: provider output → SpeechInputAttempt → raw document update or completion. */
  accept(event: TranscriptionEvent) {
    if (this.complete)
      throw new Error('Transcription emitted after completion')

    if (event.type === 'complete') {
      if (event.revision !== this.current.revision || this.current.segments.some(segment => !segment.final))
        throw new Error('Transcription completion does not match final text')
      this.complete = true
      return
    }

    if (!Number.isSafeInteger(event.revision) || event.revision <= this.current.revision)
      throw new Error('Transcription revisions must increase')

    const ids = new Set<string>()
    const segments = event.segments.map((segment) => {
      if (ids.has(segment.id) || !segment.id || !Number.isSafeInteger(segment.revision) || segment.revision < 0)
        throw new Error('Invalid transcription segment identity')

      ids.add(segment.id)
      const previous = this.current.segments.find(item => item.id === segment.id)
      const changedTokens = previous && (segment.tokens.length !== previous.tokens.length || segment.tokens.some((token, index) => {
        const old = previous.tokens[index]
        return token.text !== old?.text || token.start !== old?.start || token.end !== old?.end
      }))
      if (previous && (segment.revision < previous.revision || (segment.revision === previous.revision && (segment.text !== previous.text || segment.final !== previous.final || changedTokens))))
        throw new Error('Changed segment requires a new revision')

      let end = 0
      for (const token of segment.tokens) {
        if (!Number.isSafeInteger(token.start) || !Number.isSafeInteger(token.end) || token.start < end || token.end <= token.start || token.end > segment.text.length || segment.text.slice(token.start, token.end) !== token.text)
          throw new Error('Invalid transcription token range')
        end = token.end
      }

      return Object.freeze({ ...segment, tokens: Object.freeze(segment.tokens.map(token => Object.freeze({ ...token }))) })
    })

    this.current = Object.freeze({ revision: event.revision, text: segments.map(segment => segment.text).join(''), segments: Object.freeze(segments) })
    this.updates.push(this.current)
    this.revision += 1
  }
}
