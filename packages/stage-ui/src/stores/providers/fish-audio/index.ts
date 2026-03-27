import type { SpeechProvider } from '@xsai-ext/providers/utils'

const FISH_AUDIO_BASE_URL = 'https://api.fish.audio/'

export interface FishAudioConfig {
  apiKey: string
  baseUrl?: string
  model?: string
  referenceId?: string
  format?: 'wav' | 'pcm' | 'mp3' | 'opus'
  sampleRate?: number
  temperature?: number
  topP?: number
}

export interface FishAudioVoiceInfo {
  id: string
  title: string
  description?: string
  coverImage?: string
  tags?: string[]
  languages?: string[]
  taskCount?: number
  likeCount?: number
  author?: {
    id: string
    name: string
    avatar_url?: string
  }
  samples?: { url: string, text?: string }[]
}

export interface FishAudioSearchParams {
  pageSize?: number
  pageNumber?: number
  title?: string
  tag?: string | string[]
  language?: string | string[]
  self?: boolean
  authorId?: string
  sortBy?: 'score' | 'task_count' | 'created_at'
}

export interface FishAudioSearchResult {
  total: number
  items: FishAudioVoiceInfo[]
}

export function createFishAudioProvider(config: FishAudioConfig): SpeechProvider {
  const baseUrl = resolveBaseUrl(config.baseUrl)

  return {
    speech: () => ({
      baseURL: baseUrl,
      model: config.model || 's2-pro',
      voice: config.referenceId,
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (!init?.body || typeof init.body !== 'string') {
          throw new Error('Request body is required')
        }

        const body = JSON.parse(init.body)
        const requestModel = body.model || config.model || 's2-pro'

        const requestBody: Record<string, unknown> = {
          text: body.input,
          reference_id: body.voice || config.referenceId || null,
          format: config.format || 'mp3',
          temperature: config.temperature ?? 0.7,
          top_p: config.topP ?? 0.7,
        }

        if (config.sampleRate) {
          requestBody.sample_rate = config.sampleRate
        }

        const response = await fetch(`${baseUrl}v1/tts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'model': requestModel,
          },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Fish Audio API error: ${response.status} ${response.statusText} - ${errorText}`)
        }

        return response
      },
    }),
  }
}

function resolveBaseUrl(baseUrl?: string): string {
  return baseUrl?.endsWith('/') ? baseUrl : baseUrl ? `${baseUrl}/` : FISH_AUDIO_BASE_URL
}

function mapModelEntity(model: any): FishAudioVoiceInfo {
  return {
    id: model._id || model.id,
    title: model.title || model.name || model._id || model.id,
    description: model.description || '',
    coverImage: model.cover_image || undefined,
    tags: model.tags || [],
    languages: model.languages || [],
    taskCount: model.task_count,
    likeCount: model.like_count,
    author: model.author
      ? {
          id: model.author._id || model.author.id,
          name: model.author.name || model.author.username || '',
          avatar_url: model.author.avatar_url || model.author.avatarUrl,
        }
      : undefined,
    samples: Array.isArray(model.samples)
      ? model.samples.map((s: any) => ({ url: s.url, text: s.text }))
      : undefined,
  }
}

/**
 * Search / list Fish Audio voice models with pagination and filters.
 * Uses GET /model with query parameters per the Fish Audio API.
 */
export async function searchFishAudioVoices(
  apiKey: string,
  params: FishAudioSearchParams = {},
  baseUrl?: string,
): Promise<FishAudioSearchResult> {
  const url = resolveBaseUrl(baseUrl)

  const query = new URLSearchParams()
  if (params.pageSize != null)
    query.set('page_size', String(params.pageSize))
  if (params.pageNumber != null)
    query.set('page_number', String(params.pageNumber))
  if (params.title)
    query.set('title', params.title)
  if (params.self != null)
    query.set('self', String(params.self))
  if (params.authorId)
    query.set('author_id', params.authorId)
  if (params.sortBy)
    query.set('sort_by', params.sortBy)

  const tags = Array.isArray(params.tag) ? params.tag : params.tag ? [params.tag] : []
  for (const t of tags)
    query.append('tag', t)

  const langs = Array.isArray(params.language) ? params.language : params.language ? [params.language] : []
  for (const l of langs)
    query.append('language', l)

  const qs = query.toString()
  const endpoint = `${url}model${qs ? `?${qs}` : ''}`

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    throw new Error(`Fish Audio API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (Array.isArray(data)) {
    return { total: data.length, items: data.map(mapModelEntity) }
  }

  return {
    total: data.total ?? 0,
    items: Array.isArray(data.items) ? data.items.map(mapModelEntity) : [],
  }
}

export async function listFishAudioVoices(
  apiKey: string,
  baseUrl?: string,
): Promise<FishAudioVoiceInfo[]> {
  const result = await searchFishAudioVoices(apiKey, { pageSize: 20 }, baseUrl)
  return result.items
}
