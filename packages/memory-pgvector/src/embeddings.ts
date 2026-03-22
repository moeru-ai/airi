import type { EmbeddingOutput, MemoryModuleConfig } from './types.js'

import { embed } from '@xsai/embed'

import { hashToken, normalizeVector, tokenize } from './text.js'

function createLocalEmbedding(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0)
  const tokens = tokenize(text)

  for (const token of tokens) {
    const bucket = hashToken(token, dimensions)
    const weight = 1 + Math.log1p(token.length)
    vector[bucket] = (vector[bucket] || 0) + weight
  }

  return normalizeVector(vector)
}

export async function embedText(text: string, config: MemoryModuleConfig): Promise<EmbeddingOutput> {
  const wantsProvider = config.embeddings.strategy === 'provider' || config.embeddings.strategy === 'hybrid'
  const hasProviderConfig = Boolean(config.embeddings.providerBaseUrl && config.embeddings.providerModel)

  if (wantsProvider && hasProviderConfig) {
    try {
      const response = await embed({
        baseURL: config.embeddings.providerBaseUrl!,
        apiKey: config.embeddings.providerApiKey || '',
        model: config.embeddings.providerModel!,
        input: text,
      })

      return {
        vector: normalizeVector(response.embedding),
        model: config.embeddings.providerModel!,
      }
    }
    catch (error) {
      if (config.embeddings.strategy === 'provider') {
        throw error
      }
    }
  }

  return {
    vector: createLocalEmbedding(text, Math.max(32, config.embeddings.localDimensions)),
    model: `local-hash-${Math.max(32, config.embeddings.localDimensions)}`,
  }
}
