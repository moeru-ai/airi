import type { Ref, WatchSource } from 'vue'

import type { ModelInfo, VoiceInfo } from '../../../../stores/providers'

import { watch } from 'vue'
import { z } from 'zod'

import { getAuthToken } from '../../../../libs/auth'
import { SERVER_URL } from '../../../../libs/server'
import { defineProvider } from '../registry'
import { createOfficialAudioProvider, createOfficialOpenAIProvider, OFFICIAL_ICON, withCredentials } from './shared'

export const OFFICIAL_SPEECH_PROVIDER_ID = 'official-provider-speech'
export const OFFICIAL_SPEECH_STREAMING_PROVIDER_ID = 'official-provider-speech-streaming'

// Locale → voice id map recommended by the server. Populated by listVoices()
// from the /audio/voices response's `recommended` field so the auto-pick can
// prefer a curated default per locale. Falls back to language + first-voice
// matching when the server returns no recommendations.
let recommendedVoicesByLocale: Record<string, string> = {}

const officialConfigSchema = z.object({})

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = getAuthToken()
  if (token)
    headers.Authorization = `Bearer ${token}`
  return headers
}

export const providerOfficialChat = defineProvider({
  id: 'official-provider',
  order: -1,
  name: 'Official Provider',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.official.title'),
  description: 'Official AI provider by AIRI.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.official.description'),
  tasks: ['text-generation'],
  icon: OFFICIAL_ICON,
  requiresCredentials: false,

  createProviderConfig: () => officialConfigSchema,
  createProvider(_config) {
    const provider = createOfficialOpenAIProvider()
    const originalChat = provider.chat.bind(provider)
    provider.chat = (model: string) => {
      const result = originalChat(model)
      result.fetch = withCredentials()
      return result
    }
    return provider
  },

  validationRequiredWhen: () => false,

  extraMethods: {
    listModels: async () => [
      {
        id: 'auto',
        name: 'Auto',
        provider: 'official-provider',
        description: 'Automatically routed by AI Gateway',
      },
    ],
  },
})

export const providerOfficialSpeech = defineProvider({
  id: OFFICIAL_SPEECH_PROVIDER_ID,
  order: -1,
  name: 'Official Speech Provider',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.official.speech-title'),
  description: 'Official text-to-speech provider by AIRI.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.official.speech-description'),
  tasks: ['text-to-speech'],
  icon: OFFICIAL_ICON,
  requiresCredentials: false,
  createProviderConfig: () => officialConfigSchema,
  createProvider(_config) {
    const provider = createOfficialAudioProvider()
    const originalSpeech = provider.speech.bind(provider)
    provider.speech = (model: string) => {
      const result = originalSpeech(model)
      result.fetch = withCredentials()
      return result
    }
    return provider
  },
  validationRequiredWhen: () => false,
  extraMethods: {
    listModels: async (): Promise<ModelInfo[]> => {
      const res = await globalThis.fetch(`${SERVER_URL}/api/v1/audio/models`, { headers: authHeaders() })
      if (!res.ok)
        return []

      const data = await res.json() as { models?: { id: string, name: string }[] }
      if (!Array.isArray(data.models))
        return []

      return data.models.map(m => ({
        id: m.id,
        name: m.name,
        provider: OFFICIAL_SPEECH_PROVIDER_ID,
      }))
    },
    listVoices: async (): Promise<VoiceInfo[]> => {
      const res = await globalThis.fetch(`${SERVER_URL}/api/v1/audio/voices`, { headers: authHeaders() })
      if (!res.ok)
        return []

      // Shape aligned with unspeech's types.ListVoicesResponse, plus the
      // `recommended` field our server injects from configKV DEFAULT_TTS_VOICES.
      // https://github.com/moeru-ai/unspeech/blob/main/pkg/backend/types/voices.go
      const data = await res.json() as {
        voices?: {
          id: string
          name: string
          description?: string
          labels?: Record<string, unknown>
          tags?: string[]
          languages?: { code: string, title: string }[]
          compatible_models?: string[]
          preview_audio_url?: string
        }[]
        recommended?: Record<string, string>
      }

      // Refresh the server-side recommendation map. Done here rather than
      // threading it through the return value because the auto-pick watcher
      // lives in this module and reads the same singleton.
      recommendedVoicesByLocale = (data.recommended && typeof data.recommended === 'object') ? data.recommended : {}

      if (!Array.isArray(data.voices))
        return []

      return data.voices.map((v) => {
        // unspeech surfaces gender inside labels rather than as a top-level field.
        const rawGender = typeof v.labels?.gender === 'string' ? (v.labels.gender as string) : undefined
        return {
          id: v.id,
          name: v.name,
          provider: OFFICIAL_SPEECH_PROVIDER_ID,
          description: v.description || undefined,
          gender: rawGender?.toLowerCase() || undefined,
          previewURL: v.preview_audio_url || undefined,
          // NOTICE: deliberately dropping `compatible_models`. The official
          // provider resolves voices through the server's /audio/voices?model=
          // endpoint, which already returns only voices valid for the active
          // model (or the DEFAULT_TTS_MODEL when the client's selection is the
          // 'auto' alias). Re-applying the client-side filter on top would
          // zero out the list because upstream compatibility ids never match
          // 'auto'. See packages/stage-pages/.../speech.vue filter predicate.
          languages: Array.isArray(v.languages) ? v.languages : [],
        }
      })
    },
  },
})

