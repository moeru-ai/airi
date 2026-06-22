import type { VoiceInputSegmentQualityGateOptions } from './voice-input-audio-segment'

export const voiceInputVadProfileStorageKey = 'airi:voice-input-vad-profile'

export type VoiceInputVadProfileName = 'sensitive' | 'balanced' | 'long-sentence'

export interface VoiceInputVadProfile {
  /** Stable profile identifier used by storage and developer logs. */
  name: VoiceInputVadProfileName
  /** VAD segmentation parameters passed to the audio model wrapper. */
  vad: {
    threshold: number
    minSilenceDurationMs: number
    speechPadMs: number
    minSpeechDurationMs: number
  }
  /** Local quality gate used before uploading the WAV segment to ASR. */
  segmentQualityGate: VoiceInputSegmentQualityGateOptions
}

interface ReadableStorage {
  getItem: (key: string) => string | null
}

const voiceInputVadProfiles = {
  'sensitive': {
    name: 'sensitive',
    vad: {
      threshold: 0.46,
      minSilenceDurationMs: 1000,
      speechPadMs: 520,
      minSpeechDurationMs: 240,
    },
    segmentQualityGate: {
      minDurationMs: 360,
      minPeak: 0.012,
      minRms: 0.0028,
    },
  },
  'balanced': {
    name: 'balanced',
    vad: {
      threshold: 0.5,
      minSilenceDurationMs: 1350,
      speechPadMs: 460,
      minSpeechDurationMs: 280,
    },
    segmentQualityGate: {
      minDurationMs: 420,
      minPeak: 0.015,
      minRms: 0.0035,
    },
  },
  'long-sentence': {
    name: 'long-sentence',
    vad: {
      threshold: 0.48,
      minSilenceDurationMs: 1750,
      speechPadMs: 620,
      minSpeechDurationMs: 280,
    },
    segmentQualityGate: {
      minDurationMs: 420,
      minPeak: 0.012,
      minRms: 0.0028,
    },
  },
} satisfies Record<VoiceInputVadProfileName, VoiceInputVadProfile>

/**
 * Checks whether a persisted value names a known voice-input VAD profile.
 */
function isVoiceInputVadProfileName(value: string | undefined): value is VoiceInputVadProfileName {
  return value === 'sensitive' || value === 'balanced' || value === 'long-sentence'
}

/**
 * Resolves a voice-input VAD profile with a conservative default.
 *
 * Use when:
 * - Binding the microphone VAD graph for record-then-transcribe providers.
 * - Developers need to compare sensitivity profiles without changing code.
 *
 * Expects:
 * - Unknown profile names are treated as missing configuration.
 *
 * Returns:
 * - A complete profile containing VAD and local segment gate parameters.
 */
export function getVoiceInputVadProfile(name?: string): VoiceInputVadProfile {
  if (isVoiceInputVadProfileName(name))
    return voiceInputVadProfiles[name]

  return voiceInputVadProfiles.balanced
}

/**
 * Reads a voice-input VAD profile name from a storage boundary.
 *
 * Use when:
 * - The renderer should allow developer-side profile overrides.
 *
 * Expects:
 * - Storage may be unavailable in tests, SSR-like contexts, or restricted windows.
 *
 * Returns:
 * - A validated profile name, or `undefined` when no valid override exists.
 */
export function readVoiceInputVadProfileName(storage?: ReadableStorage): VoiceInputVadProfileName | undefined {
  const readableStorage = storage ?? globalThis.localStorage
  const value = readableStorage?.getItem(voiceInputVadProfileStorageKey) ?? undefined
  return isVoiceInputVadProfileName(value) ? value : undefined
}
