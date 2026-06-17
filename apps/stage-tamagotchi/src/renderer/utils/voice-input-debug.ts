import type { VoiceInputAudioDiagnostics, VoiceInputSegmentSkipReason } from './voice-input-audio-segment'

export type VoiceInputDebugEntryStatus = 'pending' | 'skipped' | 'transcribed' | 'empty' | 'failed'

export interface VoiceInputDebugEntry {
  /** Stable attempt identifier shown in developer logs. */
  id: string
  /** Current lifecycle state for this ASR attempt. */
  status: VoiceInputDebugEntryStatus
  /** Playable object URL for the exact audio blob sent to ASR. */
  audioUrl: string
  /** Original WAV blob retained for console-side inspection. */
  blob: Blob
  /** Segment diagnostics measured before provider upload when the segment came from VAD PCM. */
  diagnostics?: VoiceInputAudioDiagnostics
  /** Blob size in bytes. */
  recordingSize: number
  /** Blob MIME type. */
  recordingType: string
  /** Timestamp when the attempt was recorded. */
  createdAt: number
  /** Provider-returned text when transcription succeeds. */
  text?: string
  /** Error or empty-result reason when transcription does not produce text. */
  error?: string
  /** Local quality-gate reason when the segment is intentionally skipped. */
  skipReason?: VoiceInputSegmentSkipReason
}

export interface VoiceInputDebugRecorderOptions {
  /** Enables retention of local audio object URLs for debugging. */
  enabled: boolean
  /**
   * Maximum number of recent entries retained in memory.
   *
   * @default 8
   */
  maxEntries?: number
  /**
   * Creates a local object URL for playback.
   *
   * @default URL.createObjectURL
   */
  createObjectURL?: (blob: Blob) => string
  /**
   * Revokes expired playback URLs.
   *
   * @default URL.revokeObjectURL
   */
  revokeObjectURL?: (url: string) => void
  /**
   * Supplies timestamps for deterministic tests.
   *
   * @default Date.now
   */
  now?: () => number
}

export interface VoiceInputDebugAttempt {
  /** Exact WAV blob that will be sent to the transcription provider. */
  blob: Blob
  /** Audio diagnostics measured from the same VAD segment when available. */
  diagnostics?: VoiceInputAudioDiagnostics
}

export interface VoiceInputDebugResult {
  /** Final lifecycle state for this ASR attempt. */
  status: Exclude<VoiceInputDebugEntryStatus, 'pending'>
  /** Provider-returned text when transcription succeeds. */
  text?: string
  /** Error or empty-result reason when transcription does not produce text. */
  error?: string
  /** Local quality-gate reason when the segment is intentionally skipped. */
  skipReason?: VoiceInputSegmentSkipReason
}

export interface VoiceInputDebugRecorder {
  /** Stores a new debug clip and returns its entry when debugging is enabled. */
  recordAttempt: (attempt: VoiceInputDebugAttempt) => VoiceInputDebugEntry | undefined
  /** Updates the lifecycle result for a previously recorded attempt. */
  markResult: (id: string | undefined, result: VoiceInputDebugResult) => void
  /** Returns a snapshot of retained debug entries. */
  entries: () => VoiceInputDebugEntry[]
  /** Revokes all retained object URLs and clears the recorder. */
  dispose: () => void
}

export interface VoiceInputDebugConsole {
  /** Returns recent debug entries for manual console inspection. */
  entries: () => VoiceInputDebugEntry[]
  /** Clears retained clips and revokes object URLs. */
  dispose: () => void
}

export type VoiceInputDebugConsoleTarget = object

/**
 * Creates an in-memory ring buffer for exact ASR audio clips.
 *
 * Use when:
 * - Debugging whether a provider failure is caused by capture, VAD, or ASR.
 * - Developers need to replay the exact WAV blob sent to transcription.
 *
 * Expects:
 * - Callers only enable this in development or explicit debug sessions.
 *
 * Returns:
 * - A bounded recorder that owns and revokes generated object URLs.
 */
export function createVoiceInputDebugRecorder(options: VoiceInputDebugRecorderOptions): VoiceInputDebugRecorder {
  const entries: VoiceInputDebugEntry[] = []
  const maxEntries = options.maxEntries ?? 8
  const now = options.now ?? Date.now
  const createObjectURL = options.createObjectURL ?? URL.createObjectURL.bind(URL)
  const revokeObjectURL = options.revokeObjectURL ?? URL.revokeObjectURL.bind(URL)
  let nextId = 1

  /**
   * Removes the oldest debug entries until the buffer fits the configured limit.
   */
  function trimEntries() {
    while (entries.length > maxEntries) {
      const expired = entries.shift()
      if (expired)
        revokeObjectURL(expired.audioUrl)
    }
  }

  /**
   * Finds a retained debug entry by identifier.
   */
  function findEntry(id: string | undefined) {
    if (!id)
      return undefined

    return entries.find(entry => entry.id === id)
  }

  /**
   * Stores a playable debug clip for one ASR attempt.
   */
  function recordAttempt(attempt: VoiceInputDebugAttempt) {
    if (!options.enabled)
      return undefined

    const entry: VoiceInputDebugEntry = {
      id: `voice-input-${nextId++}`,
      status: 'pending',
      audioUrl: createObjectURL(attempt.blob),
      blob: attempt.blob,
      diagnostics: attempt.diagnostics,
      recordingSize: attempt.blob.size,
      recordingType: attempt.blob.type,
      createdAt: now(),
    }

    entries.push(entry)
    trimEntries()
    return entry
  }

  /**
   * Updates a retained debug attempt after local gating or provider transcription.
   */
  function markResult(id: string | undefined, result: VoiceInputDebugResult) {
    const entry = findEntry(id)
    if (!entry)
      return

    entry.status = result.status
    entry.text = result.text
    entry.error = result.error
    entry.skipReason = result.skipReason
  }

  /**
   * Returns a stable snapshot to prevent callers from mutating the internal buffer array.
   */
  function snapshotEntries() {
    return [...entries]
  }

  /**
   * Revokes all retained object URLs and clears debug memory.
   */
  function dispose() {
    for (const entry of entries)
      revokeObjectURL(entry.audioUrl)

    entries.splice(0, entries.length)
  }

  return {
    recordAttempt,
    markResult,
    entries: snapshotEntries,
    dispose,
  }
}

/**
 * Installs a tiny console helper for inspecting retained voice-input debug clips.
 *
 * Use when:
 * - A developer needs to replay the exact audio segments sent to ASR.
 * - The UI should not grow a permanent debugging panel.
 *
 * Expects:
 * - The target is usually `globalThis` in the renderer process.
 *
 * Returns:
 * - A cleanup function that removes the helper if it still owns the target slot.
 */
export function installVoiceInputDebugConsole(
  target: VoiceInputDebugConsoleTarget,
  recorder: VoiceInputDebugRecorder,
) {
  const writableTarget = target as {
    __airiVoiceInputDebug?: VoiceInputDebugConsole
  }
  const helper: VoiceInputDebugConsole = {
    entries: recorder.entries,
    dispose: recorder.dispose,
  }

  writableTarget.__airiVoiceInputDebug = helper

  /**
   * Removes the helper without deleting a newer helper installed by another page instance.
   */
  return function uninstallVoiceInputDebugConsole() {
    if (writableTarget.__airiVoiceInputDebug === helper)
      delete writableTarget.__airiVoiceInputDebug
  }
}
