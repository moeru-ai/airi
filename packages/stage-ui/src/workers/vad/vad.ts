import type { PreTrainedModel } from '@huggingface/transformers'

import type { BaseVAD, BaseVADConfig, VADEventCallback, VADEvents } from '../../libs/audio/vad'

import { AutoModel, Tensor } from '@huggingface/transformers'

/**
 * Voice Activity Detection processor
 */
export class VAD implements BaseVAD {
  private buffer: Float32Array
  private bufferPointer: number = 0
  private config: BaseVADConfig
  private eventListeners: Partial<Record<keyof VADEvents, VADEventCallback<any>[]>> = {}
  private isReady: boolean = false
  private isRecording: boolean = false
  private model: PreTrainedModel | undefined
  private postSpeechSamples: number = 0
  private prevBuffers: Float32Array[] = []
  private processingChain: Promise<void> = Promise.resolve()
  private sampleRateTensor: Tensor
  private speechSamples: number = 0
  private state: Tensor

  constructor(userConfig: Partial<BaseVADConfig> = {}) {
    // Default configuration
    const defaultConfig: BaseVADConfig = {
      exitThreshold: 0.1,
      maxBufferDuration: 30,
      minSilenceDurationMs: 400,
      minSpeechDurationMs: 250,
      newBufferSize: 512,
      sampleRate: 16000,
      speechPadMs: 80,
      speechThreshold: 0.3,
    }

    this.config = { ...defaultConfig, ...userConfig }

    this.buffer = new Float32Array(this.config.maxBufferDuration * this.config.sampleRate)
    this.sampleRateTensor = new Tensor('int64', [this.config.sampleRate], [])
    this.state = new Tensor('float32', new Float32Array(2 * 1 * 128), [2, 1, 128])
  }

  /**
   * Initialize the VAD model
   */
  public async initialize(): Promise<void> {
    try {
      this.emit('status', { message: 'Loading VAD model...', type: 'info' })

      // Full-precision
      this.model = await AutoModel.from_pretrained('onnx-community/silero-vad', { config: { model_type: 'custom' } as any, dtype: 'fp32' })
      this.isReady = true

      this.emit('status', { message: 'VAD model loaded successfully', type: 'info' })
    }
    catch (error) {
      this.emit('status', { message: `Failed to load VAD model: ${error}`, type: 'error' })
      throw error
    }
  }

