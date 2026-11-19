import type { TurnRef } from '@proj-airi/core-agent'

import type { VoiceSpeechCommand } from './bus'

import { defineInvoke } from '@moeru/eventa'
import { nanoid } from 'nanoid/non-secure'

import { getSpeechBusContext, voiceSnapshotChanged, voiceSpeechCommand } from './bus'

/** Orders producer commands across renderers. Cancellation bypasses pending completion waits. */
export class SpeechClient {
  private readonly invoke = defineInvoke(getSpeechBusContext(), voiceSpeechCommand)
  private readonly identity: Pick<VoiceSpeechCommand, 'originId' | 'producerId' | 'turn'>
  private pending: ReturnType<typeof this.invoke>
  private sealed = false
  private cancelled = false
  private readonly lifetime = new AbortController()
  private readonly stopHostListener: () => void

  constructor(turn: TurnRef, purpose: string) {
    // Each client opens one producer. The host matches all later commands with these same fields.
    this.identity = { turn: { ...turn }, originId: nanoid(), producerId: nanoid() }
    this.stopHostListener = getSpeechBusContext().on(voiceSnapshotChanged, ({ body }) => {
      if (body && !body.connected)
        this.close('Speech host disconnected')
    })
    this.pending = this.invoke({ ...this.identity, type: 'open', purpose }, { signal: this.lifetime.signal })
    this.observeCompletion(this.pending)
  }

  write(value: string) {
    return this.send({ ...this.identity, type: 'text', value })
  }

  special(value: string) {
    return this.send({ ...this.identity, type: 'special', value })
  }

  flush() {
    return this.send({ ...this.identity, type: 'flush' })
  }

  end() {
    const result = this.send({ ...this.identity, type: 'end' })
    this.sealed = true
    return result
  }

  /** Completes this response after all its producers and owned playback drain. */
  finish() {
    this.sealed = true
    return this.pending.then(result => result.status === 'accepted'
      ? this.invoke({ ...this.identity, type: 'finish' }, { signal: this.lifetime.signal })
      : result).finally(() => this.close('Speech producer finished'))
  }

  cancel(reason: string) {
    this.sealed = true
    this.cancelled = true
    return this.invoke({ ...this.identity, type: 'cancel', reason }, { signal: this.lifetime.signal }).finally(() => this.close(reason))
  }

  private send(command: VoiceSpeechCommand) {
    if (this.sealed)
      return Promise.resolve({ status: 'closed' as const })
    this.pending = this.pending.then((result) => {
      if (this.cancelled || result.status !== 'accepted')
        return { status: 'closed' as const }
      return this.invoke(command, { signal: this.lifetime.signal })
    })
    this.observeCompletion(this.pending)
    return this.pending
  }

  private observeCompletion(pending: ReturnType<typeof this.invoke>) {
    void pending.then((result) => {
      if (result.status !== 'accepted')
        this.close('Speech producer closed')
    }, () => this.close('Speech producer request failed'))
  }

  private close(reason: string) {
    this.sealed = true
    this.lifetime.abort(reason)
    this.stopHostListener()
  }
}
