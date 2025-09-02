/**
 * Bindings for KoboldCPP Whisper API
 */

export interface KoboldCPPTranscriptionRequest {
  file: File | Blob
  model?: string
  language?: string
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
  temperature?: number
}

export interface KoboldCPPTranscriptionResponse {
  text: string
  language?: string
  duration?: number
  segments?: {
    id: number
    seek: number
    start: number
    end: number
    text: string
    tokens: number[]
    temperature: number
    avg_logprob: number
    compression_ratio: number
    no_speech_prob: number
  }[]
}

/**
 * Transcribe audio using KoboldCPP Whisper API
 */
export async function transcribeWithKoboldCPP(
  baseUrl: string,
  options: KoboldCPPTranscriptionRequest,
): Promise<string> {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  const formData = new FormData()

  // Ensure proper audio file format and validate content
  let audioFile = options.file

  // Validate file size
  if (audioFile.size === 0) {
    throw new Error('Audio file is empty')
  }

  // Create proper WAV file from Blob/File
  if (audioFile instanceof Blob) {
    const fileName = 'recording.wav'
    // Ensure we have audio/wav MIME type
    audioFile = new File([audioFile], fileName, {
      type: 'audio/wav',
      lastModified: Date.now(),
    })
  }

  console.warn(`Uploading audio file: ${audioFile instanceof File ? audioFile.name : 'blob'}, size: ${audioFile.size} bytes, type: ${audioFile.type}`)

  formData.append('file', audioFile, (audioFile instanceof File ? audioFile.name : null) || 'recording.wav')
  formData.append('model', options.model || 'whisper-1')

  if (options.language && options.language !== 'auto') {
    formData.append('language', options.language)
  }

  if (options.response_format) {
    formData.append('response_format', options.response_format)
  }

  if (options.temperature !== undefined) {
    formData.append('temperature', options.temperature.toString())
  }

  try {
    // Try multiple endpoints in order of preference
    const endpoints = [
      '/v1/audio/transcriptions',
      '/api/extra/transcribe',
      '/api/v1/audio/transcriptions',
    ]

    let lastError: Error | null = null

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${cleanBaseUrl}${endpoint}`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(60000), // 60 second timeout
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const result = await response.json() as KoboldCPPTranscriptionResponse | { transcription?: string }

        // Handle different response formats
        if ('text' in result && result.text) {
          return result.text
        }
        if ('transcription' in result && result.transcription) {
          return result.transcription
        }

        return 'No transcription result'
      }
      catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`Endpoint ${endpoint} failed:`, error)
        continue
      }
    }

    throw lastError || new Error('All KoboldCPP endpoints failed')
  }
  catch (error) {
    console.error('KoboldCPP transcription error:', error)
    throw new Error(`KoboldCPP transcription failed: ${error instanceof Error ? error.message : error}`)
  }
}

/**
 * Alternative endpoint for KoboldCPP Whisper
 */
export async function transcribeWithKoboldCPPLegacy(
  baseUrl: string,
  options: KoboldCPPTranscriptionRequest,
): Promise<string> {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  const formData = new FormData()

  // Ensure proper audio file format for legacy endpoint and validate content
  let audioFile = options.file

  // Validate file size
  if (audioFile.size === 0) {
    throw new Error('Audio file is empty')
  }

  // Create proper WAV file from Blob/File
  if (audioFile instanceof Blob) {
    const fileName = 'recording.wav'
    // Ensure we have audio/wav MIME type
    audioFile = new File([audioFile], fileName, {
      type: 'audio/wav',
      lastModified: Date.now(),
    })
  }

  console.warn(`Legacy - Uploading audio file: ${audioFile instanceof File ? audioFile.name : 'blob'}, size: ${audioFile.size} bytes, type: ${audioFile.type}`)

  formData.append('file', audioFile, (audioFile instanceof File ? audioFile.name : null) || 'recording.wav')

  if (options.language && options.language !== 'auto') {
    formData.append('language', options.language)
  }

  try {
    const response = await fetch(`${cleanBaseUrl}/api/extra/transcribe`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`KoboldCPP legacy API error: ${response.status} ${response.statusText}`)
    }

    const result = await response.json()
    return result.transcription || result.text || 'No transcription result'
  }
  catch (error) {
    console.error('KoboldCPP legacy transcription error:', error)
    throw new Error(`KoboldCPP legacy transcription failed: ${error}`)
  }
}

/**
 * Test KoboldCPP server connection
 */
export async function testKoboldCPPConnection(baseUrl: string): Promise<boolean> {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  const testEndpoints = [
    '/api/v1/model',
    '/api/v1/info/version',
    '/v1/models',
    '/api/extra/version',
  ]

  for (const endpoint of testEndpoints) {
    try {
      const response = await fetch(`${cleanBaseUrl}${endpoint}`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        return true
      }
    }
    catch (error) {
      console.warn(`Endpoint ${endpoint} failed:`, error)
      continue
    }
  }

  console.error('KoboldCPP connection test failed: All endpoints unreachable')
  return false
}

/**
 * Get KoboldCPP server info
 */
export async function getKoboldCPPInfo(baseUrl: string): Promise<any> {
  const cleanBaseUrl = baseUrl.trim().replace(/\/+$/, '')

  try {
    const response = await fetch(`${cleanBaseUrl}/api/v1/model`)

    if (!response.ok) {
      throw new Error(`Failed to get server info: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  }
  catch (error) {
    console.error('Failed to get KoboldCPP info:', error)
    throw error
  }
}

/**
 * Record audio and transcribe with KoboldCPP
 */
export class KoboldCPPAudioRecorder {
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

  async stopRecordingAndTranscribe(baseUrl: string, language?: string): Promise<string> {
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
          const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' })

          // Try main API first, fallback to legacy
          let transcription: string
          try {
            transcription = await transcribeWithKoboldCPP(baseUrl, {
              file: audioBlob,
              language,
            })
          }
          catch (mainError) {
            console.warn('Main API failed, trying legacy:', mainError)
            transcription = await transcribeWithKoboldCPPLegacy(baseUrl, {
              file: audioBlob,
              language,
            })
          }

          // Clean up
          this.cleanup()

          resolve(transcription)
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
