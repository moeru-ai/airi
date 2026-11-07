/**
 * The noise floor follows a quieter level with this time constant, so it finds a quiet room again within about a second.
 */
const FLOOR_FALL_SECONDS = 0.25
/**
 * The noise floor rises at most this much per second, in level units (0.02 is about 1.2 dB). Steady noise, for example
 * a fan, becomes part of the floor within a few seconds. Speech comes in bursts, so the floor stays below it.
 */
const FLOOR_RISE_PER_SECOND = 0.02
/** The gate opens when the level is this far above the floor (about 7 dB), and closes below the next value (about 3 dB). */
const OPEN_ABOVE_FLOOR = 0.12
const CLOSE_ABOVE_FLOOR = 0.05
/** Above the floor by this much (about 24 dB), the output is 1. */
const FULL_ABOVE_FLOOR = 0.4
/**
 * The gate opens only after the level stays above the opening threshold for this long. A click of a key is shorter than
 * two spectrum hops, and a syllable is much longer.
 */
const OPEN_AFTER_SECONDS = 0.06

function smoothstep(from: number, to: number, value: number) {
  const progress = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return progress * progress * (3 - 2 * progress)
}

/**
 * Turns the level of one band into how much a voice stands out from the background, from 0 to 1.
 *
 * - The noise floor of the band adapts: it follows quieter levels fast, and rises toward louder ones slowly.
 * - A gate with hysteresis decides whether the band has a voice, so a level near the threshold does not switch on and off.
 *   It opens only for a sound longer than a click.
 * - A smoothstep shapes the output, so small changes just above the floor stay small.
 *
 * Levels are in the range 0 to 1, where 1 is 60 dB above 0, as `observeSpectrum` publishes them.
 */
export class VoiceBandGate {
  private floor: number | undefined
  private open = false
  /** How long the level has been above the opening threshold while the gate is closed. */
  private aboveSeconds = 0

  /**
   * Adds the next level, `elapsedSeconds` after the previous one, and returns the output.
   * Pass the time of the audio, for example one spectrum hop, so the floor follows the audio and not the frame rate.
   */
  update(level: number, elapsedSeconds: number): number {
    if (this.floor === undefined) {
      this.floor = level
      return 0
    }

    if (level < this.floor)
      this.floor += (level - this.floor) * Math.min(1, elapsedSeconds / FLOOR_FALL_SECONDS)
    else
      this.floor = Math.min(level, this.floor + FLOOR_RISE_PER_SECOND * elapsedSeconds)

    const aboveFloor = level - this.floor
    if (this.open && aboveFloor < CLOSE_ABOVE_FLOOR) {
      this.open = false
      this.aboveSeconds = 0
    }
    else if (!this.open) {
      this.aboveSeconds = aboveFloor > OPEN_ABOVE_FLOOR ? this.aboveSeconds + elapsedSeconds : 0
      this.open = this.aboveSeconds >= OPEN_AFTER_SECONDS
    }

    return this.open ? smoothstep(CLOSE_ABOVE_FLOOR, FULL_ABOVE_FLOOR, aboveFloor) : 0
  }

  /** Forgets the floor, for example after the input device changes. */
  reset() {
    this.floor = undefined
    this.open = false
    this.aboveSeconds = 0
  }
}
