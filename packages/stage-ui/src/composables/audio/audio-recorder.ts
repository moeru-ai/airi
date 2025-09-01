import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { BufferTarget, MediaStreamAudioTrackSource, Output, QUALITY_MEDIUM, WavOutputFormat } from 'mediabunny'
import { ref, shallowRef, toRef } from 'vue'

async function getMediaStreamTrack(stream: MediaStream) {
  return stream.getAudioTracks()[0]
}

export function useAudioRecorder(
  media: MaybeRefOrGetter<MediaStream | undefined>,
) {
  const mediaRef = toRef(media)
  const recording = shallowRef<Blob>()

  const mediaOutput = ref<Output>()
  const mediaFormat = ref<string>()

  const onStopRecordHooks = ref<Array<(recording: Blob | undefined) => Promise<void>>>([])

  function onStopRecord(callback: (recording: Blob | undefined) => Promise<void>) {
    onStopRecordHooks.value.push(callback)
  }

  async function startRecord() {
    await until(mediaRef).toBeTruthy()

    const track = await getMediaStreamTrack(mediaRef.value!)
    mediaOutput.value = new Output({ format: new WavOutputFormat(), target: new BufferTarget() })

    const audioSource = new MediaStreamAudioTrackSource(track, { codec: 'pcm-f32', bitrate: QUALITY_MEDIUM })
    audioSource.errorPromise.catch(console.error)
    mediaOutput.value.addAudioTrack(audioSource)

    mediaFormat.value = await mediaOutput.value.getMimeType()
    await mediaOutput.value.start()
  }

  async function stopRecord() {
    if (!mediaOutput.value) {
      return
    }

    await mediaOutput.value?.finalize()
    const bufferTarget = mediaOutput.value?.target as BufferTarget | undefined
    const buffer = bufferTarget!.buffer
    const audioBlob = new Blob([buffer!], { type: mediaFormat.value })

    for (const hook of onStopRecordHooks.value) {
      hook(audioBlob)
    }

    return audioBlob
  }

  return {
    startRecord,
    stopRecord,
    onStopRecord,

    recording,
  }
}