  /**
   * Remove event listener
   */
  public off<K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>): void {
    if (!this.eventListeners[event])
      return
    this.eventListeners[event] = this.eventListeners[event]!.filter(cb => cb !== callback)
  }

  /**
   * Add event listener
   */
  public on<K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = []
    }
    this.eventListeners[event]!.push(callback as any)
  }

  /**
   * Process audio buffer for speech detection
   */
  public processAudio(inputBuffer: Float32Array): Promise<void> {
    // AudioWorklet dispatch does not await async message handlers. Queue the
    // complete state transition so each chunk observes the previous result.
    const queuedBuffer = inputBuffer.slice()
    const processing = this.processingChain.then(async () => await this.processAudioChunk(queuedBuffer))
    this.processingChain = processing.catch(() => undefined)
    return processing
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<BaseVADConfig>): void {
    this.config = { ...this.config, ...newConfig }

    // If buffer size changed, create a new buffer
    if (newConfig.maxBufferDuration || newConfig.sampleRate) {
      this.buffer = new Float32Array(this.config.maxBufferDuration * this.config.sampleRate)
      this.bufferPointer = 0
    }

    // Update sample rate tensor if needed
    if (newConfig.sampleRate) {
      this.sampleRateTensor = new Tensor('int64', [this.config.sampleRate], [])
    }
  }

  /** Combines VAD's retained pre-speech padding with the first detected speech chunk. */
  private createLeadingSpeechAudio(inputBuffer: Float32Array): Float32Array {
    const leadingLength = this.prevBuffers.reduce((total, buffer) => total + buffer.length, 0)
    const output = new Float32Array(leadingLength + inputBuffer.length)
    let offset = 0

    for (const buffer of this.prevBuffers) {
      output.set(buffer, offset)
      offset += buffer.length
    }

    output.set(inputBuffer, offset)
    return output
  }

  /**
   * Detect speech in an audio buffer
   */
  private async detectSpeech(buffer: Float32Array): Promise<boolean> {
    const input = new Tensor('float32', buffer, [1, buffer.length])

    const model = this.model
    if (!model)
      throw new Error('VAD model is not initialized. Call initialize() first.')

    const { output, stateN } = await model({
      input,
      sr: this.sampleRateTensor,
      state: this.state,
    })

    // Update the state
    this.state = stateN
    // Get the speech probability
    const speechProb = output.data[0]

    this.emit('debug', { data: { probability: speechProb }, message: 'VAD score' })

    // Apply thresholds
    return (
      speechProb > this.config.speechThreshold
      || (this.isRecording && speechProb >= this.config.exitThreshold)
    )
  }

  /**
   * Emit event
   */
  private emit<K extends keyof VADEvents>(event: K, data: VADEvents[K]): void {
    if (!this.eventListeners[event])
      return
    for (const callback of this.eventListeners[event]!) {
      callback(data)
    }
  }

  private async processAudioChunk(inputBuffer: Float32Array): Promise<void> {
    if (!this.isReady) {
      throw new Error('VAD model is not initialized. Call initialize() first.')
    }

    const wasRecording = this.isRecording

    // Perform VAD on the input buffer
    const isSpeech = await this.detectSpeech(inputBuffer)

    if (isSpeech)
      this.speechSamples += inputBuffer.length

    // Calculate derived constants
    const sampleRateMs = this.config.sampleRate / 1000
    const minSilenceDurationSamples = this.config.minSilenceDurationMs * sampleRateMs
    const speechPadSamples = this.config.speechPadMs * sampleRateMs
    const minSpeechDurationSamples = this.config.minSpeechDurationMs * sampleRateMs
    const maxPrevBuffers = Math.ceil(speechPadSamples / this.config.newBufferSize)

    // If not currently in speech and the current buffer isn't speech,
    // store it in the previous buffers queue for potential padding
    if (!wasRecording && !isSpeech) {
      if (this.prevBuffers.length >= maxPrevBuffers) {
        this.prevBuffers.shift()
      }

      this.prevBuffers.push(inputBuffer.slice(0))

      return
    }

    // Check if we need to handle buffer overflow
    const remaining = this.buffer.length - this.bufferPointer
    if (inputBuffer.length >= remaining) {
      // The buffer is full, process what we have
      this.buffer.set(inputBuffer.subarray(0, remaining), this.bufferPointer)
      this.bufferPointer += remaining

      // Process and reset with overflow
      const overflow = inputBuffer.subarray(remaining)
      this.processSpeechSegment(overflow)

      return
    }
    else {
      // Add input to the buffer
      this.buffer.set(inputBuffer, this.bufferPointer)
      this.bufferPointer += inputBuffer.length
    }

    // Handle speech detection
    if (isSpeech) {
      if (!this.isRecording) {
        // Speech just started
        this.emit('speech-start', undefined)
        this.emit('status', { message: 'Speech detected', type: 'info' })
        this.emit('speech-audio', { buffer: this.createLeadingSpeechAudio(inputBuffer) })
      }
      else {
        this.emit('speech-audio', { buffer: inputBuffer.slice() })
      }

      // Update state
      this.isRecording = true
      this.postSpeechSamples = 0

      return
    }

    // At this point, we were recording but the current buffer is not speech
    this.emit('speech-audio', { buffer: inputBuffer.slice() })
    this.postSpeechSamples += inputBuffer.length

    // Check if silence is long enough to consider speech ended
    if (this.postSpeechSamples >= minSilenceDurationSamples) {
      // Check if the speech segment is long enough to process
      if (this.speechSamples < minSpeechDurationSamples) {
        // Too short, reset without processing
        this.emit('speech-cancel', undefined)
        this.reset()

        return
      }

      // Process the speech segment
      this.processSpeechSegment()
    }
  }

  /**
   * Process a complete speech segment
   */
  private processSpeechSegment(overflow?: Float32Array): void {
    const sampleRateMs = this.config.sampleRate / 1000
    const speechPadSamples = this.config.speechPadMs * sampleRateMs

    // Calculate duration info
    const duration = (this.bufferPointer / this.config.sampleRate) * 1000
    const overflowLength = overflow?.length ?? 0

    // Create the final buffer with padding
    const prevLength = this.prevBuffers.reduce((acc, b) => acc + b.length, 0)
    const finalBuffer = new Float32Array(prevLength + this.bufferPointer + speechPadSamples)

    // Add previous buffers for pre-speech padding
    let offset = 0
    for (const prev of this.prevBuffers) {
      finalBuffer.set(prev, offset)
      offset += prev.length
    }

    // Add the main speech segment
    finalBuffer.set(this.buffer.slice(0, this.bufferPointer + speechPadSamples), offset)

    // Emit the speech segment
    this.emit('speech-end', undefined)
    this.emit('speech-ready', {
      buffer: finalBuffer,
      duration,
    })

    // Reset for the next segment
    if (overflow) {
      this.buffer.set(overflow, 0)
    }
    this.reset(overflowLength)
  }

  /**
   * Reset the VAD state
   */
  private reset(offset: number = 0): void {
    this.buffer.fill(0, offset)
    this.bufferPointer = offset
    this.isRecording = false
    this.speechSamples = 0
    this.postSpeechSamples = 0
    this.prevBuffers = []
  }
}

/**
 * Create a VAD processor with the given configuration
 */
export async function createVAD(config?: Partial<BaseVADConfig>): Promise<VAD> {
  const vad = new VAD(config)
  await vad.initialize()
  return vad
}
