/* eslint-disable no-restricted-globals */
import type { AutomaticSpeechRecognitionPipeline, PreTrainedModel } from '@huggingface/transformers'
import type { MessageEvent as InternalMessageEvent, MessageEventBufferRequest, MessageEventError, MessageEventInfo, MessageEventOutput, MessageEventStatus } from './types'

import { AutoModel, pipeline, Tensor } from '@huggingface/transformers'

import {
  EXIT_THRESHOLD,
  MAX_BUFFER_DURATION,
  MAX_NUM_PREV_BUFFERS,
  MIN_SILENCE_DURATION_SAMPLES,
  MIN_SPEECH_DURATION_SAMPLES,
  SAMPLE_RATE,
  SPEECH_PAD_SAMPLES,
  SPEECH_THRESHOLD,
} from '../constants'
import { supportsWebGPU } from '../utils'
import { Duration, MessageStatus, MessageType } from './types'

export type DType = Record<string, Exclude<NonNullable<Required<Parameters<typeof pipeline>>[2]['dtype']>, string>[string]>
export type Device = Extract<Exclude<NonNullable<Required<Parameters<typeof pipeline>>[2]['device']>, Record<string, any>>, 'webgpu' | 'wasm'>
export type PretrainedConfig = NonNullable<Parameters<typeof AutoModel.from_pretrained>[1]>['config']

// Load models
let silero_vad: PreTrainedModel
let transcriber: AutomaticSpeechRecognitionPipeline

// Transformers.js currently doesn't support simultaneous inference,
// so we need to chain the inference promises.
let inferenceChain = Promise.resolve()

// Global audio buffer to store incoming audio
const BUFFER = new Float32Array(MAX_BUFFER_DURATION * SAMPLE_RATE)
let bufferPointer = 0

// Initial state for VAD
const sr = new Tensor('int64', [SAMPLE_RATE], [])
let state = new Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128])

// Whether we are in the process of adding audio to the buffer
let isRecording = false

// Track the number of samples after the last speech chunk
let postSpeechSamples = 0

const DEVICE_DTYPE_CONFIGS: Record<Device, DType> = {
  webgpu: {
    encoder_model: 'fp32',
    decoder_model_merged: 'q4',
  },
  wasm: {
    encoder_model: 'fp32',
    decoder_model_merged: 'q8',
  },
}

async function newVADModel() {
  // Load models
  return await AutoModel.from_pretrained(
    'onnx-community/silero-vad',
    {
      config: { model_type: 'custom' } as PretrainedConfig,
      dtype: 'fp32', // Full-precision
    },
  ).catch((error) => {
    self.postMessage({ type: MessageType.Error, error } satisfies MessageEventError)
    throw error
  })
}

async function newAutomaticSpeechRecognitionPipeline(device: Device) {
  return await pipeline(
    'automatic-speech-recognition',
    'onnx-community/moonshine-base-ONNX', // or "onnx-community/whisper-tiny.en",
    {
      device,
      dtype: DEVICE_DTYPE_CONFIGS[device],
    },
  ).catch((error) => {
    self.postMessage({ type: MessageType.Error, error } satisfies MessageEventError)
    throw error
  })
}

/**
 * Perform Voice Activity Detection (VAD)
 * @param {Float32Array} buffer The new audio buffer
 * @returns {Promise<boolean>} `true` if the buffer is speech, `false` otherwise.
 */
async function vad(buffer: Float32Array<ArrayBuffer>) {
  if (silero_vad === undefined) {
    console.warn('VAD model not loaded yet')
    return false
  }

  const input = new Tensor('float32', buffer, [1, buffer.length])
  const { stateN, output } = await (inferenceChain = inferenceChain.then(_ => silero_vad({ input, sr, state })))
  state = stateN // Update state
  const isSpeech = output.data[0]

  // Use heuristics to determine if the buffer is speech or not
  return (
  // Case 1: We are above the threshold (definitely speech)
    isSpeech > SPEECH_THRESHOLD
    // Case 2: We are in the process of recording, and the probability is above the negative (exit) threshold
    || (isRecording && isSpeech >= EXIT_THRESHOLD)
  )
}

/**
 * Transcribe the audio buffer
 * @param {Float32Array} buffer The audio buffer
 * @param {object} data Additional data
 * @param {number} data.start The start time of the speech segment
 * @param {number} data.end The end time of the speech segment
 * @param {number} data.duration The duration of the speech segment
 */
async function transcribe(buffer: Float32Array<any>, data: { start: number, end: number, duration: number }) {
  if (transcriber === undefined) {
    console.warn('Transcriber model not loaded yet')
    return
  }

  // @ts-expect-error - chain
  const { text }: { text: string } = await (inferenceChain = inferenceChain.then(_ => transcriber(buffer)))
  self.postMessage({ type: MessageType.Output, buffer, message: text, ...data } satisfies MessageEventOutput)
}

