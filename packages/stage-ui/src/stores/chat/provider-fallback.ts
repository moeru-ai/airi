import type {
  ChatOrchestratorProviderCandidate,
  ChatOrchestratorProviderCandidateSource,
} from '@proj-airi/core-agent'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { ModelInfo } from '../../libs/providers'

import { errorMessageFrom } from '@moeru/std'

const OFFICIAL_PROVIDER_ID = 'official-provider'
const OFFICIAL_MODEL_ID = 'auto'

interface ChatProviderFallbackDependencies {
  fetchModels: (providerId: string) => Promise<ModelInfo[]>
  getCachedModels: (providerId: string) => ModelInfo[]
  getProviderInstance: (providerId: string) => Promise<ChatProvider>
  supportsModelListing: (providerId: string) => boolean
}

interface ChatProviderFallbackOptions {
  activeModel: string
  activeProvider: string
  authenticated: boolean
  configuredProviderIds: string[]
}

export interface ResolvedChatProviderRoute {
  /** Ordered candidates that the runtime resolves only after the primary provider fails. */
  fallbackCandidates: ChatOrchestratorProviderCandidateSource[]
  /** First usable provider and model for the chat turn. */
  primary: ChatOrchestratorProviderCandidate
}

interface ChatProviderCandidateSpec {
  model?: string
  providerId: string
  selectFirstListedModel: boolean
}

function buildCandidateSpecs(options: ChatProviderFallbackOptions): ChatProviderCandidateSpec[] {
  const specs: ChatProviderCandidateSpec[] = []
  const addedProviderIds = new Set<string>()

  const append = (providerId: string, model: string | undefined, selectFirstListedModel: boolean) => {
    if (!providerId || addedProviderIds.has(providerId))
      return
    if (providerId === OFFICIAL_PROVIDER_ID && !options.authenticated)
      return

    addedProviderIds.add(providerId)
    specs.push({ providerId, model, selectFirstListedModel })
  }

  append(options.activeProvider, options.activeModel, false)
  if (options.authenticated)
    append(OFFICIAL_PROVIDER_ID, OFFICIAL_MODEL_ID, false)
  for (const providerId of options.configuredProviderIds)
    append(providerId, undefined, true)

  return specs
}

async function resolveCandidate(
  spec: ChatProviderCandidateSpec,
  dependencies: ChatProviderFallbackDependencies,
): Promise<ChatOrchestratorProviderCandidate | undefined> {
  try {
    let model = spec.providerId === OFFICIAL_PROVIDER_ID ? OFFICIAL_MODEL_ID : spec.model?.trim()
    if (!model && !spec.selectFirstListedModel)
      return undefined

    if (dependencies.supportsModelListing(spec.providerId)) {
      const cachedModels = dependencies.getCachedModels(spec.providerId)
      const models = cachedModels.length > 0
        ? cachedModels
        : await dependencies.fetchModels(spec.providerId)

      if (model && !models.some(item => item.id === model))
        return undefined

      if (!model && spec.selectFirstListedModel)
        model = models.find(item => !!item.id)?.id
    }

    if (!model)
      return undefined

    const chatProvider = await dependencies.getProviderInstance(spec.providerId)
    return {
      providerId: spec.providerId,
      model,
      chatProvider,
    }
  }
  catch (error) {
    console.warn(
      `[chat] Provider "${spec.providerId}" is not available for fallback: ${errorMessageFrom(error) ?? 'Unknown error'}`,
    )
    return undefined
  }
}

/**
 * Resolves the first usable chat provider and keeps the remaining fixed-order candidates lazy.
 *
 * The active provider has first priority. The official provider has second priority after login.
 * Other configured providers keep registry order and use the first listed model.
 */
export async function resolveChatProviderRoute(
  options: ChatProviderFallbackOptions,
  dependencies: ChatProviderFallbackDependencies,
): Promise<ResolvedChatProviderRoute> {
  const sources = buildCandidateSpecs(options)
    .map(spec => () => resolveCandidate(spec, dependencies))

  for (const [index, source] of sources.entries()) {
    const primary = await source()
    if (!primary)
      continue

    return {
      primary,
      fallbackCandidates: sources.slice(index + 1),
    }
  }

  throw new Error('No available chat provider or model found')
}
