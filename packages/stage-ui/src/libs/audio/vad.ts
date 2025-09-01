export interface BaseVADConfig {
  // Sample rate of the audio
  sampleRate: number
  // Probabilities above this value are considered speech
  speechThreshold: number
  // Threshold to exit speech state
  exitThreshold: number
  // Minimum silence duration to consider speech ended (ms)
  minSilenceDurationMs: number
  // Padding to add before and after speech (ms)
  speechPadMs: number
  // Minimum duration of speech to consider valid (ms)
  minSpeechDurationMs: number
  // Maximum buffer duration in seconds
  maxBufferDuration: number
  // Size of input buffers from audio source
  newBufferSize: number
}

export interface VADEvents {
  // Emitted when speech is detected
  'speech-start': void
  // Emitted when speech has ended
  'speech-end': void
  // Emitted when a complete speech segment is ready for transcription
  'speech-ready': { buffer: Float32Array, duration: number }
  // Emitted for status updates and errors
  'status': { type: string, message: string }
  // Debug info
  'debug': { message: string, data?: any }
}

export type VADEventCallback<K extends keyof VADEvents> = (event: VADEvents[K]) => void

export interface BaseVAD {
  initialize: () => Promise<void>
  processAudio: (inputBuffer: Float32Array) => Promise<void>
  on: <K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>) => void
  off: <K extends keyof VADEvents>(event: K, callback: VADEventCallback<K>) => void
}

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
  vadConfig?: Partial<BaseVADConfig>
}

export function createVADStates(vad: BaseVAD, vadAudioWorkletUrl: string, options?: VADAudioOptions) {
  let audioWorkletNode: AudioWorkletNode | null
  let mediaStream: MediaStream | null
  let sourceNode: MediaStreamAudioSourceNode | null
  let workletInitialized: boolean

  const {
    audioContextOptions = {
      sampleRate: 16000,
      latencyHint: 'interactive',
    },
  } = options || {}

  let audioContext = new AudioContext(audioContextOptions)

  async function initialize() {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext(audioContextOptions)
    }

    try {
      if (!workletInitialized) {
        await audioContext.audioWorklet.addModule(vadAudioWorkletUrl)
        workletInitialized = true
      }

      audioWorkletNode = new AudioWorkletNode(audioContext, 'vad-audio-worklet-processor')
      audioWorkletNode.port.onmessage = async (event) => {
        const { buffer } = event.data
        if (buffer && buffer.length > 0) {
          await vad.processAudio(new Float32Array(buffer))
        }
      }
    }
    catch (error) {
      console.error('Failed to initialize audio worklet:', error)
      throw error
    }
  }

  async function start(stream: MediaStream) {
    if (!audioContext || !audioWorkletNode) {
      throw new Error('Audio system not initialized. Call initialize() first.')
    }

    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      // Request microphone access
      mediaStream = stream

      // Create source node and connect to worklet
      sourceNode = audioContext.createMediaStreamSource(mediaStream)
      sourceNode.connect(audioWorkletNode)

      // Connect worklet to a silent destination (to keep the audio graph active)
      // Using a GainNode with gain=0 to ensure no sound is output
      const silentGain = audioContext.createGain()
      silentGain.gain.value = 0
      audioWorkletNode.connect(silentGain)
      silentGain.connect(audioContext.destination)
    }
    catch (error) {
      console.error('Failed to start microphone:', error)
      throw error
    }
  }

  function stop() {
    if (audioContext) {
      audioContext.suspend()
    }
  }

  function dispose() {
    if (sourceNode) {
      sourceNode.disconnect()
      sourceNode = null
    }
    if (audioWorkletNode) {
      audioWorkletNode.disconnect()
      audioWorkletNode = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop())
      mediaStream = null
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close()
    }

    workletInitialized = false
  }

  return {
    initialize,
    start,
    stop,
    dispose,
  }
}
