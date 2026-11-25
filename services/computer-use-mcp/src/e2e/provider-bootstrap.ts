const DEFAULT_GITHUB_MODELS_BASE_URL = 'https://models.github.ai/inference'
const DEFAULT_GOOGLE_GENERATIVE_AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/'

const githubModelsApiKeyCandidates = [
  'AIRI_E2E_GITHUB_MODELS_API_KEY',
  'GITHUB_MODELS_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GitHub_token',
] as const

const googleGenerativeApiKeyCandidates = [
  'AIRI_E2E_GOOGLE_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
] as const

const openAICompatibleApiKeyCandidates = [
  'AIRI_E2E_API_KEY',
  'AIRI_E2E_OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_API_KEY',
] as const

const openAICompatibleBaseUrlCandidates = [
  'AIRI_E2E_BASE_URL',
  'AIRI_E2E_OPENAI_COMPATIBLE_BASE_URL',
] as const

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>

function readFirstNonEmptyValue(source: EnvMap, keys: readonly string[]) {
  for (const key of keys) {
    const value = source[key]?.trim()
    if (value) {
      return value
    }
  }

  return ''
}

export function resolveGithubModelsApiKey(params: {
  processEnv: EnvMap
  dotenvValues: Record<string, string>
}) {
  return readFirstNonEmptyValue(params.processEnv, githubModelsApiKeyCandidates)
    || readFirstNonEmptyValue(params.dotenvValues, githubModelsApiKeyCandidates)
}

export function resolveGoogleGenerativeApiKey(params: {
  processEnv: EnvMap
  dotenvValues: Record<string, string>
}) {
  return readFirstNonEmptyValue(params.processEnv, googleGenerativeApiKeyCandidates)
    || readFirstNonEmptyValue(params.dotenvValues, googleGenerativeApiKeyCandidates)
}

export function resolveOpenAICompatibleApiKey(params: {
  processEnv: EnvMap
  dotenvValues: Record<string, string>
}) {
  return readFirstNonEmptyValue(params.processEnv, openAICompatibleApiKeyCandidates)
    || readFirstNonEmptyValue(params.dotenvValues, openAICompatibleApiKeyCandidates)
}

export function resolveOpenAICompatibleBaseUrl(params: {
  processEnv: EnvMap
  dotenvValues: Record<string, string>
}) {
  return readFirstNonEmptyValue(params.processEnv, openAICompatibleBaseUrlCandidates)
    || readFirstNonEmptyValue(params.dotenvValues, openAICompatibleBaseUrlCandidates)
}

export function resolvePreferredChatProviderId(params: {
  requestedProviderId?: string
  processEnv: EnvMap
  dotenvValues: Record<string, string>
}) {
  if (params.requestedProviderId?.trim()) {
    return params.requestedProviderId.trim()
  }

  if (resolveGithubModelsApiKey(params)) {
    return 'github-models'
  }

  if (resolveGoogleGenerativeApiKey(params)) {
    return 'google-generative-ai'
  }

  return 'github-models'
}

export function getProviderBootstrapConfig(params: {
  providerId: string
  processEnv: EnvMap
  dotenvValues: Record<string, string>
}) {
  if (params.providerId === 'github-models') {
    const apiKey = resolveGithubModelsApiKey(params)
    if (!apiKey) {
      return undefined
    }

    return {
      apiKey,
      baseUrl: DEFAULT_GITHUB_MODELS_BASE_URL,
    }
  }

  if (params.providerId === 'google-generative-ai') {
    const apiKey = resolveGoogleGenerativeApiKey(params)
    if (!apiKey) {
      return undefined
    }

    return {
      apiKey,
      baseUrl: DEFAULT_GOOGLE_GENERATIVE_AI_BASE_URL,
    }
  }

  if (params.providerId === 'openai-compatible') {
    const apiKey = resolveOpenAICompatibleApiKey(params)
    const baseUrl = resolveOpenAICompatibleBaseUrl(params)
    if (!apiKey || !baseUrl) {
      return undefined
    }

    return {
      apiKey,
      baseUrl,
    }
  }

  return undefined
}
