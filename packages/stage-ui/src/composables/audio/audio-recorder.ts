import type { MaybeRefOrGetter } from 'vue'

import { until } from '@vueuse/core'
import { ref, shallowRef, toRef } from 'vue'

/**
 * Encodes Float32 samples into a 16-bit PCM WAV Blob.
 */
function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  // RIFF identifier
  writeString(0, 'RIFF')
  // File length
  view.setUint32(4, 36 + samples.length * 2, true)
  // RIFF type
  writeString(8, 'WAVE')
  // format chunk identifier
  writeString(12, 'fmt ')
  // format chunk length
  view.setUint32(16, 16, true)
  // sample format (1 = PCM)
  view.setUint16(20, 1, true)
  // channel count (1 = mono)
  view.setUint16(22, 1, true)
  // sample rate
  view.setUint32(24, sampleRate, true)
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true)
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true)
  // bits per sample
  view.setUint16(34, 16, true)
  // data chunk identifier
  writeString(36, 'data')
  // data chunk length
  view.setUint32(40, samples.length * 2, true)

  // Write 16-bit PCM samples
  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export function useAudioRecorder(
  media: MaybeRefOrGetter<MediaStream | undefined>,
  options: { sampleRate?: number } = {},
) {
  // NOTICE: Defaulting to hardware native rate or 48kHz for PoC-style cleanliness.
  // Resampling is often where crackles start.
  const { sampleRate: requestedSampleRate } = options
  const mediaRef = toRef(media)
  const recording = shallowRef<Blob>()

  const recordingAudioContext = shallowRef<AudioContext>()
  const processor = shallowRef<ScriptProcessorNode>()
  const source = shallowRef<MediaStreamAudioSourceNode>()
  // Use a plain array for chunks to avoid Vue reactivity overhead in the audio thread
  let recordedChunks: Float32Array[] = []

  const onStopRecordHooks = ref<Array<(recording: Blob | undefined) => Promise<void>>>([])

  function onStopRecord(callback: (recording: Blob | undefined) => Promise<void>) {
    onStopRecordHooks.value.push(callback)
    return () => {
      onStopRecordHooks.value = onStopRecordHooks.value.filter(h => h !== callback)
    }
  }

  async function startRecord() {
    await until(mediaRef).toBeTruthy()
    const stream = mediaRef.value!

    // Initialize AudioContext.
    // If a sampleRate was requested, we let the browser resample once here.
    // Otherwise we use hardware native rate.
    const ctx = new AudioContext(requestedSampleRate ? { sampleRate: requestedSampleRate } : undefined)
    await ctx.resume()
    recordingAudioContext.value = ctx

    console.info(`[Audio Recorder] Started native capture. Context Rate: ${ctx.sampleRate}Hz, Requested: ${requestedSampleRate || 'Native'}`)

    recordedChunks = []
    source.value = ctx.createMediaStreamSource(stream)

    // ScriptProcessorNode for transparency/simplicity in this ninja-patch.
    processor.value = ctx.createScriptProcessor(4096, 1, 1)

    processor.value.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      recordedChunks.push(new Float32Array(input))
    }

    source.value.connect(processor.value)
    processor.value.connect(ctx.destination)
  }

  const finalizing = ref(false)

  async function stopRecord() {
    if (!recordingAudioContext.value || finalizing.value)
      return

    finalizing.value = true
    try {
      console.info('[Audio Recorder] Stopping capture and encoding WAV...')

      // Stop nodes
      if (processor.value) {
        processor.value.disconnect()
        processor.value.onaudioprocess = null
      }
      if (source.value) {
        source.value.disconnect()
      }

      const ctx = recordingAudioContext.value
      const sampleRate = ctx.sampleRate

      if (recordedChunks.length === 0) {
        console.warn('[Audio Recorder] No data captured.')
        return
      }

      // Concatenate
      const totalLength = recordedChunks.reduce((acc, c) => acc + c.length, 0)
      const result = new Float32Array(totalLength)
      let offset = 0
      for (const chunk of recordedChunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }

      console.info(`[Audio Recorder] Finalizing recording: ${totalLength} samples, ${(totalLength / sampleRate).toFixed(2)}s. Header rate: ${sampleRate}Hz`)

      // Encode
      const audioBlob = encodeWAV(result, sampleRate)
      recording.value = audioBlob

      // Call hooks
      for (const hook of onStopRecordHooks.value) {
        try {
          await hook(audioBlob)
        }
        catch (err) {
          console.error('onStopRecord hook failed:', err)
        }
      }

      // Cleanup early to free memory
      recordedChunks = []
      await ctx.close()
      recordingAudioContext.value = undefined
      processor.value = undefined
      source.value = undefined

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
