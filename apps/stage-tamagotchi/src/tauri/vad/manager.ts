import type { VAD, VADConfig } from './vad'

export interface VADAudioOptions {
  /**
   * Audio context options
   */
  audioContextOptions?: AudioContextOptions

  /**
   * The minimum size of audio chunks to process
   */
  minChunkSize?: number

  /**
   * VAD configuration options
   */
  vadConfig?: Partial<VADConfig>
}

/**
 * Manages audio input and worklet processing for the VAD module
 */
export class VADAudioManager {
  private audioContext: AudioContext | null = null
  private audioWorkletNode: AudioWorkletNode | null = null
  private mediaStream: MediaStream | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private vad: VAD // Updated type
  private workletInitialized: boolean = false

  /**
   * Create a new VAD audio manager
   */
  constructor(vad: VAD, options: VADAudioOptions = {}) { // Updated parameter type
    this.vad = vad

    // Create audio context with user options or defaults
    this.audioContext = new AudioContext(options.audioContextOptions || {
      sampleRate: 16000, // Match the VAD sample rate
      latencyHint: 'interactive',
    })
  }

  /**
   * Initialize the audio worklet and connect to microphone
   */
  public async initialize(workletUrl: string): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio context not created')
    }

    try {
      if (!this.workletInitialized) {
        await this.audioContext.audioWorklet.addModule(workletUrl)
        URL.revokeObjectURL(workletUrl)
        this.workletInitialized = true
      }

      // Create the worklet node
      this.audioWorkletNode = new AudioWorkletNode(this.audioContext, 'vad-processor')

      // Set up message handling from the worklet
      this.audioWorkletNode.port.onmessage = async (event) => {
        const { buffer } = event.data
        if (buffer && buffer.length > 0) {
          await this.vad.processAudio(new Float32Array(buffer))
        }
      }
    }
    catch (error) {
      console.error('Failed to initialize audio worklet:', error)
      throw error
    }
  }

  /**
   * Start capturing audio from the microphone
   */
  public async startMicrophone(): Promise<void> {
    if (!this.audioContext || !this.audioWorkletNode) {
      throw new Error('Audio system not initialized. Call initialize() first.')
    }

    try {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: this.audioContext.sampleRate,
        },
      })

      // Create source node and connect to worklet
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.sourceNode.connect(this.audioWorkletNode)

      // Connect worklet to a silent destination (to keep the audio graph active)
      // Using a GainNode with gain=0 to ensure no sound is output
      const silentGain = this.audioContext.createGain()
      silentGain.gain.value = 0
      this.audioWorkletNode.connect(silentGain)
      silentGain.connect(this.audioContext.destination)
    }
    catch (error) {
      console.error('Failed to start microphone:', error)
      throw error
    }
  }

  public async stopMicrophone(): Promise<void> {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }

    this.audioContext?.suspend()
    this.audioWorkletNode?.disconnect()
  }

  /**
   * Stop capturing audio
   */
  public stop(): void {
    // Disconnect nodes
    if (this.sourceNode && this.audioWorkletNode) {
      this.sourceNode.disconnect()
      this.audioWorkletNode.disconnect()
    }

    // Stop all tracks in the media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    // Suspend the audio context rather than closing it
    // This allows us to reuse it later
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.suspend()
    }

    this.sourceNode = null
    this.audioWorkletNode = null
  }

  /**
   * Clean up all resources
   */
  public dispose(): void {
    this.stop()

    // Now fully close the audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close()
      this.audioContext = null
    }

    this.workletInitialized = false
  }
}
