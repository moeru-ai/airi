import type { PcmBlock } from './audio-input'

import { nanoid } from 'nanoid/non-secure'

/**
 * The group's output state when it settled, with the rendered position of each clip that started.
 * Estimated rendered position is not proof of perception or an exact spoken word boundary.
 */
export type PlaybackReceipt = {
  readonly groupId: string
  readonly played: readonly { readonly clipId: string, readonly throughMs: number }[]
} & ({ readonly status: 'silent' } | { readonly status: 'failed', readonly error: Error })

/** Clip cancellation stops only its audio and preserves the containing group's remaining queue. */
export interface PlaybackClip {
  readonly id: string
  readonly audio: Blob | ReadableStream<PcmBlock>
  readonly signal?: AbortSignal
  /** The driver calls this when the first audio is scheduled for playback. */
  readonly onStart?: () => void
}

/** Stop resolves only after silence. Driver failure rejects instead of reporting false silence. */
export interface PlayingAudio {
  readonly done: Promise<{ throughMs: number }>
  stop: (options: { fadeMs: number }) => Promise<{ throughMs: number }>
}

/** The platform owns decoding, audio-clock fades, and owned node cleanup. */
export interface PlaybackDriver {
  play: (clip: PlaybackClip) => PlayingAudio
}

/** Group identity is fresh even when labels match. Finished and stopped groups cannot reopen. */
export interface PlaybackGroup {
  readonly id: string
  /** The caller's name for diagnostics, for example a conversation turn. It does not affect playback. */
  readonly label: string
  enqueue: (clip: PlaybackClip) => Promise<'ended' | 'stopped' | 'failed'>
  finish: () => Promise<PlaybackReceipt>
  stop: (options: { fadeMs: number }) => Promise<PlaybackReceipt>
}

/** Conversation ownership stays outside this audio-only contract. */
export interface AudioPlayback {
  openGroup: (label: string) => PlaybackGroup
}

interface PendingClip {
  readonly clip: PlaybackClip
  readonly result: ReturnType<typeof Promise.withResolvers<'ended' | 'stopped' | 'failed'>>
}

function releaseClip(clip: PlaybackClip) {
  if (clip.audio instanceof ReadableStream)
    return clip.audio.cancel('Playback discarded the clip').catch(() => {})
}

class OutputGroup implements PlaybackGroup {
  readonly id = nanoid()
  private readonly completion = Promise.withResolvers<PlaybackReceipt>()
  private readonly pending: PendingClip[] = []
  private readonly played = new Map<string, number>()
  private readonly ids = new Set<string>()
  private active: { entry: PendingClip, audio: PlayingAudio, release: () => void } | undefined
  private sealed = false
  private stopping = false
  private settled = false

  constructor(private readonly driver: PlaybackDriver, readonly label: string) {}

  enqueue(clip: PlaybackClip) {
    if (this.sealed || clip.signal?.aborted) {
      void releaseClip(clip)
      return Promise.resolve('stopped' as const)
    }
    if (this.ids.has(clip.id)) {
      void releaseClip(clip)
      return Promise.resolve('failed' as const)
    }
    this.ids.add(clip.id)
    const entry = { clip, result: Promise.withResolvers<'ended' | 'stopped' | 'failed'>() }
    this.pending.push(entry)
    this.next()
    return entry.result.promise
  }

  finish() {
    this.sealed = true
    this.next()
    return this.completion.promise
  }

  stop(options: { fadeMs: number }) {
    if (!Number.isFinite(options.fadeMs) || options.fadeMs < 0)
      throw new Error('Fade duration must be finite and nonnegative')
    if (this.stopping || this.settled)
      return this.completion.promise
    this.sealed = true
    this.stopping = true
    for (const entry of this.pending.splice(0)) {
      void releaseClip(entry.clip)
      entry.result.resolve('stopped')
    }
    const active = this.active
    if (!active) {
      this.complete()
    }
    else {
      void Promise.resolve().then(() => active.audio.stop(options)).then((receipt) => {
        active.release()
        this.played.set(active.entry.clip.id, receipt.throughMs)
        active.entry.result.resolve('stopped')
        this.active = undefined
        this.complete()
      }, cause => this.fail(cause))
    }
    return this.completion.promise
  }

  /** Triggering workflow: group enqueue or driver completion → next owned clip → platform playback. */
  private next() {
    if (this.active || this.settled || this.stopping)
      return
    let entry = this.pending.shift()
    while (entry?.clip.signal?.aborted) {
      void releaseClip(entry.clip)
      entry.result.resolve('stopped')
      entry = this.pending.shift()
    }
    if (!entry) {
      if (this.sealed)
        this.complete()
      return
    }
    try {
      const active = { entry, audio: this.driver.play(entry.clip), release: () => {} }
      this.active = active
      let cancelled = false
      const finish = (receipt: { throughMs: number }, status: 'ended' | 'stopped') => {
        active.release()
        if (this.active !== active || this.stopping)
          return
        this.played.set(active.entry.clip.id, receipt.throughMs)
        active.entry.result.resolve(status)
        this.active = undefined
        this.next()
      }
      const abort = () => {
        if (this.stopping || this.active !== active || cancelled)
          return
        cancelled = true
        void Promise.resolve().then(() => active.audio.stop({ fadeMs: 0 })).then(receipt => finish(receipt, 'stopped'), cause => this.fail(cause))
      }
      active.release = () => active.entry.clip.signal?.removeEventListener('abort', abort)
      active.entry.clip.signal?.addEventListener('abort', abort, { once: true })
      void active.audio.done.then((receipt) => {
        if (!cancelled)
          finish(receipt, 'ended')
      }, cause => this.fail(cause))
      if (active.entry.clip.signal?.aborted)
        abort()
    }
    catch (cause) {
      void releaseClip(entry.clip)
      entry.result.resolve('failed')
      this.fail(cause)
    }
  }

  private fail(cause: unknown) {
    if (this.settled)
      return
    this.sealed = true
    this.active?.release()
    this.active?.entry.result.resolve('failed')
    this.active = undefined
    this.pending.splice(0).forEach((entry) => {
      void releaseClip(entry.clip)
      entry.result.resolve('failed')
    })
    this.complete(cause instanceof Error ? cause : new Error('Playback failed', { cause }))
  }

  private complete(error?: Error) {
    if (this.settled)
      return
    this.settled = true
    const played = [...this.played].map(([clipId, throughMs]) => ({ clipId, throughMs }))
    this.completion.resolve(error ? { groupId: this.id, played, status: 'failed', error } : { groupId: this.id, played, status: 'silent' })
  }
}

/** Keeps group queues independent. It does not interpret speech signals or notify an agent. */
export class Playback implements AudioPlayback {
  constructor(private readonly driver: PlaybackDriver) {}

  openGroup(label: string): PlaybackGroup {
    return new OutputGroup(this.driver, label)
  }
}
