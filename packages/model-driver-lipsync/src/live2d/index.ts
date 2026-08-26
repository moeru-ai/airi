import type { Profile } from 'wlipsync'

import { createWLipSyncNode } from 'wlipsync'

const RAW_KEYS = ['A', 'E', 'I', 'O', 'U', 'S'] as const
const RAW_TO_VOWEL: Record<typeof RAW_KEYS[number], VowelKey> = {
  A: 'A',
  E: 'E',
  I: 'I',
  O: 'O',
  U: 'U',
  // Treat S as silence/closed; map to a small I-like mouth to avoid a hard snap
  S: 'I',
}

export type VowelKey = 'A' | 'E' | 'I' | 'O' | 'U'

export interface Live2DLipSync {
  /**
   * The underlying wLipSync AudioWorkletNode. Connect your audio source to it.
   */
  node: Awaited<ReturnType<typeof createWLipSyncNode>>
  /**
   * Get per-vowel weights (already remapped from AEIOUS to AEIOU) scaled by current volume.
   */
  getVowelWeights: () => Record<VowelKey, number>
  /**
   * Get a single mouth-open value (0-1) derived from the loudest vowel weight.
   */
  getMouthOpen: () => number
  /**
   * Convenience helper to connect an audio source node to the lip sync node.
   */
  connectSource: (source: AudioNode) => void
}

export interface Live2DLipSyncOptions {
  /**
   * Overall cap for each vowel weight after scaling.
   * Defaults to 0.7 to keep Live2D mouth movement natural.
   */
  cap?: number
  /**
   * Volume multiplier applied before exponent.
   * Defaults to 0.9.
   */
  volumeScale?: number
  /**
   * Exponent for the volume curve to soften peaks.
   * Defaults to 0.7.
   */
  volumeExponent?: number
  /**
   * Minimum interval (ms) between mouth-open recalculations.
   * Defaults to 40ms (~25fps) to avoid overly chattery updates.
   */
  mouthUpdateIntervalMs?: number
  /**
   * Lerp window (ms) for smoothing mouth-open changes.
   * Defaults to 120ms; set to 0 to disable smoothing.
   */
  mouthLerpWindowMs?: number
}

/**
 * Create a Live2D-friendly lip sync helper using the wLipSync worklet.
 * - Compute AEIOUS weights from the worklet
 * - Remap to AEIOU
 * - Scale by volume to derive a mouth-open value
 */
export async function createLive2DLipSync(
  audioContext: AudioContext,
  profile: Profile,
  options: Live2DLipSyncOptions = {},
): Promise<Live2DLipSync> {
  const node = await createWLipSyncNode(audioContext, profile)

  const cap = options.cap ?? 0.7
  const volumeScale = options.volumeScale ?? 0.9
  const volumeExponent = options.volumeExponent ?? 0.7
  const mouthUpdateIntervalMs = options.mouthUpdateIntervalMs ?? 40
  const mouthLerpWindowMs = options.mouthLerpWindowMs ?? 120

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

  let lastRawMouthOpen = 0
  let lastRawUpdateMs = 0
  let smoothedMouthOpen = 0
  let lastSmoothedMs = 0

  const getVowelWeights = (): Record<VowelKey, number> => {
    const projected: Record<VowelKey, number> = { A: 0, E: 0, I: 0, O: 0, U: 0 }
    const amp = Math.min((node.volume ?? 0) * volumeScale, 1) ** volumeExponent

    for (const raw of RAW_KEYS) {
      const vowel = RAW_TO_VOWEL[raw]
      const rawVal = node.weights?.[raw] ?? 0
      projected[vowel] = Math.max(projected[vowel], Math.min(cap, rawVal * amp))
    }

    return projected
  }

  const computeMouthOpen = () => {
    const weights = Object.values(getVowelWeights())
    return weights.length ? Math.max(...weights) : 0
  }

  const maybeUpdateRawMouthOpen = (timestamp: number) => {
    if (lastRawUpdateMs === 0 || mouthUpdateIntervalMs <= 0 || timestamp - lastRawUpdateMs >= mouthUpdateIntervalMs) {
      lastRawMouthOpen = computeMouthOpen()
      lastRawUpdateMs = timestamp
    }
  }

  const getSmoothedMouthOpen = (timestamp: number) => {
    if (lastSmoothedMs === 0 || mouthLerpWindowMs <= 0) {
      smoothedMouthOpen = lastRawMouthOpen
      lastSmoothedMs = timestamp
      return smoothedMouthOpen
    }

    const alpha = Math.min(1, (timestamp - lastSmoothedMs) / mouthLerpWindowMs)
    smoothedMouthOpen += (lastRawMouthOpen - smoothedMouthOpen) * alpha
    lastSmoothedMs = timestamp
    return smoothedMouthOpen
  }

  // Prime mouth state so first frame isn't stale
  const initialTimestamp = now()
  lastRawMouthOpen = computeMouthOpen()
  lastRawUpdateMs = initialTimestamp
  smoothedMouthOpen = lastRawMouthOpen
  lastSmoothedMs = initialTimestamp

  const getMouthOpen = () => {
    const timestamp = now()
    maybeUpdateRawMouthOpen(timestamp)
    return getSmoothedMouthOpen(timestamp)
  }

  const connectSource = (source: AudioNode) => {
    try {
      source.connect(node)
    }
    catch (error) {
      console.error('[model-driver-lipsync] failed to connect source to lip sync node', error)
    }
  }

  return {
    node,
    getVowelWeights,
    getMouthOpen,
    connectSource,
  }
}