function reset(offset = 0) {
  self.postMessage({
    type: MessageType.Status,
    status: MessageStatus.RecordingEnd,
    message: 'Transcribing...',
    duration: Duration.UntilNext,
  } satisfies MessageEventStatus)

  BUFFER.fill(0, offset)
  bufferPointer = offset
  isRecording = false
  postSpeechSamples = 0
}

const prevBuffers: Array<Float32Array<ArrayBuffer>> = []

function dispatchForTranscriptionAndResetAudioBuffer(overflow?: Float32Array<ArrayBuffer>) {
// Get start and end time of the speech segment, minus the padding
  const now = Date.now()
  const end
    = now - ((postSpeechSamples + SPEECH_PAD_SAMPLES) / SAMPLE_RATE) * 1000
  const start = end - (bufferPointer / SAMPLE_RATE) * 1000
  const duration = end - start
  const overflowLength = overflow?.length ?? 0

  // Send the audio buffer to the worker
  const buffer = BUFFER.slice(0, bufferPointer + SPEECH_PAD_SAMPLES)

  const prevLength = prevBuffers.reduce((acc, b) => acc + b.length, 0)
  const paddedBuffer = new Float32Array<any>(prevLength + buffer.length)
  let offset = 0
  for (const prev of prevBuffers) {
    paddedBuffer.set(prev, offset)
    offset += prev.length
  }

  paddedBuffer.set(buffer, offset)
  transcribe(paddedBuffer, { start, end, duration })

  // Set overflow (if present) and reset the rest of the audio buffer
  if (overflow) {
    BUFFER.set(overflow, 0)
  }

  reset(overflowLength)
}

async function load() {
  const device = (await supportsWebGPU()) ? 'webgpu' : 'wasm'
  self.postMessage({ type: MessageType.Info, message: `Using device: "${device}"` } satisfies MessageEventInfo)
  self.postMessage({
    type: MessageType.Info,
    message: 'Loading models...',
    duration: Duration.UntilNext,
  } satisfies MessageEventInfo)

  // Load models
  silero_vad = await newVADModel()
  transcriber = await newAutomaticSpeechRecognitionPipeline(device)

  await transcriber(new Float32Array(SAMPLE_RATE)) // Compile shaders
  self.postMessage({ type: 'status', status: 'ready', message: 'Ready!' })

  self.onmessage = async (event) => {
    const { buffer } = event.data as MessageEventBufferRequest

    const wasRecording = isRecording // Save current state
    const isSpeech = await vad(buffer)

    if (!wasRecording && !isSpeech) {
    // We are not recording, and the buffer is not speech,
    // so we will probably discard the buffer. So, we insert
    // into a FIFO queue with maximum size of PREV_BUFFER_SIZE
      if (prevBuffers.length >= MAX_NUM_PREV_BUFFERS) {
      // If the queue is full, we discard the oldest buffer
        prevBuffers.shift()
      }

      prevBuffers.push(buffer)
      return
    }

    const remaining = BUFFER.length - bufferPointer
    if (buffer.length >= remaining) {
    // The buffer is larger than (or equal to) the remaining space in the global buffer,
    // so we perform transcription and copy the overflow to the global buffer
      BUFFER.set(buffer.subarray(0, remaining), bufferPointer)
      bufferPointer += remaining

      // Dispatch the audio buffer
      const overflow = buffer.subarray(remaining)
      dispatchForTranscriptionAndResetAudioBuffer(overflow)
      return
    }
    else {
    // The buffer is smaller than the remaining space in the global buffer,
    // so we copy it to the global buffer
      BUFFER.set(buffer, bufferPointer)
      bufferPointer += buffer.length
    }

    if (isSpeech) {
      if (!isRecording) {
      // Indicate start of recording
        self.postMessage({
          type: MessageType.Status,
          status: MessageStatus.RecordingStart,
          message: 'Listening...',
          duration: Duration.UntilNext,
        } satisfies MessageEventStatus)
      }
      // Start or continue recording
      isRecording = true
      postSpeechSamples = 0 // Reset the post-speech samples
      return
    }

    postSpeechSamples += buffer.length

    // At this point we're confident that we were recording (wasRecording === true), but the latest buffer is not speech.
    // So, we check whether we have reached the end of the current audio chunk.
    if (postSpeechSamples < MIN_SILENCE_DURATION_SAMPLES) {
    // There was a short pause, but not long enough to consider the end of a speech chunk
    // (e.g., the speaker took a breath), so we continue recording
      return
    }

    if (bufferPointer < MIN_SPEECH_DURATION_SAMPLES) {
    // The entire buffer (including the new chunk) is smaller than the minimum
    // duration of a speech chunk, so we can safely discard the buffer.
      reset()
      return
    }

    dispatchForTranscriptionAndResetAudioBuffer()
  }
}

self.addEventListener('message', (event) => {
  const { type } = event.data as InternalMessageEvent

  switch (type) {
    case MessageType.Load:
      load()
      break
  }
})
