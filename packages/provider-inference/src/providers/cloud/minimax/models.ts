import type { ModelInfo } from '../../../types'

/**
 * Limits ordinary MiniMax chat choices to current discovered models, with Flash first.
 * Requests and persisted selections do not pass through this catalog projection.
 * Route-specific metadata and the relative order of other models remain unchanged.
 */
export function selectMinimaxChatModels(models: ModelInfo[], route: 'direct' | 'openrouter'): ModelInfo[] {
  const ids = route === 'direct'
    ? ['MiniMax-M3.1-Flash', 'MiniMax-M3']
    : ['minimax/minimax-m3.1-flash:free', 'minimax/minimax-m3']
  const isMinimaxChat = (model: ModelInfo) => route === 'direct'
    ? /^(?:MiniMax-(?:M\d|Text)|abab[\d.].*-chat$)/.test(model.id) || model.id === 'M2-her'
    : /^minimax\/(?:minimax-(?:m\d|01)|m2-her)/.test(model.id)
  const currentModels = ids.flatMap((id) => {
    const model = models.find(model => model.id === id)
    return model ? [model] : []
  })
  let inserted = false
  return models.flatMap((model) => {
    if (!isMinimaxChat(model))
      return [model]
    if (inserted)
      return []
    inserted = true
    return currentModels
  })
}
