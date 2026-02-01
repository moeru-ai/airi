/**
 * Type definitions for Kokoro Worker messages
 */

import type { GenerateOptions } from 'kokoro-js'

export type VoiceKey = NonNullable<GenerateOptions['voice']>

export interface Voice {
  language: string
  name: string
  gender: string
}

export type Voices = Record<string, Voice>

// Messages sent TO the worker
export interface LoadMessage {
  type: 'load'
  data: {
    quantization: string
    device: string
  }
}

export interface GenerateMessage {
  type: 'generate'
  data: {
    text: string
    voice: VoiceKey
  }
}

export type WorkerRequest = LoadMessage | GenerateMessage

// Messages received FROM the worker
export interface ProgressMessage {
  type: 'progress'
  progress: any
}

export interface LoadedMessage {
  type: 'loaded'
  voices: Voices
}

export interface SuccessMessage {
  type: 'result'
  status: 'success'
  buffer: ArrayBuffer
}

export interface ErrorMessage {
  type: 'result'
  status: 'error'
  message: string
}

export type WorkerResponse = ProgressMessage | LoadedMessage | SuccessMessage | ErrorMessage
