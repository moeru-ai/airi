import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { BufferTarget, MediaStreamAudioTrackSource, Output, QUALITY_MEDIUM, WavOutputFormat } from 'mediabunny'
import { computed, ref, shallowRef, toRef } from 'vue'

const TRANSCRIPTION_WAV_CODEC = 'pcm-s16'

/**
 * Returns the first audio track from the active microphone stream.
 */
function getMediaStreamTrack(stream: MediaStream) {
  const tracks = stream.getAudioTracks()
  if (!tracks.length)
    throw new Error('No audio tracks found in stream')
  return tracks[0]
}

/**
 * Records microphone input into short WAV blobs for transcription providers.
 */
export function useAudioRecorder(
  media: MaybeRefOrGetter<MediaStream | undefined>,
) {
  const mediaRef = toRef(media)
  const recording = shallowRef<Blob>()

  const mediaOutput = shallowRef<Output>()
  const mediaFormat = shallowRef<string>()
  const isRecording = computed(() => !!mediaOutput.value)

  const onStopRecordHooks = ref<Array<(recording: Blob | undefined) => Promise<void>>>([])

  /**
   * Registers a callback that receives each finalized recording blob.
   */
  function onStopRecord(callback: (recording: Blob | undefined) => Promise<void>) {
    onStopRecordHooks.value.push(callback)
    // Return unsubscribe function to prevent memory leaks
    return () => {
      onStopRecordHooks.value = onStopRecordHooks.value.filter(h => h !== callback)
    }
  }

  /**
   * Starts recording from the current microphone stream if no recording is active.
   */
  async function startRecord() {
    if (mediaOutput.value)
      return

    await until(mediaRef).toBeTruthy()

    const track = await getMediaStreamTrack(mediaRef.value!)
    const output = new Output({ format: new WavOutputFormat(), target: new BufferTarget() })
    mediaOutput.value = output

    try {
      const audioSource = new MediaStreamAudioTrackSource(track, { codec: TRANSCRIPTION_WAV_CODEC, bitrate: QUALITY_MEDIUM })
      audioSource.errorPromise.catch(console.error)
      output.addAudioTrack(audioSource)

      mediaFormat.value = await output.getMimeType()
      await output.start()
    }
    catch (error) {
      if (mediaOutput.value === output) {
        mediaOutput.value = undefined
        mediaFormat.value = undefined
      }
      throw error
    }
  }

  /**
   * Finalizes the active recording and runs stop hooks without blocking the next recording.
   */
  async function stopRecord() {
    const activeOutput = mediaOutput.value
    const activeFormat = mediaFormat.value
    if (!activeOutput) {
      return
    }

    // Clear the active output before running transcription hooks so VAD can start the next utterance
    // while the previous blob is still being sent to the ASR provider.
    mediaOutput.value = undefined
    mediaFormat.value = undefined

    await activeOutput.finalize()
    const bufferTarget = activeOutput.target as BufferTarget | undefined
    const buffer = bufferTarget?.buffer
    const audioBlob = buffer ? new Blob([buffer], { type: activeFormat }) : undefined

    recording.value = audioBlob

    // await hooks and catch errors
    for (const hook of onStopRecordHooks.value) {
      try {
        await hook(audioBlob)
      }
      catch (err) {
        console.error('onStopRecord hook failed:', err)
      }
    }

    return audioBlob
  }

  return {
    startRecord,
    stopRecord,
    onStopRecord,

    isRecording,
    recording,
  }
}
