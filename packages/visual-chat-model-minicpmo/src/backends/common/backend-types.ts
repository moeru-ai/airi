import { dirname } from 'node:path'

export interface InferenceBackend {
  readonly type: string
  spawn: () => Promise<void>
  shutdown: () => Promise<void>
  health: () => Promise<boolean>
  init: (systemPrompt: string, refAudioPath?: string) => Promise<void>
  prefill: (audioPath: string, imagePath?: string) => Promise<void>
  decode: () => AsyncIterable<DecodedChunk>
}

export interface DecodedChunk {
  text: string
  audioFiles: string[]
  isListening: boolean
  done: boolean
}

export interface PrefillPayload {
  wavPath: string
  imagePath?: string
  cnt: number
}

export interface DecodeResult {
  text: string
  audioOutDir: string
  wavFiles: string[]
  listenDetected: boolean
}

export function decodedChunksToDecodeResult(chunks: DecodedChunk[]): DecodeResult {
  const last = chunks.at(-1)
  if (!last) {
    return {
      text: '',
      audioOutDir: '',
      wavFiles: [],
      listenDetected: false,
    }
  }
  const wavFiles = last.audioFiles
  const audioOutDir = wavFiles.length > 0 ? dirname(wavFiles[0]!) : ''
  return {
    text: last.text,
    audioOutDir,
    wavFiles,
    listenDetected: last.isListening,
  }
}
