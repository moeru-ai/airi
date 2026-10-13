import { addWhiteNoise, mulberry32 } from './perturbation'

/**
 * Level of the clean live input that streamed noise is relative to.
 *
 * Clip mode measures the speech level of the whole clip. Live input has no end, so this level follows
 * the loudest input block instead. It rises at once and halves every `halfLifeSeconds`, so it holds
 * through the pauses between utterances. Because it follows the loudest block and not the average
 * speech level, the same SNR adds a little more noise than in clip mode.
 */
export class InputLevel {
  private level = 0

  constructor(
    private readonly sampleRate: number,
    private readonly halfLifeSeconds = 10,
  ) {}

  /** Takes the next block of clean input and returns the level for it, as RMS amplitude. */
  update(block: Float32Array): number {
    let power = 0
    for (const sample of block)
      power += sample * sample
    const rms = block.length === 0 ? 0 : Math.sqrt(power / block.length)
    const decay = 0.5 ** (block.length / this.sampleRate / this.halfLifeSeconds)
    this.level = Math.max(rms, this.level * decay)
    return this.level
  }
}

/**
 * White noise for one streamed rollout.
 *
 * The generator continues across blocks, so the same seed and the same blocks always give the same
 * noise, in any Worker.
 */
export class NoiseStream {
  private readonly random: () => number

  constructor(
    readonly snrDb: number,
    seed: number,
  ) {
    this.random = mulberry32(seed)
  }

  /** Returns a copy of `block` with noise `snrDb` below `level`. The input block is not changed. */
  apply(block: Float32Array, level: number): Float32Array<ArrayBuffer> {
    const output = new Float32Array(block)
    addWhiteNoise(output, level / 10 ** (this.snrDb / 20), this.random)
    return output
  }
}
