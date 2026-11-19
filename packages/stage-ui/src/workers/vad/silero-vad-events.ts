import { defineInvokeEventa } from '@moeru/eventa'

/** One 32 ms window for the Silero VAD Worker: 512 mono samples at 16 kHz. */
export interface SileroVadWindow {
  readonly samples: Float32Array
  /** The window does not continue the previous one, so the model starts a new state before it. */
  readonly reset: boolean
}

/**
 * Scores one window with the model in the Worker. The result is the speech probability, from 0 to 1.
 * The Worker scores windows in arrival order, because each score updates the model state for the next window.
 */
export const scoreSileroVadWindow = defineInvokeEventa<number, SileroVadWindow>('eventa:vad:silero:score')

/** Waits for the windows that the Worker already has, then releases the model. Later windows are rejected. */
export const closeSileroVad = defineInvokeEventa<void>('eventa:vad:silero:close')
