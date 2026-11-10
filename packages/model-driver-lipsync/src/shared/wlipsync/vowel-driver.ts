const RAW_VISEMES = ['A', 'E', 'I', 'O', 'U', 'S'] as const

/** The vowels that model renderers can apply to their mouth controls. */
export const WLIP_SYNC_VOWELS = ['A', 'E', 'I', 'O', 'U'] as const

/** The wLipSync values that the shared vowel driver reads for one frame. */
export interface WLipSyncFrame {
  /** The normalized volume from the wLipSync audio node. */
  volume?: number
  /** The raw AEIOUS viseme weights from the wLipSync audio node. */
  weights: Readonly<Partial<Record<WLipSyncRawViseme, number>>>
}

/** A vowel weight that a model renderer can apply to its mouth controls. */
export type WLipSyncVowel = typeof WLIP_SYNC_VOWELS[number]

/**
 * Converts wLipSync frames into stable vowel weights for model renderers.
 *
 * The driver owns the winner selection, silence policy, and smoothing state.
 * It does not know how a renderer stores or applies mouth controls.
 */
export interface WLipSyncVowelDriver {
  /** Clears the smoothing and silence state. */
  reset: () => void
  /**
   * Reads one wLipSync frame and returns weights for the five vowels.
   *
   * @param frame - The current values from the wLipSync audio node.
   * @param deltaSeconds - The elapsed render time. The default is 0.016 seconds.
   */
  update: (frame: WLipSyncFrame, deltaSeconds?: number) => WLipSyncVowelWeights
}

/** The normalized vowel weights that a renderer maps to model controls. */
export type WLipSyncVowelWeights = Record<WLipSyncVowel, number>

type WLipSyncRawViseme = typeof RAW_VISEMES[number]

const RAW_TO_VOWEL: Record<WLipSyncRawViseme, WLipSyncVowel> = {
  A: 'A',
  E: 'E',
  I: 'I',
  O: 'O',
  S: 'I',
  U: 'U',
}

/**
 * Creates the shared vowel driver used by the VRM and MMD renderers.
 *
 * @param now - Returns the current monotonic time in milliseconds.
 *
 * @example
 * const driver = createWLipSyncVowelDriver()
 * driver.update({ volume: 1, weights: { A: 0.8, I: 0.2 } }, 1)
 * // => { A: 0.49, E: 0, I: 0.078..., O: 0, U: 0 }
 */
export function createWLipSyncVowelDriver(
  now: () => number = () => performance.now(),
): WLipSyncVowelDriver {
  const smoothWeights = emptyVowelWeights()
  let lastActiveAt = 0

  function reset() {
    for (const vowel of WLIP_SYNC_VOWELS)
      smoothWeights[vowel] = 0
    lastActiveAt = 0
  }

  function update(frame: WLipSyncFrame, deltaSeconds = 0.016): WLipSyncVowelWeights {
    const amplitude = Math.min((frame.volume ?? 0) * 0.9, 1) ** 0.7
    const projected = emptyVowelWeights()

    for (const rawViseme of RAW_VISEMES) {
      const vowel = RAW_TO_VOWEL[rawViseme]
      const rawWeight = frame.weights[rawViseme] ?? 0
      projected[vowel] = Math.max(projected[vowel], rawWeight * amplitude)
    }

    let winner: WLipSyncVowel = 'I'
    let runner: WLipSyncVowel = 'E'
    let winnerWeight = -Infinity
    let runnerWeight = -Infinity

    for (const vowel of WLIP_SYNC_VOWELS) {
      const weight = projected[vowel]
      if (weight > winnerWeight) {
        runnerWeight = winnerWeight
        runner = winner
        winnerWeight = weight
        winner = vowel
      }
      else if (weight > runnerWeight) {
        runnerWeight = weight
        runner = vowel
      }
    }

    const currentTime = now()
    let silent = amplitude < 0.04 || winnerWeight < 0.05
    if (!silent)
      lastActiveAt = currentTime
    if (currentTime - lastActiveAt > 160)
      silent = true

    const targetWeights = emptyVowelWeights()
    if (!silent) {
      targetWeights[winner] = Math.min(0.7, winnerWeight)
      targetWeights[runner] = Math.min(0.35, runnerWeight * 0.6)
    }

    const result = emptyVowelWeights()
    for (const vowel of WLIP_SYNC_VOWELS) {
      const from = smoothWeights[vowel]
      const to = targetWeights[vowel]
      const rate = 1 - Math.exp(-(to > from ? 50 : 30) * deltaSeconds)
      smoothWeights[vowel] = from + (to - from) * rate
      result[vowel] = (smoothWeights[vowel] <= 0.01 ? 0 : smoothWeights[vowel]) * 0.7
    }

    return result
  }

  return { reset, update }
}

function emptyVowelWeights(): WLipSyncVowelWeights {
  return { A: 0, E: 0, I: 0, O: 0, U: 0 }
}
