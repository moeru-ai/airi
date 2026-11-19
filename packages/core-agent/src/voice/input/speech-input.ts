import type { TranscriptEdit, TranscriptionEvent, WriteResult } from './transcript'
import type { SpeakerEvidence, TranscriptDocument } from './types'

import { Transcript } from './transcript'

/**
 * The document of one accepted speech input.
 *
 * State model:
 * - Open: provider updates, manual corrections, and speaker evidence change the document. Each change increases
 *   `document.version` and notifies listeners synchronously.
 * - Transcribed: `finishTranscription` freezes provider text and speaker evidence. Corrections still apply, so
 *   finalization stages can patch the complete text.
 * - Sealed: `seal` rejects every write and removes listeners. The submission reads the sealed document.
 */
export class SpeechInput {
  private readonly text = new Transcript()
  private readonly listeners = new Set<(document: TranscriptDocument) => void>()
  private sealed = false
  private transcribed = false
  private speaker: SpeakerEvidence | undefined
  private version = 0
  // The newest document. It is built on demand once for each version, because listeners and readers share it.
  private cached: TranscriptDocument | undefined

  constructor(readonly id: string, readonly sessionId: string) {}

  get closed(): boolean { return this.sealed }
  get transcript(): Pick<Transcript, 'raw' | 'corrected' | 'history' | 'patchHistory' | 'ended'> { return this.text }

  get document(): TranscriptDocument {
    this.cached ??= Object.freeze({
      inputId: this.id,
      sessionId: this.sessionId,
      version: this.version,
      raw: this.text.raw,
      corrected: this.text.corrected,
      ...(this.speaker ? { speakers: this.speaker } : {}),
    })
    return this.cached
  }

  accept(event: TranscriptionEvent) {
    if (this.sealed)
      throw new Error('Speech input is closed')

    this.text.accept(event)
    // A provider update can move a span that a manual correction targets. The correction then turns inactive.
    this.text.invalidate()
    this.changed()
  }

  /** `manual` marks a user correction. Plugin corrections apply only after transcription ends. */
  patch(author: string, proposal: { readonly edits: readonly TranscriptEdit[], readonly evidenceIds: readonly string[] }, manual = false): WriteResult {
    if (this.sealed)
      return { status: 'rejected', reason: 'closed' }
    if (!manual && !this.transcribed)
      return { status: 'rejected', reason: 'denied' }

    const result = this.text.patch(author, proposal, manual)
    if (result.status === 'applied')
      this.changed()
    return result
  }

  finishTranscription() {
    if (!this.text.ended)
      throw new Error('Provider closed without transcription completion')
    this.transcribed = true
  }

  updateSpeakers(evidence: Omit<SpeakerEvidence, 'revision'>): WriteResult {
    if (this.sealed || this.transcribed)
      return { status: 'rejected', reason: 'closed' }
    if (!Number.isFinite(evidence.voicedMs) || evidence.voicedMs < 0 || evidence.candidates.some(candidate => !candidate.speakerId || !Number.isFinite(candidate.score)))
      throw new Error('Invalid speaker evidence')
    this.speaker = Object.freeze({ ...evidence, revision: (this.speaker?.revision ?? 0) + 1, candidates: Object.freeze(evidence.candidates.map(candidate => Object.freeze({ ...candidate }))) })
    this.changed()
    return { status: 'applied' }
  }

  /** The listener receives each new document version synchronously, in change order. */
  subscribe(listener: (document: TranscriptDocument) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  seal() {
    this.sealed = true
    this.listeners.clear()
  }

  private changed() {
    this.version += 1
    this.cached = undefined
    const document = this.document
    for (const listener of this.listeners)
      listener(document)
  }
}
