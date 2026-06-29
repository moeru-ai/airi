interface VoiceInputPrerollRecordingOptions {
  hasStream: boolean
  shouldUseStreamInput: boolean
  startRecord: () => Promise<void> | void
}

interface VoiceInputPrerollCutOptions extends VoiceInputPrerollRecordingOptions {
  hasActiveRecording: boolean
  stopRecord: () => Promise<unknown> | unknown
}

interface AudioStreamLike {
  getAudioTracks: () => Array<Pick<MediaStreamTrack, 'readyState'>>
}

/**
 * Checks whether a stream still has a usable audio input track.
 *
 * Use when:
 * - Recorder startup may be working with a stale MediaStream object.
 * - Device permission or stream replacement can leave ended tracks behind.
 *
 * Expects:
 * - `stream` follows the MediaStream audio-track surface.
 *
 * Returns:
 * - `true` when at least one audio track is still live.
 */
export function hasLiveAudioInputTrack(stream: AudioStreamLike | undefined) {
  return !!stream?.getAudioTracks().some(track => track.readyState === 'live')
}

/**
 * Starts a warm recording buffer for record-then-transcribe providers.
 *
 * Use when:
 * - VAD should not clip the first syllable before the recorder is ready.
 * - The selected transcription provider does not consume live stream input.
 *
 * Expects:
 * - `hasStream` means a microphone MediaStream is already available.
 *
 * Returns:
 * - `true` when a preroll recording was requested, otherwise `false`.
 */
export async function startVoiceInputPrerollRecording(options: VoiceInputPrerollRecordingOptions) {
  if (options.shouldUseStreamInput || !options.hasStream)
    return false

  await options.startRecord()
  return true
}

/**
 * Cuts the current preroll recording and immediately starts the next buffer.
 *
 * Use when:
 * - VAD reports speech end and the captured utterance should be finalized.
 * - The next utterance may begin while the previous blob is still being processed.
 *
 * Expects:
 * - `hasActiveRecording` reflects whether the recorder has an active segment to finalize.
 * - `stopRecord` releases the active recorder synchronously before awaiting provider hooks.
 *
 * Returns:
 * - `true` when a recording cut was requested, otherwise `false`.
 */
export async function cutVoiceInputPrerollRecording(options: VoiceInputPrerollCutOptions) {
  if (options.shouldUseStreamInput || !options.hasActiveRecording)
    return false

  const stopped = Promise.resolve(options.stopRecord())

  if (options.hasStream)
    await options.startRecord()

  await stopped
  return true
}
