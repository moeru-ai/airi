import type { SpeakerTracker, SpeakerVoiceprint } from '@sherpaw/speaker-diarization'

import { errorMessageFrom } from '@moeru/std'

/**
 * Preparation state of the speaker tracker Worker.
 *
 * - `idle`: no tracker is loaded.
 * - `preparing`: the model is downloading, or the Worker is starting and enrolling the voiceprints.
 * - `ready`: the tracker runs and has enrolled the current voiceprints.
 * - `error`: preparation or enrollment failed. The next `acquire` retries.
 */
export type SpeakerTrackerPreparation = 'idle' | 'preparing' | 'ready' | 'error'

export interface SpeakerTrackerRuntimeOptions {
  /** Creates the tracker Worker. Aborting the signal must cancel the creation or dispose the created tracker. */
  readonly createTracker: (signal: AbortSignal) => Promise<SpeakerTracker>
  readonly onPreparationChange?: (preparation: SpeakerTrackerPreparation, error?: string) => void
}

/** One tracker creation and the controller that cancels it. */
interface TrackerLoad {
  controller: AbortController
  tracker: Promise<SpeakerTracker>
}

/**
 * Owns one speaker tracker Worker and the voiceprints that it enrolls.
 *
 * `acquire` loads the tracker on first use and shares it with later callers. Enrolled speakers get the numbers
 * 0, 1, ... in the order of `setVoiceprints`, so a speaker number maps back to its voiceprint.
 * `dispose` terminates the Worker and frees the model memory. A later `acquire` loads the tracker again.
 */
export class SpeakerTrackerRuntime {
  private voiceprints: readonly SpeakerVoiceprint[] = []
  private loading: TrackerLoad | undefined
  /** Enrollment changes run one after another, so the last `setVoiceprints` call decides the enrolled speakers. */
  private enrolling: Promise<void> = Promise.resolve()

  constructor(private readonly options: SpeakerTrackerRuntimeOptions) {}

  /** Resolves to the shared tracker after it has enrolled the current voiceprints. */
  acquire(): Promise<SpeakerTracker> {
    if (this.loading)
      return this.loading.tracker

    const controller = new AbortController()
    const tracker = this.load(controller.signal)
    const loading: TrackerLoad = { controller, tracker }
    this.loading = loading
    this.options.onPreparationChange?.('preparing')
    tracker.then(
      () => {
        if (this.loading === loading)
          this.options.onPreparationChange?.('ready')
      },
      error => this.fail(loading, error),
    )
    return tracker
  }

  /**
   * Replaces the enrolled speakers. A loaded tracker forgets its speakers and enrolls these voiceprints in order.
   * Without a loaded tracker, the next `acquire` enrolls them.
   * A failed enrollment disposes the tracker and reports `error`, so the next `acquire` starts again.
   */
  async setVoiceprints(voiceprints: readonly SpeakerVoiceprint[]): Promise<void> {
    this.voiceprints = [...voiceprints]
    const loading = this.loading
    if (!loading)
      return

    try {
      await this.enroll(await loading.tracker)
    }
    catch (error) {
      this.fail(loading, error)
      throw error
    }
  }

  /** Terminates the Worker. Pending `acquire` calls reject. */
  dispose(): void {
    const loading = this.loading
    if (!loading)
      return
    this.release(loading, 'Speaker tracker disposed')
    this.options.onPreparationChange?.('idle')
  }

  /** Releases a failed tracker. A failure of a replaced or disposed tracker changes nothing. */
  private fail(loading: TrackerLoad, error: unknown): void {
    if (this.loading !== loading)
      return
    this.release(loading, 'Speaker tracker failed')
    this.options.onPreparationChange?.('error', errorMessageFrom(error) ?? 'Speaker tracker failed to prepare')
  }

  private release(loading: TrackerLoad, reason: string): void {
    this.loading = undefined
    loading.controller.abort(reason)
    void loading.tracker.then(tracker => tracker.dispose(), () => {})
  }

  private async load(signal: AbortSignal): Promise<SpeakerTracker> {
    const tracker = await this.options.createTracker(signal)
    try {
      await this.enroll(tracker)
      signal.throwIfAborted()
      return tracker
    }
    catch (error) {
      tracker.dispose()
      throw error
    }
  }

  private enroll(tracker: SpeakerTracker): Promise<void> {
    const enrolled = this.enrolling.catch(() => {}).then(async () => {
      await tracker.reset({ forgetEnrolled: true })
      for (const voiceprint of this.voiceprints)
        await tracker.enrollVoiceprint(voiceprint)
    })
    this.enrolling = enrolled
    return enrolled
  }
}
