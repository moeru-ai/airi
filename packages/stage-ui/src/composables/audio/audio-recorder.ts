import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { BufferTarget, MediaStreamAudioTrackSource, Output, QUALITY_MEDIUM, WavOutputFormat } from 'mediabunny'
import { ref, shallowRef, toRef } from 'vue'

function getMediaStreamTrack(stream: MediaStream) {
  const tracks = stream.getAudioTracks()
  if (!tracks.length)
    throw new Error('No audio tracks found in stream')
  return tracks[0]
}

export function useAudioRecorder(
  media: MaybeRefOrGetter<MediaStream | undefined>,
  options: { sampleRate?: number } = {},
) {
  const { sampleRate = 16000 } = options
  const mediaRef = toRef(media)
  const recording = shallowRef<Blob>()

  const recordingAudioContext = shallowRef<AudioContext>()

  const mediaOutput = ref<Output>()
  const mediaFormat = ref<string>()

  const onStopRecordHooks = ref<Array<(recording: Blob | undefined) => Promise<void>>>([])

  function onStopRecord(callback: (recording: Blob | undefined) => Promise<void>) {
    onStopRecordHooks.value.push(callback)
    // Return unsubscribe function to prevent memory leaks
    return () => {
      onStopRecordHooks.value = onStopRecordHooks.value.filter(h => h !== callback)
    }
  }

  async function startRecord() {
    await until(mediaRef).toBeTruthy()

    const stream = mediaRef.value!
    const track = await getMediaStreamTrack(stream)

    let recordStream = stream
    // Handle resampling if requested sample rate differs from native track rate
    if (sampleRate && track.getSettings().sampleRate !== sampleRate) {
      console.info(`[Audio Recorder] Resampling record stream to ${sampleRate}Hz`)
      const ctx = new AudioContext({ sampleRate })
      recordingAudioContext.value = ctx
      const source = ctx.createMediaStreamSource(stream)
      const destination = ctx.createMediaStreamDestination()
      source.connect(destination)
      recordStream = destination.stream
    }

    const recordTrack = await getMediaStreamTrack(recordStream)
    mediaOutput.value = new Output({ format: new WavOutputFormat(), target: new BufferTarget() })

    const audioSource = new MediaStreamAudioTrackSource(recordTrack, { codec: 'pcm-s16', bitrate: QUALITY_MEDIUM })
    audioSource.errorPromise.catch(console.error)
    mediaOutput.value.addAudioTrack(audioSource)

    mediaFormat.value = await mediaOutput.value.getMimeType()
    await mediaOutput.value.start()
  }

  const finalizing = ref(false)

  async function stopRecord() {
    if (!mediaOutput.value || finalizing.value) {
      return
    }

    finalizing.value = true
    try {
      await mediaOutput.value.finalize()
      const bufferTarget = mediaOutput.value.target as BufferTarget | undefined
      const buffer = bufferTarget?.buffer
      const audioBlob = buffer ? new Blob([buffer], { type: mediaFormat.value }) : undefined

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

      mediaOutput.value = undefined

      if (recordingAudioContext.value) {
        await recordingAudioContext.value.close()
        recordingAudioContext.value = undefined
      }

      return audioBlob
    }
    finally {
      finalizing.value = false
    }
  }

  return {
    startRecord,
    stopRecord,
    onStopRecord,

    recording,
  }
}
