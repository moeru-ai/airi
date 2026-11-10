import type { AudioWindow } from '@proj-airi/pipelines-audio'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'

import { closeSileroVad, scoreSileroVadWindow } from './silero-vad-events'

export interface SileroVadOptions {
  /**
   * The Worker that runs the model. It must serve the Silero VAD events of `silero-vad-events`.
   *
   * @default A new Silero VAD Worker
   */
  readonly worker?: Worker
}

/**
 * Scores 32 ms windows with Silero VAD in a Worker of its own, so model inference does not run on the main thread.
 *
 * The Worker starts to load the model when this object is created, and `close` ends the Worker. Speech admission and
 * recording remain outside the model. When the Worker fails, every pending and later score rejects.
 */
export class SileroVad {
  private readonly worker: Worker
  private readonly scoreWindow
  private readonly closeModel
  private closing: Promise<void> | undefined

  constructor(options: SileroVadOptions = {}) {
    this.worker = options.worker ?? new Worker(new URL('./silero-vad.worker.ts', import.meta.url), { type: 'module' })
    const { context } = createContext(this.worker)
    this.scoreWindow = defineInvoke(context, scoreSileroVadWindow)
    this.closeModel = defineInvoke(context, closeSileroVad)
  }

  /** The speech probability of one window, from 0 to 1. The signal also cancels the window in the Worker. */
  async score(window: AudioWindow, signal: AbortSignal): Promise<number> {
    signal.throwIfAborted()
    if (this.closing)
      throw new Error('VAD model is closed')
    if (window.sampleRate !== 16000 || window.channels[0]?.length !== 512)
      throw new Error('Silero VAD requires 512 samples at 16 kHz')

    // The model reads one channel, so the channels are averaged before the copy to the Worker.
    const samples = new Float32Array(512)
    for (const channel of window.channels) {
      for (let index = 0; index < samples.length; index++)
        samples[index] += channel[index] / window.channels.length
    }
    return await this.scoreWindow({ samples, reset: window.discontinuity }, { signal })
  }

  /** Waits for the windows that the Worker already has, releases the model, and ends the Worker. Repeated calls share completion. */
  close(): Promise<void> {
    // A failed Worker cannot answer the close request. Terminating it releases the model too.
    this.closing ??= this.closeModel().catch(() => {}).finally(() => this.worker.terminate())
    return this.closing
  }
}
