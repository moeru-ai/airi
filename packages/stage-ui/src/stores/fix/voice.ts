import type { CommonRequestOptions } from '@xsai/shared'

export interface Voice {
  compatible_models: string[]
  description: string
  formats: VoiceFormat[]
  id: string
  labels: Record<string, any> & {
    accent?: string
    age?: string
    gender?: string
    type?: string
  }
  languages: VoiceLanguage[]
  name: string
  predefined_options?: Record<string, any>
  preview_audio_url?: string
  tags: string[]
}

export interface VoiceFormat {
  bitrate: number
  extension: string
  format_code: string
  mime_type: string
  name: string
  sample_rate: number
}

export interface VoiceLanguage {
  code: string
  title: string
}

export interface VoiceProvider {
  voice: () => Omit<CommonRequestOptions, 'model'> & { query?: string }
}

export interface VoiceProviderWithExtraOptions<T = undefined> {
  voice: (options?: T) => Omit<CommonRequestOptions, 'model'> & { query?: string } & Partial<T>
}
