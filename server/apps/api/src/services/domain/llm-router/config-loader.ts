import type { ConfigKVService } from '../../adapters/config-kv'
import type { LlmModel, ModelKind, RouterConfig, TtsModel } from './types'

import { createBadRequestError, createServiceUnavailableError } from '../../../utils/error'

/**
 * Default TTL for the in-memory config cache. Plan KTD-4 fallback path:
 * Pub/Sub invalidation is best-effort; TTL is the self-heal upper bound on
 * staleness when a Pub/Sub message is missed. 5s keeps configuration updates
 * propagating to every instance within a 5s window even with no Pub/Sub.
 */
const DEFAULT_CACHE_TTL_MS = 5_000

export type ConfigLoader = ReturnType<typeof createConfigLoader>

export interface ConfigLoaderOptions {
  /** ConfigKV service used to read `LLM_ROUTER_CONFIG`. */
  configKV: ConfigKVService
  /**
   * Clock injected for tests. Defaults to `Date.now`. We do NOT mock the
   * global Date object — tests pass a stub instead.
   * @default Date.now
   */
  now?: () => number
  /**
   * Cache TTL in milliseconds.
   * @default 5_000
   */
  ttlMs?: number
}

/**
 * Per-model config slice for a specific kind. Distinguished as a tagged
 * union so callers handle `llm` and `tts` shapes explicitly.
 */
export type ModelConfigSlice
  = | { defaults: RouterConfig['defaults'], kind: 'llm', model: LlmModel }
    | { defaults: RouterConfig['defaults'], kind: 'tts', model: TtsModel }

/**
 * Build the in-process config loader for the router.
 *
 * Use when:
 * - The router needs to resolve `LLM_ROUTER_CONFIG` and
 *   wants a single shared in-memory cache across requests.
 *
 * Expects:
 * - `configKV.getOptional('LLM_ROUTER_CONFIG')` returns either a parsed
 *   config tree or `null` when the entry is missing.
 *
 * Returns:
 * - `getModelConfig(kind, modelName)` — resolves one model slice; throws
 *   `BAD_REQUEST` for unknown models and `CONFIG_NOT_SET` (503) when the
 *   whole config entry is absent.
 * - `invalidate()` — clears the cache. Wired to Pub/Sub in U7 for cross-
 *   instance propagation; the configuration writer publishes after each write.
 */
export function createConfigLoader(options: ConfigLoaderOptions) {
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS
  const now = options.now ?? Date.now

  let cached: null | { loadedAt: number, value: RouterConfig } = null

  async function loadFresh(): Promise<RouterConfig> {
    const value = await options.configKV.getOptional('LLM_ROUTER_CONFIG')
    if (value == null) {
      throw createServiceUnavailableError(
        'LLM_ROUTER_CONFIG not set',
        'CONFIG_NOT_SET',
      )
    }
    cached = { loadedAt: now(), value }
    return value
  }

  async function getConfig(): Promise<RouterConfig> {
    if (cached != null && now() - cached.loadedAt < ttlMs)
      return cached.value
    return loadFresh()
  }

  async function getModelConfig(kind: ModelKind, modelName: string): Promise<ModelConfigSlice> {
    const config = await getConfig()
    if (kind === 'llm') {
      const model = config.llm.models[modelName]
      if (model == null) {
        throw createBadRequestError(
          'unknown_model',
          'BAD_REQUEST',
          { available: Object.keys(config.llm.models), requested: modelName },
        )
      }
      return { defaults: config.defaults, kind: 'llm', model }
    }
    const model = config.tts.models[modelName]
    if (model == null) {
      throw createBadRequestError(
        'unknown_model',
        'BAD_REQUEST',
        { available: Object.keys(config.tts.models), requested: modelName },
      )
    }
    return { defaults: config.defaults, kind: 'tts', model }
  }

  function invalidate(): void {
    cached = null
  }

  return { getModelConfig, invalidate }
}
