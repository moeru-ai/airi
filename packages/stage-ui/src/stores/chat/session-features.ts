import type { SessionFeatures } from '@proj-airi/core-agent'

import type { ChatSessionMeta } from '../../types/chat-session'

import { resolveSessionFeatures, restrictSessionFeatures } from '@proj-airi/core-agent'

/** Resolves inheritance for a conversation. Only recipe task sessions remain restricted by their parent. */
export function featuresForSession(defaults: SessionFeatures, metas: Record<string, ChatSessionMeta>, sessionId: string): SessionFeatures {
  const visited = new Set<string>()
  let current = sessionId
  let features = resolveSessionFeatures(defaults, metas[current]?.features)
  while (metas[current]?.recipeId && metas[current]?.parentSessionId) {
    if (visited.has(current))
      throw new Error('A task conversation cannot be its own ancestor')
    visited.add(current)
    current = metas[current].parentSessionId!
    features = restrictSessionFeatures(features, resolveSessionFeatures(defaults, metas[current]?.features))
  }
  return features
}
