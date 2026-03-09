import type { MemoryEmbeddingProvider } from '@proj-airi/memory-alaya'

import { embedMany } from '@xsai/embed'

const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_BATCH_SIZE = 12

export type PlannerEmbeddingMode = 'primary'

export interface PlannerEmbeddingCallTrace {
  mode: PlannerEmbeddingMode
}

interface PlannerEmbeddingRuntime {
  enabled: boolean
  providerId?: string
  model?: string
  baseURL?: string
  apiKey?: string
  headers?: Record<string, string>
  timeoutMs?: number
  batchSize?: number
}

interface CreatePlannerEmbeddingProviderDeps {
  resolveRuntime: () => PlannerEmbeddingRuntime
  getProviderInstance: (providerId: string) => Promise<unknown>
  onCallTrace?: (trace: PlannerEmbeddingCallTrace) => void
}

interface EmbedCapableProvider {
  embed: (model: string) => Record<string, unknown>
}

function isEmbedCapableProvider(provider: unknown): provider is EmbedCapableProvider {
  return Boolean(
    provider
    && typeof provider === 'object'
    && typeof (provider as EmbedCapableProvider).embed === 'function',
  )
}

function chunkTexts(texts: string[], batchSize: number) {
  if (batchSize <= 0)
    return [texts]

  const chunks: string[][] = []
  for (let cursor = 0; cursor < texts.length; cursor += batchSize) {
    chunks.push(texts.slice(cursor, cursor + batchSize))
  }
  return chunks
}

async function runWithTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
) {
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), timeoutMs)
  try {
    return await task(abortController.signal)
  }
  finally {
    clearTimeout(timer)
  }
}

export function createPlannerEmbeddingProvider(
  deps: CreatePlannerEmbeddingProviderDeps,
): MemoryEmbeddingProvider {
  return {
    async embed(input) {
      const runtime = deps.resolveRuntime()
      if (!runtime.enabled || !runtime.providerId || !runtime.model) {
        throw new Error('Planner embedding runtime is not configured')
      }

      if (input.texts.length === 0) {
        deps.onCallTrace?.({
          mode: 'primary',
        })
        return {
          model: runtime.model,
          dimension: 0,
          vectors: [],
        }
      }

      const providerInstance = await deps.getProviderInstance(runtime.providerId)
      if (!isEmbedCapableProvider(providerInstance)) {
        throw new TypeError(`Provider "${runtime.providerId}" does not support embedding`)
      }

      const timeoutMs = Number.isFinite(runtime.timeoutMs)
        ? Math.max(1_000, Math.floor(runtime.timeoutMs!))
        : DEFAULT_TIMEOUT_MS
      const batchSize = Number.isFinite(runtime.batchSize)
        ? Math.max(1, Math.floor(runtime.batchSize!))
        : DEFAULT_BATCH_SIZE

      const vectors: number[][] = []
      let dimension = 0
      for (const texts of chunkTexts(input.texts, batchSize)) {
        const embeddingRequestBase = providerInstance.embed(runtime.model)
        const requestBase = {
          ...embeddingRequestBase,
          ...(runtime.baseURL ? { baseURL: runtime.baseURL } : {}),
          ...(runtime.apiKey ? { apiKey: runtime.apiKey } : {}),
          ...(runtime.headers
            ? {
                headers: {
                  ...(embeddingRequestBase as { headers?: Record<string, string> }).headers,
                  ...runtime.headers,
                },
              }
            : {}),
        }
        const response = await runWithTimeout(timeoutMs, async (signal) => {
          return await embedMany({
            ...requestBase,
            input: texts,
            abortSignal: signal,
          } as Parameters<typeof embedMany>[0])
        })

        for (const vector of response.embeddings) {
          const currentDimension = vector.length
          if (currentDimension <= 0) {
            throw new Error('Embedding provider returned an empty vector')
          }

          if (dimension === 0) {
            dimension = currentDimension
          }
          else if (dimension !== currentDimension) {
            throw new Error(`Embedding dimension mismatch: expected ${dimension}, got ${currentDimension}`)
          }

          vectors.push(vector)
        }
      }

      if (vectors.length !== input.texts.length) {
        throw new Error(`Embedding vector count mismatch: expected ${input.texts.length}, got ${vectors.length}`)
      }

      deps.onCallTrace?.({
        mode: 'primary',
      })

      return {
        model: runtime.model,
        dimension,
        vectors,
      }
    },
  }
}
