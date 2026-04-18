import { resolvePepTutorBackendAuth } from '../utils/peptutor-backend-auth'
import { useHearingStore } from './modules/hearing'
import { useSpeechStore } from './modules/speech'
import { useProvidersStore } from './providers'

type ProviderConfigPatch = Record<string, unknown>

interface ProviderEnvBootstrapTarget {
  providerId: string
  config: ProviderConfigPatch
  model?: string
  voiceId?: string
  selectFirstVoice?: boolean
}

interface PepTutorVoiceEnvBootstrapPlan {
  speech?: ProviderEnvBootstrapTarget
  transcription?: ProviderEnvBootstrapTarget
}

const DEFAULT_TTS_MODELS: Record<string, string> = {
  'elevenlabs': 'eleven_multilingual_v2',
  'openai-audio-speech': 'tts-1',
  'openai-compatible-audio-speech': 'tts-1',
  'volcengine': 'v1',
}

const DEFAULT_ASR_MODELS: Record<string, string> = {
  'aliyun-nls-transcription': 'aliyun-nls-v1',
  'openai-audio-transcription': 'whisper-1',
  'openai-compatible-audio-transcription': 'whisper-1',
  'volcengine-realtime-transcription': '1.2.1.1',
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstDefinedString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeString(value)
    if (normalized) {
      return normalized
    }
  }
  return ''
}

function normalizeBaseUrl(value: unknown, fallback = ''): string {
  const baseUrl = firstDefinedString(value, fallback)
  if (!baseUrl) {
    return ''
  }
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

function buildPepTutorSpeechProxyUrl(baseUrl: unknown, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const normalizedBaseUrl = firstDefinedString(baseUrl).replace(/\/+$/, '')
  if (!normalizedBaseUrl) {
    return normalizedPath
  }
  return `${normalizedBaseUrl}${normalizedPath}`
}

function hasConfiguredValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasConfiguredValue)
  }
  return value != null
}

function maybeBuildPepTutorBackendProxyAuth(env: ImportMetaEnv) {
  const auth = resolvePepTutorBackendAuth(env)
  return auth?.accessToken || auth?.apiKey ? auth : undefined
}

function configValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true
  }

  if (
    left
    && right
    && typeof left === 'object'
    && typeof right === 'object'
  ) {
    try {
      return JSON.stringify(left) === JSON.stringify(right)
    }
    catch {
      return false
    }
  }

  return false
}

function shouldApplyConfigValue(currentValue: unknown, defaultValue: unknown): boolean {
  return !hasConfiguredValue(currentValue) || configValuesEqual(currentValue, defaultValue)
}

function applyMissingConfig(
  target: ProviderConfigPatch,
  patch: ProviderConfigPatch,
  defaults: ProviderConfigPatch = {},
): boolean {
  let changed = false

  for (const [key, value] of Object.entries(patch)) {
    if (!hasConfiguredValue(value)) {
      continue
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const existing = target[key]
      const nestedTarget = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? existing as ProviderConfigPatch
        : {}
      const nestedDefaults = defaults[key] && typeof defaults[key] === 'object' && !Array.isArray(defaults[key])
        ? defaults[key] as ProviderConfigPatch
        : {}
      const existingMatchesDefaults = shouldApplyConfigValue(existing, nestedDefaults)

      const nestedChanged = applyMissingConfig(nestedTarget, value as ProviderConfigPatch, nestedDefaults)
      if (nestedChanged || existingMatchesDefaults) {
        target[key] = nestedTarget
        changed ||= nestedChanged || !configValuesEqual(existing, nestedTarget)
      }
      continue
    }

    const currentValue = target[key]
    if (shouldApplyConfigValue(currentValue, defaults[key])) {
      target[key] = value
      changed ||= !configValuesEqual(currentValue, value)
    }
  }

  return changed
}

