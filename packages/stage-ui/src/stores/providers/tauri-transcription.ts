import type { TranscriptionProvider } from '@xsai-ext/shared-providers'
import { invoke } from '@tauri-apps/api/core'

// Расширяем интерфейс Window для поддержки Tauri
declare global {
  interface Window {
    __TAURI__?: any
  }
}

export interface TauriTranscriptionOptions {
  model?: string
}

export interface WhisperModel {
  id: string
  name: string
  size: string
  url: string
}

// Доступные модели Whisper
export const WHISPER_MODELS: WhisperModel[] = [
  {
    id: 'whisper-tiny',
    name: 'Whisper Tiny',
    size: '39 MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin'
  },
  {
    id: 'whisper-base',
    name: 'Whisper Base', 
    size: '142 MB',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
  },
  {
    id: 'whisper-small',
    name: 'Whisper Small',
    size: '466 MB', 
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  }
]

export function createTauriTranscription(options: TauriTranscriptionOptions = {}): TranscriptionProvider {
  const modelId = options.model || 'whisper-tiny'
  
  return {
    transcription: (model: string) => ({
      baseURL: 'tauri://localhost',
      model: model || modelId,
      transcribe: async (audio: ArrayBuffer) => {
        try {
          // Проверяем, что мы в Tauri окружении
          if (typeof window === 'undefined' || !window.__TAURI__) {
            throw new Error('Tauri окружение недоступно')
          }
          
          // Загружаем модель если еще не загружена
          await invoke('plugin:ipc-audio-transcription-ort|load_ort_model_whisper', {
            modelType: modelId as 'base' | 'largev3' | 'tiny' | 'medium'
          })
          
          // Конвертируем ArrayBuffer в Uint8Array
          const audioData = new Uint8Array(audio)
          
          // Вызываем транскрипцию через Tauri
          const result = await invoke('plugin:ipc-audio-transcription-ort|ipc_audio_transcription', {
            chunk: Array.from(audioData),
            language: 'auto'
          })
          
          return {
            text: result as string
          }
        } catch (error) {
          console.error('Ошибка транскрипции Whisper:', error)
          throw new Error(`Ошибка транскрипции: ${error}`)
        }
      }
    })
  }
}

// Функция для загрузки модели Whisper
export async function loadWhisperModel(modelId: string): Promise<void> {
  try {
    // Проверяем, что мы в Tauri окружении
    if (typeof window !== 'undefined' && window.__TAURI__) {
      await invoke('plugin:ipc-audio-transcription-ort|load_ort_model_whisper', {
        modelType: modelId as 'base' | 'largev3' | 'tiny' | 'medium'
      })
    } else {
      console.warn('Tauri окружение недоступно, пропускаем загрузку модели Whisper')
    }
  } catch (error) {
    console.error('Ошибка загрузки модели Whisper:', error)
    throw new Error(`Ошибка загрузки модели: ${error}`)
  }
}

// Функция для автоматической загрузки модели Whisper Tiny при первом запуске
export async function initializeWhisperModel(): Promise<void> {
  try {
    // Загружаем самую маленькую модель Whisper Tiny по умолчанию
    await loadWhisperModel('tiny')
    console.log('Модель Whisper Tiny успешно загружена')
  } catch (error) {
    console.warn('Не удалось загрузить модель Whisper Tiny:', error)
    // Не выбрасываем ошибку, чтобы не блокировать запуск приложения
  }
}

// Функция для получения списка доступных моделей
export function getAvailableWhisperModels(): WhisperModel[] {
  return WHISPER_MODELS
}

// Функция для конвертации WAV ArrayBuffer в Float32Array
function wavToFloat32Array(wavBuffer: ArrayBuffer): Float32Array {
  const view = new DataView(wavBuffer)
  
  // Проверяем WAV заголовок
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (riff !== 'RIFF') {
    throw new Error('Invalid WAV file: missing RIFF header')
  }
  
  // Читаем параметры WAV файла
  const numChannels = view.getUint16(22, true)
  const sampleRate = view.getUint32(24, true)
  const bitsPerSample = view.getUint16(34, true)
  const dataOffset = 44 // Стандартный размер WAV заголовка
  
  console.log('WAV file info:', { numChannels, sampleRate, bitsPerSample, dataOffset })
  
  // Вычисляем количество сэмплов
  const dataSize = view.getUint32(40, true)
  const numSamples = dataSize / (bitsPerSample / 8)
  
  // Создаем Float32Array для аудио данных
  const audioData = new Float32Array(numSamples)
  
  // Конвертируем 16-bit PCM в Float32
  for (let i = 0; i < numSamples; i++) {
    const sample = view.getInt16(dataOffset + i * 2, true)
    audioData[i] = sample / 32768.0 // Нормализуем в диапазон [-1, 1]
  }
  
  return audioData
}

// Функция для прямой транскрипции аудио
export async function transcribeAudio(audio: ArrayBuffer): Promise<string> {
  try {
    console.log('🎤 Starting transcription...', {
      audioBufferSize: audio.byteLength,
      audioType: 'WAV ArrayBuffer'
    })
    
    // НЕ загружаем модель здесь, так как она уже должна быть загружена в index.vue
    console.log('🎤 Using pre-loaded Whisper model...')
    
    // Конвертируем WAV ArrayBuffer в Float32Array
    console.log('🎤 Converting WAV to Float32Array...')
    const audioData = wavToFloat32Array(audio)
    console.log('🎤 Audio conversion completed:', {
      samplesCount: audioData.length,
      durationSeconds: audioData.length / 16000,
      sampleRate: 16000
    })
    
    // Вызываем транскрипцию через Tauri
    console.log('🎤 Calling Tauri transcription...')
    const result = await invoke('plugin:ipc-audio-transcription-ort|ipc_audio_transcription', {
      chunk: Array.from(audioData),
      language: null // Используем автоопределение языка по умолчанию
    })
    
    console.log('🎤 Transcription completed:', {
      result: result as string,
      length: (result as string)?.length || 0
    })
    
    return result as string
  } catch (error) {
    console.error('🎤 Ошибка транскрипции Whisper:', error)
    throw new Error(`Ошибка транскрипции: ${error}`)
  }
}