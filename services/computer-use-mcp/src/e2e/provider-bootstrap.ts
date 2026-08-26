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

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>

export function getProviderBootstrapConfig(params: {
  dotenvValues: Record<string, string>
  processEnv: EnvMap
  providerId: string
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

  return undefined
}

export function resolveGithubModelsApiKey(params: {
  dotenvValues: Record<string, string>
  processEnv: EnvMap
}) {
  return readFirstNonEmptyValue(params.processEnv, githubModelsApiKeyCandidates)
    || readFirstNonEmptyValue(params.dotenvValues, githubModelsApiKeyCandidates)
}

export function resolveGoogleGenerativeApiKey(params: {
  dotenvValues: Record<string, string>
  processEnv: EnvMap
}) {
  return readFirstNonEmptyValue(params.processEnv, googleGenerativeApiKeyCandidates)
    || readFirstNonEmptyValue(params.dotenvValues, googleGenerativeApiKeyCandidates)
}

export function resolvePreferredChatProviderId(params: {
  dotenvValues: Record<string, string>
  processEnv: EnvMap
  requestedProviderId?: string
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

function readFirstNonEmptyValue(source: EnvMap, keys: readonly string[]) {
  for (const key of keys) {
    const value = source[key]?.trim()
    if (value) {
      return value
    }
  }

  return ''
}