function resolveSpeechBootstrap(env: ImportMetaEnv): ProviderEnvBootstrapTarget | undefined {
  const providerId = firstDefinedString(env.VITE_PEPTUTOR_TTS_PROVIDER)
    || (firstDefinedString(env.VITE_DOUBAO_TTS_API_KEY, env.VITE_DOUBAO_TTS_APP_ID) ? 'volcengine' : '')
    || (firstDefinedString(env.ELEVENLABS_API_KEY) ? 'elevenlabs' : '')
    || (firstDefinedString(env.VITE_PEPTUTOR_TTS_API_KEY, env.OPENAI_API_KEY) ? 'openai-compatible-audio-speech' : '')

  if (!providerId) {
    return undefined
  }

  switch (providerId) {
    case 'elevenlabs': {
      const apiKey = firstDefinedString(env.VITE_PEPTUTOR_TTS_API_KEY, env.ELEVENLABS_API_KEY)
      if (!apiKey) {
        return undefined
      }

      const model = firstDefinedString(env.VITE_PEPTUTOR_TTS_MODEL) || DEFAULT_TTS_MODELS[providerId]
      const voiceId = firstDefinedString(env.VITE_PEPTUTOR_TTS_VOICE, env.ELEVENLABS_VOICE_ID)

      return {
        providerId,
        config: {
          apiKey,
          baseUrl: normalizeBaseUrl(env.VITE_PEPTUTOR_TTS_BASE_URL, env.ELEVENLABS_API_BASE_URL || 'https://unspeech.hyp3r.link/v1/'),
          model,
        },
        model,
        voiceId,
        selectFirstVoice: !voiceId,
      }
    }
    case 'openai-audio-speech':
    case 'openai-compatible-audio-speech': {
      const apiKey = firstDefinedString(env.VITE_PEPTUTOR_TTS_API_KEY, env.OPENAI_API_KEY)
      if (!apiKey) {
        return undefined
      }

      const model = firstDefinedString(env.VITE_PEPTUTOR_TTS_MODEL) || DEFAULT_TTS_MODELS[providerId]
      const voiceId = firstDefinedString(env.VITE_PEPTUTOR_TTS_VOICE) || 'alloy'

      return {
        providerId,
        config: {
          apiKey,
          baseUrl: normalizeBaseUrl(env.VITE_PEPTUTOR_TTS_BASE_URL, env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1/'),
          model,
          voice: voiceId,
        },
        model,
        voiceId,
      }
    }
    case 'volcengine': {
      const proxyAuth = maybeBuildPepTutorBackendProxyAuth(env)
      const apiKey = firstDefinedString(env.VITE_PEPTUTOR_TTS_API_KEY, env.VITE_DOUBAO_TTS_API_KEY)
      const appId = firstDefinedString(env.VITE_PEPTUTOR_TTS_APP_ID, env.VITE_DOUBAO_TTS_APP_ID)

      if (!apiKey || !appId) {
        return undefined
      }

      const model = firstDefinedString(env.VITE_PEPTUTOR_TTS_MODEL) || DEFAULT_TTS_MODELS[providerId]
      const voiceId = firstDefinedString(env.VITE_PEPTUTOR_TTS_VOICE)
      const cluster = firstDefinedString(env.VITE_PEPTUTOR_TTS_CLUSTER, env.VITE_DOUBAO_TTS_CLUSTER)
        || 'volcano_tts'
      const proxyUrl = firstDefinedString(env.VITE_PEPTUTOR_TTS_PROXY_URL, env.VITE_DOUBAO_TTS_PROXY_URL)
        || buildPepTutorSpeechProxyUrl(env.VITE_PEPTUTOR_LESSON_API_URL, '/api/peptutor/doubao-tts')

      return {
        providerId,
        config: {
          apiKey,
          proxyUrl,
          proxyAuth,
          model,
          app: {
            appId,
            cluster,
          },
        },
        model,
        voiceId,
        selectFirstVoice: !voiceId,
      }
    }
    default:
      return undefined
  }
}

function resolveTranscriptionBootstrap(env: ImportMetaEnv): ProviderEnvBootstrapTarget | undefined {
  const explicitDoubaoAsrSelection = firstDefinedString(env.VITE_PEPTUTOR_ASR_PROVIDER) === 'volcengine-realtime-transcription'
    || hasConfiguredValue(env.VITE_PEPTUTOR_ASR_API_KEY)
    || hasConfiguredValue(env.VITE_PEPTUTOR_ASR_APP_ID)
    || hasConfiguredValue(env.VITE_DOUBAO_ASR_API_KEY)
    || hasConfiguredValue(env.VITE_DOUBAO_ASR_APP_ID)

  const hasDoubaoCredentials = Boolean(firstDefinedString(
    env.VITE_PEPTUTOR_ASR_API_KEY,
    env.VITE_DOUBAO_ASR_API_KEY,
    ...(explicitDoubaoAsrSelection ? [] : [env.VITE_DOUBAO_TTS_API_KEY, env.VITE_PEPTUTOR_TTS_API_KEY]),
  ) && firstDefinedString(
    env.VITE_PEPTUTOR_ASR_APP_ID,
    env.VITE_DOUBAO_ASR_APP_ID,
    ...(explicitDoubaoAsrSelection ? [] : [env.VITE_DOUBAO_TTS_APP_ID, env.VITE_PEPTUTOR_TTS_APP_ID]),
  ))

  const hasAliyunCredentials = Boolean(firstDefinedString(
    env.VITE_PEPTUTOR_ALIYUN_NLS_ACCESS_KEY_ID,
    env.ALIYUN_AK_ID,
  ) && firstDefinedString(
    env.VITE_PEPTUTOR_ALIYUN_NLS_ACCESS_KEY_SECRET,
    env.ALIYUN_AK_SECRET,
  ) && firstDefinedString(
    env.VITE_PEPTUTOR_ALIYUN_NLS_APP_KEY,
    env.ALIYUN_NLS_APP_KEY,
    env.ALIYUN_APP_KEY,
  ))

  const providerId = firstDefinedString(env.VITE_PEPTUTOR_ASR_PROVIDER)
    || (hasDoubaoCredentials ? 'volcengine-realtime-transcription' : '')
    || (hasAliyunCredentials ? 'aliyun-nls-transcription' : '')
    || (firstDefinedString(env.VITE_PEPTUTOR_ASR_API_KEY, env.OPENAI_STT_API_KEY, env.OPENAI_API_KEY)
      ? 'openai-compatible-audio-transcription'
      : '')

  if (!providerId) {
    return undefined
  }

  switch (providerId) {
    case 'volcengine-realtime-transcription': {
      const proxyAuth = maybeBuildPepTutorBackendProxyAuth(env)
      const apiKey = firstDefinedString(
        env.VITE_PEPTUTOR_ASR_API_KEY,
        env.VITE_DOUBAO_ASR_API_KEY,
        ...(explicitDoubaoAsrSelection ? [] : [env.VITE_DOUBAO_TTS_API_KEY, env.VITE_PEPTUTOR_TTS_API_KEY]),
      )
      const appId = firstDefinedString(
        env.VITE_PEPTUTOR_ASR_APP_ID,
        env.VITE_DOUBAO_ASR_APP_ID,
        ...(explicitDoubaoAsrSelection ? [] : [env.VITE_DOUBAO_TTS_APP_ID, env.VITE_PEPTUTOR_TTS_APP_ID]),
      )

      if (!apiKey || !appId) {
        return undefined
      }

      const model = firstDefinedString(env.VITE_PEPTUTOR_ASR_MODEL, env.VITE_DOUBAO_ASR_MODEL) || DEFAULT_ASR_MODELS[providerId]
      const proxyUrl = firstDefinedString(env.VITE_PEPTUTOR_ASR_PROXY_URL, env.VITE_DOUBAO_ASR_PROXY_URL)
        || buildPepTutorSpeechProxyUrl(env.VITE_PEPTUTOR_LESSON_API_URL, '/api/peptutor/doubao-realtime-asr')
      const resourceId = firstDefinedString(env.VITE_PEPTUTOR_ASR_RESOURCE_ID, env.VITE_DOUBAO_ASR_RESOURCE_ID) || 'volc.speech.dialog'
      const appKey = firstDefinedString(env.VITE_PEPTUTOR_ASR_APP_KEY, env.VITE_DOUBAO_ASR_APP_KEY) || 'PlgvMymc7f3tQnJ6'

      return {
        providerId,
        config: {
          apiKey,
          proxyUrl,
          proxyAuth,
          model,
          resourceId,
          appKey,
          app: {
            appId,
          },
        },
        model,
      }
    }
    case 'aliyun-nls-transcription': {
      const accessKeyId = firstDefinedString(env.VITE_PEPTUTOR_ALIYUN_NLS_ACCESS_KEY_ID, env.ALIYUN_AK_ID)
      const accessKeySecret = firstDefinedString(env.VITE_PEPTUTOR_ALIYUN_NLS_ACCESS_KEY_SECRET, env.ALIYUN_AK_SECRET)
      const appKey = firstDefinedString(env.VITE_PEPTUTOR_ALIYUN_NLS_APP_KEY, env.ALIYUN_NLS_APP_KEY, env.ALIYUN_APP_KEY)

      if (!accessKeyId || !accessKeySecret || !appKey) {
        return undefined
      }

      return {
        providerId,
        config: {
          accessKeyId,
          accessKeySecret,
          appKey,
          region: firstDefinedString(env.VITE_PEPTUTOR_ALIYUN_NLS_REGION, env.ALIYUN_NLS_REGION) || 'cn-shanghai',
        },
        model: DEFAULT_ASR_MODELS[providerId],
      }
    }
    case 'openai-audio-transcription':
    case 'openai-compatible-audio-transcription': {
      const apiKey = firstDefinedString(env.VITE_PEPTUTOR_ASR_API_KEY, env.OPENAI_STT_API_KEY, env.OPENAI_API_KEY)
      if (!apiKey) {
        return undefined
      }

      const model = firstDefinedString(env.VITE_PEPTUTOR_ASR_MODEL, env.OPENAI_STT_MODEL) || DEFAULT_ASR_MODELS[providerId]

      return {
        providerId,
        config: {
          apiKey,
          baseUrl: normalizeBaseUrl(env.VITE_PEPTUTOR_ASR_BASE_URL, env.OPENAI_STT_API_BASE_URL || env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1/'),
          model,
        },
        model,
      }
    }
    default:
      return undefined
  }
}

export function resolvePepTutorVoiceEnvBootstrapPlan(env: ImportMetaEnv = import.meta.env): PepTutorVoiceEnvBootstrapPlan {
  return {
    speech: resolveSpeechBootstrap(env),
    transcription: resolveTranscriptionBootstrap(env),
  }
}

async function bootstrapProviderConfig(target: ProviderEnvBootstrapTarget): Promise<void> {
  const providersStore = useProvidersStore()
  const providerMetadata = providersStore.getProviderMetadata(target.providerId)
  const defaultConfig = providerMetadata.defaultOptions?.() || {}

  providersStore.initializeProvider(target.providerId)
  const config = providersStore.getProviderConfig(target.providerId)
  if (!config) {
    return
  }

  const changed = applyMissingConfig(config, target.config, defaultConfig)
  if (changed) {
    await providersStore.validateProvider(target.providerId)
  }
}

async function bootstrapSpeechSelection(target: ProviderEnvBootstrapTarget): Promise<void> {
  const speechStore = useSpeechStore()

  if (!speechStore.activeSpeechProvider || speechStore.activeSpeechProvider === 'speech-noop') {
    speechStore.activeSpeechProvider = target.providerId
  }

  if (speechStore.activeSpeechProvider !== target.providerId) {
    return
  }

  if (!speechStore.activeSpeechModel && target.model) {
    speechStore.activeSpeechModel = target.model
  }

  if (!speechStore.activeSpeechVoiceId && target.voiceId) {
    speechStore.activeSpeechVoiceId = target.voiceId
    return
  }

  if (!speechStore.activeSpeechVoiceId && target.selectFirstVoice) {
    const voices = await speechStore.loadVoicesForProvider(target.providerId)
    if (!speechStore.activeSpeechVoiceId && voices[0]?.id) {
      speechStore.activeSpeechVoiceId = voices[0].id
    }
  }
}

function bootstrapTranscriptionSelection(target: ProviderEnvBootstrapTarget): void {
  const hearingStore = useHearingStore()

  if (!hearingStore.activeTranscriptionProvider) {
    hearingStore.activeTranscriptionProvider = target.providerId
  }

  if (hearingStore.activeTranscriptionProvider !== target.providerId) {
    return
  }

  if (!hearingStore.activeTranscriptionModel && target.model) {
    hearingStore.activeTranscriptionModel = target.model
  }
}

export async function bootstrapPepTutorVoiceEnvDefaults(env: ImportMetaEnv = import.meta.env): Promise<void> {
  const plan = resolvePepTutorVoiceEnvBootstrapPlan(env)

  if (plan.transcription) {
    await bootstrapProviderConfig(plan.transcription)
    bootstrapTranscriptionSelection(plan.transcription)
  }

  if (plan.speech) {
    await bootstrapProviderConfig(plan.speech)
    await bootstrapSpeechSelection(plan.speech)
  }
}