/**
 * Streaming sibling of {@link providerOfficialSpeech}. Same auth and voice
 * catalog as the HTTP TTS provider, but speech synthesis goes through the
 * `/api/v1/audio/speech/ws` proxy (server bridges to unspeech bidirectional
 * upstream — Volcengine v3 today). The pipeline consumer (Stage.vue) detects
 * this provider id and dispatches to `streamingSynthesize` instead of
 * `generateSpeech`.
 *
 * The `createProvider` hook still returns the OpenAI-shaped provider so that
 * legacy code paths (REST `/v1/audio/speech` fallback when the ws path errors
 * out) keep working without a separate provider instance.
 */
export const providerOfficialSpeechStreaming = defineProvider({
  id: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
  order: -1,
  name: 'Official Streaming Speech Provider',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.official.speech-streaming-title'),
  description: 'Official streaming text-to-speech provider by AIRI (low-latency bidirectional WebSocket).',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.official.speech-streaming-description'),
  tasks: ['text-to-speech'],
  icon: OFFICIAL_ICON,
  requiresCredentials: false,
  // Mark this provider as speaking the bidirectional ws TTS protocol so the
  // session adapter (`tts-session.ts`) picks the streaming path without
  // hard-coding provider id. Default for every other provider is `'rest'`.
  capabilities: {
    speech: { transport: 'bidirectional-ws' },
  },
  createProviderConfig: () => officialConfigSchema,
  createProvider(_config) {
    // Same audio-scoped baseURL as the HTTP speech provider. The streaming
    // provider does not actually use `.speech()` for synthesis (it goes
    // through `streamingSynthesize` which opens its own WebSocket), but the
    // OpenAI-shaped provider instance is still returned so legacy fallback
    // and feature-detection helpers keep working.
    const provider = createOfficialAudioProvider()
    const originalSpeech = provider.speech.bind(provider)
    provider.speech = (model: string) => {
      const result = originalSpeech(model)
      result.fetch = withCredentials()
      return result
    }
    return provider
  },
  validationRequiredWhen: () => false,
  extraMethods: {
    listModels: async (): Promise<ModelInfo[]> => {
      // Streaming-capable models. The wire `model` field uses the
      // `<backend>/<id>` shape unspeech expects (see
      // `unspeech/docs/wire-protocols/audio-speech-stream-v1.md`).
      return [
        {
          id: 'volcengine/seed-tts-2.0',
          name: 'Volcengine Seed-TTS 2.0',
          provider: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
          description: 'Volcengine bidirectional streaming TTS (TTS 2.0)',
        },
        {
          id: 'volcengine/seed-tts-1.0',
          name: 'Volcengine Seed-TTS 1.0',
          provider: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
          description: 'Volcengine bidirectional streaming TTS (TTS 1.0)',
        },
      ]
    },
    listVoices: async (_config, _provider, model): Promise<VoiceInfo[]> => {
      // Streaming voices live behind a dedicated endpoint
      // (`/audio/voices/streaming`) because they come from a separate
      // configKV entry (`STREAMING_TTS_UPSTREAM`) than the HTTP TTS
      // `?model=...` lookup. The server proxies to unspeech's
      // `/api/voices?provider=volcengine`, which ships an embed-time
      // catalogue without requiring credentials.
      //
      // `model` here is the unspeech-routed id (e.g. `volcengine/seed-tts-2.0`).
      // unspeech expects the bare `api_resource_id` for its filter, so we
      // strip the backend prefix before forwarding.
      const apiResourceId = model?.includes('/') ? model.split('/', 2)[1] : model
      const voicesURL = new URL(`${SERVER_URL}/api/v1/audio/voices/streaming`)
      if (apiResourceId)
        voicesURL.searchParams.set('model', apiResourceId)
      const res = await globalThis.fetch(
        voicesURL.toString(),
        { headers: authHeaders() },
      )
      if (!res.ok)
        return []

      const data = await res.json() as {
        voices?: {
          id: string
          name: string
          description?: string
          labels?: Record<string, unknown>
          languages?: { code: string, title: string }[]
          preview_audio_url?: string
        }[]
      }
      if (!Array.isArray(data.voices))
        return []

      return data.voices.map((v) => {
        const rawGender = typeof v.labels?.gender === 'string' ? (v.labels.gender as string) : undefined
        return {
          id: v.id,
          name: v.name,
          provider: OFFICIAL_SPEECH_STREAMING_PROVIDER_ID,
          description: v.description || undefined,
          gender: rawGender?.toLowerCase() || undefined,
          previewURL: v.preview_audio_url || undefined,
          languages: Array.isArray(v.languages) ? v.languages : [],
        }
      })
    },
  },
})

