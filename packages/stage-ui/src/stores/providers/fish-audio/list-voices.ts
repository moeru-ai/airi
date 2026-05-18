import type { VoiceInfo } from '../../providers'

export interface FishAudioModelEntity {
  _id: string
  type: 'svc' | 'tts'
  title: string
  description: string
  state: 'created' | 'training' | 'trained' | 'failed'
  samples: Array<{ audio: string }>
  languages: string[]
}

interface FishAudioModelListResponse {
  items: FishAudioModelEntity[]
}

const TRAILING_SLASH_RE = /\/$/

function mapModelToVoiceInfo(model: FishAudioModelEntity): VoiceInfo {
  return {
    id: model._id,
    name: model.title,
    provider: 'fish-audio',
    description: model.description || undefined,
    previewURL: model.samples?.[0]?.audio || undefined,
    languages: model.languages.length > 0
      ? model.languages.map(lang => ({ code: lang, title: lang }))
      : [{ code: 'en', title: 'English' }],
  }
}

async function fetchModels(url: string, headers: HeadersInit): Promise<FishAudioModelEntity[]> {
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new Error(`Failed to fetch Fish Audio voices: ${response.status} ${response.statusText}`)
  }
  const data = await response.json() as FishAudioModelListResponse
  return data.items.filter(model => model.state === 'trained' && model.type === 'tts')
}

/**
 * Fetches voice models from Fish Audio and maps them to VoiceInfo.
 *
 * Fetches both the user's own models (GET /model?self=true) and the top
 * community/public models (GET /model?sort_by=task_count), merges them
 * deduped by ID, with own models listed first.
 */
export async function listFishAudioVoices(apiKey: string, baseUrl: string): Promise<VoiceInfo[]> {
  const base = baseUrl.replace(TRAILING_SLASH_RE, '')
  const headers: HeadersInit = { Authorization: `Bearer ${apiKey}` }

  // Fetch own models and popular public models in parallel
  const [ownModels, publicModels] = await Promise.all([
    fetchModels(`${base}/model?self=true&page_size=100`, headers),
    fetchModels(`${base}/model?sort_by=task_count&page_size=100`, headers),
  ])

  // Merge: own models first, then public models not already in the own list
  const ownIds = new Set(ownModels.map(m => m._id))
  const merged = [
    ...ownModels,
    ...publicModels.filter(m => !ownIds.has(m._id)),
  ]

  return merged.map(mapModelToVoiceInfo)
}
