import type { Buffer } from 'node:buffer'
import { useLogg } from '@guiiai/logg'
import { pipeline, type PipelineType } from '@huggingface/transformers'

import wavefile from 'wavefile'
import { pcmToWav } from '../utils/audio'

export class WhisperLargeV3Pipeline {
  static task: PipelineType = 'automatic-speech-recognition'
  static model = 'Xenova/whisper-tiny.en'
  static instance = null

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      // NOTE: Uncomment this to change the cache directory
      // env.cacheDir = './.cache';

      this.instance = await pipeline(this.task, this.model, { progress_callback })
    }

    return this.instance
  }
}

export function textFromResult(result: Array<{ text: string }> | { text: string }) {
  if (Array.isArray(result)) {
    const arrayResult = result as { text: string }[]
    if (arrayResult.length === 0) {
      return ''
    }

    return result[0].text
  }
  else {
    if ('text' in result) {
      return result.text
    }
    else {
      return ''
    }
  }
}

export async function transcribe(pcmBuffer: Buffer) {
  const log = useLogg('Transcribe').useGlobalConfig()

  const pcmConvertedWav = pcmToWav(pcmBuffer, 48000, 2)
  log.withFields({ from: pcmBuffer.byteLength, to: pcmConvertedWav.byteLength }).log('Audio data received')

  const transcriber = await WhisperLargeV3Pipeline.getInstance() as (audio: Float32Array | Float64Array) => Promise<Array<{ text: string }> | { text: string }>
  log.log('Transcribing audio')

  const wav = new wavefile.WaveFile(pcmConvertedWav)
  wav.toBitDepth('32f') // Pipeline expects input as a Float32Array
  wav.toSampleRate(16000) // Whisper expects audio with a sampling rate of 16000
  const audioData = wav.getSamples()

  const result = await transcriber(audioData)
  const text = textFromResult(result)
  if (!text) {
    log.log('No transcription result')
    return ''
  }

  log.withField('result', text).log('Transcription result')
  return text
}
