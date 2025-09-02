/**
 * Bindings for Tauri Whisper plugin
 */

// Stub for web environment - Tauri API will be available at runtime in Tauri apps
function invoke(command: string, args?: any): Promise<any> {
  if (typeof window !== 'undefined' && '__TAURI__' in window && window.__TAURI__ != null) {
    // In Tauri environment, use the global invoke
    return (window as any).__TAURI__.tauri.invoke(command, args)
  }
  throw new Error('Tauri API not available in web environment')
}

export interface WhisperTranscriptionOptions {
  chunk: number[]
  language?: string | null
}

export interface WhisperModelLoadOptions {
  modelType?: string
}

export interface WhisperModel {
  id: string
  name: string
  size: string
  description: string
}

export const WHISPER_MODELS: WhisperModel[] = [
  {
    id: 'tiny',
    name: 'Tiny',
    size: '39MB',
    description: 'Fastest model, lowest accuracy',
  },
  {
    id: 'base',
    name: 'Base',
    size: '74MB',
    description: 'Balanced speed and accuracy',
  },
  {
    id: 'small',
    name: 'Small',
    size: '244MB',
    description: 'Good accuracy, moderate speed',
  },
  {
    id: 'medium',
    name: 'Medium',
    size: '769MB',
    description: 'High accuracy, slower speed',
  },
  {
    id: 'large',
    name: 'Large',
    size: '1550MB',
    description: 'Highest accuracy, slowest speed',
  },
]

/**
 * Check if we're running in Tauri environment
 */
export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined'
    && '__TAURI__' in window
    && window.__TAURI__ != null
  )
}

/**
 * Load Whisper model via Tauri plugin
 */
export async function loadWhisperModel(options: WhisperModelLoadOptions = {}): Promise<void> {
  if (!isTauriEnvironment()) {
    throw new Error('Tauri environment not detected')
  }

  if (!invoke) {
    throw new Error('Tauri API not available')
  }

  try {
    await invoke('plugin:ipc-audio-transcription-ort|load_ort_model_whisper', {
      modelType: options.modelType || 'medium',
    })
  }
  catch (error) {
    console.error('Failed to load Whisper model:', error)
    throw new Error(`Failed to load Whisper model: ${error}`)
  }
}

/**
 * Transcribe audio using Tauri Whisper plugin
 */
export async function transcribeAudio(options: WhisperTranscriptionOptions): Promise<string> {
  if (!isTauriEnvironment()) {
    throw new Error('Tauri environment not detected')
  }

  if (!invoke) {
    throw new Error('Tauri API not available')
  }

  try {
    const result = await invoke('plugin:ipc-audio-transcription-ort|ipc_audio_transcription', {
      chunk: options.chunk,
      language: options.language || null,
    })

    return result as string
  }
  catch (error) {
    console.error('Failed to transcribe audio:', error)
    throw new Error(`Failed to transcribe audio: ${error}`)
  }
}

/**
 * Convert audio file to float32 array for Whisper
 */
export async function audioFileToFloat32Array(file: File | Blob): Promise<number[]> {
  const arrayBuffer = await file.arrayBuffer()
  const audioContext = new AudioContext()

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    // Get the first channel (mono)
    const channelData = audioBuffer.getChannelData(0)

    // Convert Float32Array to regular array
    return Array.from(channelData)
  }
  catch (error) {
    console.error('Failed to decode audio:', error)
    throw new Error(`Failed to decode audio: ${error}`)
  }
  finally {
    await audioContext.close()
  }
}

/**
 * Record audio from microphone and return as Float32Array
 */
export class WhisperAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private stream: MediaStream | null = null
  private audioChunks: Blob[] = []
  private isRecording = false

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording')
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        },
      })

      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      this.audioChunks = []

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.start()
      this.isRecording = true
    }
    catch (error) {
      console.error('Failed to start recording:', error)
      throw new Error(`Failed to start recording: ${error}`)
    }
  }

  async stopRecording(): Promise<number[]> {
    if (!this.isRecording || !this.mediaRecorder) {
      throw new Error('Not currently recording')
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not available'))
        return
      }

      this.mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
          const float32Array = await audioFileToFloat32Array(audioBlob)

          // Clean up
          this.cleanup()

          resolve(float32Array)
        }
        catch (error) {
          this.cleanup()
          reject(error)
        }
      }

      this.mediaRecorder.stop()
      this.isRecording = false
    })
  }

  private cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }
    this.mediaRecorder = null
    this.audioChunks = []
    this.isRecording = false
  }

  get recording(): boolean {
    return this.isRecording
  }
}

/**
 * Language codes supported by Whisper
 */
export const WHISPER_LANGUAGES = [
  { code: 'auto', name: 'Auto Detect' },
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Russian' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ar', name: 'Arabic' },
  { code: 'tr', name: 'Turkish' },
  { code: 'pl', name: 'Polish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'sv', name: 'Swedish' },
  { code: 'da', name: 'Danish' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fi', name: 'Finnish' },
]
