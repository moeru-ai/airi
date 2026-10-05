import type { SpeechSubscription } from './types'

import { errorFromCause } from '../../utils/error'

/** Settlement shared by plugin subscriptions, lifecycle tasks, and input plugin scopes. */
export type Settlement = Awaited<SpeechSubscription['done']>

export type Cleanup = () => void | Promise<void>

/** One callback owns its timeout, cancellation signal, and settlement. */
export class TaskLifetime {
  private readonly abort = new AbortController()
  private readonly completion = Promise.withResolvers<Settlement>()
  private timer: ReturnType<typeof setTimeout> | undefined
  closed = false
  readonly signal = this.abort.signal
  readonly done = this.completion.promise

  constructor(timeoutMs?: number) {
    if (timeoutMs !== undefined) {
      if (!Number.isFinite(timeoutMs) || timeoutMs < 0)
        throw new Error('Plugin timeout must be finite and nonnegative')
      this.timer = setTimeout(() => this.stop({ status: 'failed', error: new Error('Plugin task timed out') }), timeoutMs)
    }
  }

  stop(outcome: Settlement) {
    if (this.closed)
      return
    this.closed = true
    clearTimeout(this.timer)
    if (outcome.status !== 'finished')
      this.abort.abort(outcome)
    this.completion.resolve(outcome)
  }

  async run(callback: () => Promise<void>): Promise<Settlement> {
    // Publish the active lifetime before a callback can complete or cancel it.
    void Promise.resolve().then(() => this.closed ? undefined : callback()).then(
      () => this.stop({ status: 'finished' }),
      cause => this.stop({ status: 'failed', error: errorFromCause(cause, 'Plugin callback failed') }),
    )
    return this.done
  }
}