const LOCALE_SEPARATOR_RE = /[-_]/

function languagePrefix(locale: string): string {
  return locale.split(LOCALE_SEPARATOR_RE)[0].toLowerCase()
}

// Pick a locale from available voice locales that best matches the UI locale:
// exact match → language-subtag prefix match → en-US → first available.
function pickLocaleForUi(uiLocale: string, available: string[]): string {
  if (!available.length)
    return ''
  if (available.includes(uiLocale))
    return uiLocale
  const uiPrefix = languagePrefix(uiLocale)
  const prefixMatch = available.find(c => languagePrefix(c) === uiPrefix)
  if (prefixMatch)
    return prefixMatch
  return available.find(c => c === 'en-US') || available.find(c => c.toLowerCase().startsWith('en')) || available[0]
}

// Look up the recommended voice id for a locale: exact match first, then
// language-subtag prefix match. Returns undefined when nothing matches.
function lookupRecommendedVoiceId(locale: string, map: Record<string, string>): string | undefined {
  if (map[locale])
    return map[locale]

  const prefix = languagePrefix(locale)
  for (const [code, voiceId] of Object.entries(map)) {
    if (languagePrefix(code) === prefix)
      return voiceId
  }
  return undefined
}

// NOTICE: Only the official speech provider auto-configures a default voice
// after login. Third-party providers leave voice selection to the user. The
// target locale is derived from the UI locale on each run — we don't persist
// it, since that was the root of the cross-provider filter drift bug.
export function setupOfficialSpeechAutoPick(ctx: {
  activeSpeechProvider: Ref<string>
  activeSpeechVoiceId: Ref<string>
  availableVoices: Ref<Record<string, VoiceInfo[]>>
  uiLocale: WatchSource<string> | Ref<string>
}) {
  watch([ctx.availableVoices, ctx.activeSpeechProvider], ([voices, provider]) => {
    if (provider !== OFFICIAL_SPEECH_PROVIDER_ID)
      return
    if (ctx.activeSpeechVoiceId.value)
      return

    const providerVoices = voices[OFFICIAL_SPEECH_PROVIDER_ID]
    if (!providerVoices?.length)
      return

    const localeCodes = Array.from(new Set(
      providerVoices.flatMap(v => (v.languages || []).map(l => l.code).filter(Boolean)),
    )).sort()

    const uiLocaleValue = typeof ctx.uiLocale === 'function'
      ? (ctx.uiLocale as () => string)()
      : (ctx.uiLocale as Ref<string>).value
    const targetLocale = pickLocaleForUi(uiLocaleValue, localeCodes)

    // Pick a default voice with a layered fallback so auto-pick never dumps
    // the user into an unrelated voice (e.g. the alphabetically-first af-ZA
    // voice when nothing matches):
    //   1) server-recommended voice for the exact locale, then the same
    //      language prefix
    //   2) first voice speaking the exact target locale
    //   3) any English voice (en-US, then en-*) — broadest comprehensible
    //      fallback when the user's locale has no coverage at all
    //   4) alphabetical first voice, as a last resort
    const recommendedId = lookupRecommendedVoiceId(targetLocale, recommendedVoicesByLocale)
    const speaksLocale = (v: VoiceInfo, code: string) => (v.languages || []).some(l => l.code === code)
    const match = (recommendedId && providerVoices.find(v => v.id === recommendedId))
      || providerVoices.find(v => speaksLocale(v, targetLocale))
      || providerVoices.find(v => speaksLocale(v, 'en-US'))
      || providerVoices.find(v => (v.languages || []).some(l => l.code.toLowerCase().startsWith('en')))
      || providerVoices[0]
    if (match)
      ctx.activeSpeechVoiceId.value = match.id
  }, { deep: true, immediate: true })
}
