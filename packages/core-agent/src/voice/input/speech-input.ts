import type { SpeakerEvidence, SpeechSelection, SpeechSnapshot } from './snapshot'
import type { TranscriptionEvent, WriteResult } from './transcript'

import { Transcript } from './transcript'

interface ContextEntry {
  readonly plugin: string
  readonly key: string
  readonly segmentId?: string
  readonly revision: number
  readonly value: unknown
  readonly current: () => boolean
}

/** Accepted input identity stays with its character session until submission or cancellation. */
export class SpeechInput {
  private readonly document = new Transcript()
  get transcript(): Pick<Transcript, 'raw' | 'corrected' | 'history' | 'patchHistory' | 'ended' | 'select' | 'patchVersions'> { return this.document }
  private readonly entries = new Map<string, ContextEntry>()
  private readonly versions = new Map<string, number>()
  private readonly listeners = new Set<() => void>()
  private sealed = false
  private speakersFrozen = false
  private readonly snapshotVersions = new WeakMap<SpeechSnapshot, string>()
  private speaker: SpeakerEvidence | undefined

  constructor(readonly id: string, readonly sessionId: string) {}

  get closed(): boolean { return this.sealed }
  get speakers(): SpeakerEvidence | undefined { return this.speaker }

  accept(event: TranscriptionEvent) {
    if (this.sealed)
      throw new Error('Speech input is closed')
    this.document.accept(event)
    this.changed()
  }

  patch(...args: Parameters<Transcript['patch']>): WriteResult {
    if (this.sealed)
      return { status: 'rejected', reason: 'closed' }
    const result = this.document.patch(...args)
    if (result.status === 'applied')
      this.changed()
    return result
  }

  finishTranscription() {
    if (!this.document.ended)
      throw new Error('Provider closed without transcription completion')
    this.speakersFrozen = true
  }

  updateSpeakers(evidence: Omit<SpeakerEvidence, 'revision'>): WriteResult {
    if (this.sealed || this.speakersFrozen)
      return { status: 'rejected', reason: 'closed' }
    if (!Number.isFinite(evidence.voicedMs) || evidence.voicedMs < 0 || evidence.candidates.some(candidate => !candidate.speakerId || !Number.isFinite(candidate.score)))
      throw new Error('Invalid speaker evidence')
    this.speaker = Object.freeze({ ...evidence, revision: (this.speaker?.revision ?? 0) + 1, candidates: Object.freeze(evidence.candidates.map(candidate => Object.freeze({ ...candidate }))) })
    this.changed()
    return { status: 'applied' }
  }

  get context(): SpeechSnapshot['context'] {
    return [...this.entries.values()].map(({ current: _current, ...entry }) => Object.freeze(entry))
  }

  snapshot(selection: SpeechSelection, correctionPlugins: readonly string[], targetSegmentId?: string): SpeechSnapshot {
    const document = this.transcript.select(selection.transcript, correctionPlugins)
    const index = document.segments.findIndex(segment => segment.id === targetSegmentId)
    const target = document.segments[index]
    const segmentScope = typeof selection.scope === 'object' ? selection.scope : undefined
    const transcript = segmentScope ? { ...document, text: target?.text ?? '', segments: target ? [target] : [] } : document
    const neighborView = segmentScope?.neighborTranscript ?? selection.transcript
    const neighborsDocument = this.transcript.select(neighborView, correctionPlugins)
    const neighbors = segmentScope && target ? neighborsDocument.segments.slice(Math.max(0, index - segmentScope.neighbors), index + segmentScope.neighbors + 1).filter(segment => segment.id !== target.id).map(segment => ({ view: neighborView, segment })) : []
    const snapshot: SpeechSnapshot = Object.freeze({
      inputId: this.id,
      sessionId: this.sessionId,
      transcript: Object.freeze({ ...transcript, view: selection.transcript, targetSegmentId }),
      neighbors: Object.freeze(neighbors),
      correctionPlugins,
      ...(selection.speakers ? { speakers: this.speaker } : {}),
      context: Object.freeze((selection.context ?? []).map((selector) => {
        const segmentId = selector.scope === 'target-segment' ? targetSegmentId : undefined
        const identity = JSON.stringify([selector.plugin, selector.key, segmentId])
        const entry = this.entries.get(identity)
        return Object.freeze({ plugin: selector.plugin, key: selector.key, ...(segmentId ? { segmentId } : {}), revision: this.versions.get(identity) ?? 0, ...(entry ? { value: entry.value } : {}) })
      })),
    })
    const selectedIds = snapshot.transcript.segments.map(segment => segment.id)
    const neighborIds = neighbors.map(neighbor => neighbor.segment.id)
    this.snapshotVersions.set(snapshot, JSON.stringify([
      snapshot.transcript.segments,
      neighbors,
      segmentScope ? [index < segmentScope.neighbors, document.segments.length - index - 1 < segmentScope.neighbors] : this.transcript.raw.revision,
      selection.transcript === 'corrected' ? this.transcript.patchVersions(selectedIds, correctionPlugins) : [],
      neighborView === 'corrected' ? this.transcript.patchVersions(neighborIds, correctionPlugins) : [],
      snapshot.context.map(entry => [entry.plugin, entry.key, entry.segmentId, entry.revision]),
      snapshot.speakers?.revision,
    ]))
    return snapshot
  }

  /** Revisions, including absent context keys, are compared without serializing application values. */
  basis(snapshot: SpeechSnapshot): string {
    return this.snapshotVersions.get(snapshot)!
  }

  publish(plugin: string, key: string, value: unknown, current: () => boolean, segmentId?: string): WriteResult {
    if (this.sealed)
      return { status: 'rejected', reason: 'closed' }
    if (!current())
      return { status: 'rejected', reason: 'stale' }
    const identity = JSON.stringify([plugin, key, segmentId])
    const revision = (this.versions.get(identity) ?? 0) + 1
    this.versions.set(identity, revision)
    this.entries.set(identity, { plugin, key, ...(segmentId ? { segmentId } : {}), value, revision, current })
    this.changed()
    return { status: 'applied' }
  }

  deleteContext(plugin: string, key: string, current: () => boolean, segmentId?: string): WriteResult {
    if (this.sealed)
      return { status: 'rejected', reason: 'closed' }
    if (!current())
      return { status: 'rejected', reason: 'stale' }
    const identity = JSON.stringify([plugin, key, segmentId])
    this.entries.delete(identity)
    this.versions.set(identity, (this.versions.get(identity) ?? 0) + 1)
    this.changed()
    return { status: 'applied' }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Triggering workflow: transcript or context publication → dependency invalidation → subscribed plugin snapshots. */
  private changed() {
    let removed = false
    do {
      removed = this.document.invalidate()
      for (const [identity, entry] of this.entries) {
        if (!entry.current()) {
          this.entries.delete(identity)
          this.versions.set(identity, (this.versions.get(identity) ?? 0) + 1)
          removed = true
        }
      }
    } while (removed)
    for (const listener of this.listeners)
      listener()
  }

  removePlugin(plugin: string) {
    if (this.sealed)
      return
    this.document.removeAuthor(plugin)
    for (const [identity, entry] of this.entries) {
      if (entry.plugin === plugin) {
        this.entries.delete(identity)
        this.versions.set(identity, entry.revision + 1)
      }
    }
    this.changed()
  }

  seal() {
    this.sealed = true
    this.listeners.clear()
  }
}
