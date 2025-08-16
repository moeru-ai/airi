import type { BaseVAD, BaseVADConfig, VADEventCallback, VADEvents } from '@proj-airi/stage-ui/libs/audio/vad'

import { invoke } from '../invoke'

export class VAD implements BaseVAD {
  private config: BaseVADConfig
  private state: Float32Array = new Float32Array(2 * 1 * 128) // 2, 1, 128
  private buffer: Float32Array
  private bufferPointer: number = 0
  private isRecording: boolean = false
  private postSpeechSamples: number = 0
  private prevBuffers: Float32Array[] = []
  private inferenceChain: Promise<any> = Promise.resolve()
  private eventListeners: Partial<Record<keyof VADEvents, VADEventCallback<any>[]>> = {}
  private isReady: boolean = false

  constructor(userConfig: Partial<BaseVADConfig> = {}) {
    const defaultConfig: BaseVADConfig = {
      sampleRate: 16000,
      speechThreshold: 0.3,
      exitThreshold: 0.1,
      minSilenceDurationMs: 400,
      speechPadMs: 80,
      minSpeechDurationMs: 250,
      maxBufferDuration: 30,
      newBufferSize: 512,
    }

    this.config = { ...defaultConfig, ...userConfig }
    this.buffer = new Float32Array(this.config.maxBufferDuration * this.config.sampleRate)
  }

  public async initialize(): Promise<void> {
    try {
      this.emit('status', { type: 'info', message: 'Loading VAD model...' })

      await invoke('plugin:ipc-audio-vad-ort|load_ort_model_silero_vad')
      this.isReady = true

      this.emit('status', { type: 'info', message: 'VAD model loaded successfully' })
    }
    catch (error) {
      this.emit('status', { type: 'error', message: `Failed to load VAD model: ${error}` })
      throw error
    }
  }

  public on<K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = []
    }
    this.eventListeners[event]!.push(callback as any)
  }

  public off<K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>): void {
    if (!this.eventListeners[event])
      return
    this.eventListeners[event] = this.eventListeners[event]!.filter(cb => cb !== callback)
  }

  private emit<K extends keyof VADEvents>(event: K, data: VADEvents[K]): void {
    if (!this.eventListeners[event])
      return
    for (const callback of this.eventListeners[event]!) {
      callback(data)
    }
  }

  public async processAudio(inputBuffer: Float32Array): Promise<void> {
    if (!this.isReady) {
      throw new Error('VAD model is not initialized. Call initialize() first.')
    }

    const wasRecording = this.isRecording

    // Perform VAD using Rust backend
    const isSpeech = await this.detectSpeech(inputBuffer)

    // The rest of the logic remains the same as your original implementation
    const sampleRateMs = this.config.sampleRate / 1000
    const minSilenceDurationSamples = this.config.minSilenceDurationMs * sampleRateMs
    const speechPadSamples = this.config.speechPadMs * sampleRateMs
    const minSpeechDurationSamples = this.config.minSpeechDurationMs * sampleRateMs
    const maxPrevBuffers = Math.ceil(speechPadSamples / this.config.newBufferSize)

    if (!wasRecording && !isSpeech) {
      if (this.prevBuffers.length >= maxPrevBuffers) {
        this.prevBuffers.shift()
      }
      this.prevBuffers.push(inputBuffer.slice(0))
      return
    }

    const remaining = this.buffer.length - this.bufferPointer
    if (inputBuffer.length >= remaining) {
      this.buffer.set(inputBuffer.subarray(0, remaining), this.bufferPointer)
      this.bufferPointer += remaining

      const overflow = inputBuffer.subarray(remaining)
      this.processSpeechSegment(overflow)
      return
    }
    else {
      this.buffer.set(inputBuffer, this.bufferPointer)
      this.bufferPointer += inputBuffer.length
    }

    if (isSpeech) {
      if (!this.isRecording) {
        this.emit('speech-start', undefined)
        this.emit('status', { type: 'info', message: 'Speech detected' })
      }

      this.isRecording = true
      this.postSpeechSamples = 0
      return
    }

    this.postSpeechSamples += inputBuffer.length

    if (this.postSpeechSamples >= minSilenceDurationSamples) {
      if (this.bufferPointer < minSpeechDurationSamples) {
        this.reset()
        return
      }

      this.processSpeechSegment()
    }
  }

  private async detectSpeech(buffer: Float32Array): Promise<boolean> {
    // Use Rust backend for inference
    const result = await (this.inferenceChain = this.inferenceChain.then(() =>
      invoke('plugin:ipc-audio-vad-ort|ipc_audio_vad', {
        inputData: {
          input: Array.from(buffer),
          sr: this.config.sampleRate,
          state: Array.from(this.state),
        },
      }),
    )) as { output: number[], state: number[] }

    // Update the state
    this.state = new Float32Array(result.state)

    // Get the speech probability
    const speechProb = result.output[0]

    this.emit('debug', {
      message: 'VAD score',
      data: { probability: speechProb },
    })

    // Apply thresholds
    return (
      speechProb > this.config.speechThreshold
      || (this.isRecording && speechProb >= this.config.exitThreshold)
    )
  }

  private processSpeechSegment(overflow?: Float32Array): void {
    const sampleRateMs = this.config.sampleRate / 1000
    const speechPadSamples = this.config.speechPadMs * sampleRateMs

    const duration = (this.bufferPointer / this.config.sampleRate) * 1000
    const overflowLength = overflow?.length ?? 0

    const prevLength = this.prevBuffers.reduce((acc, b) => acc + b.length, 0)
    const finalBuffer = new Float32Array(prevLength + this.bufferPointer + speechPadSamples)

    let offset = 0
    for (const prev of this.prevBuffers) {
      finalBuffer.set(prev, offset)
      offset += prev.length
    }

    finalBuffer.set(this.buffer.slice(0, this.bufferPointer + speechPadSamples), offset)

    this.emit('speech-end', undefined)
    this.emit('speech-ready', {
      buffer: finalBuffer,
      duration,
    })

    if (overflow) {
      this.buffer.set(overflow, 0)
    }
    this.reset(overflowLength)
  }

  private reset(offset: number = 0): void {
    this.buffer.fill(0, offset)
    this.bufferPointer = offset
    this.isRecording = false
    this.postSpeechSamples = 0
    this.prevBuffers = []
  }

  public updateConfig(newConfig: Partial<BaseVADConfig>): void {
    this.config = { ...this.config, ...newConfig }

    if (newConfig.maxBufferDuration || newConfig.sampleRate) {
      this.buffer = new Float32Array(this.config.maxBufferDuration * this.config.sampleRate)
      this.bufferPointer = 0
    }
  }

  public isCurrentlyRecording(): boolean {
    return this.isRecording
  }
}

export async function createVAD(config?: Partial<BaseVADConfig>): Promise<VAD> {
  const vad = new VAD(config)
  await vad.initialize()
  return vad
}
