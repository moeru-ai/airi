import type { AiriExtension } from '../types/airiCard'

/** Persisted defaults, separate from the selections applied by the active card. */
export type CardModuleDefaults = Pick<AiriExtension['modules'], 'consciousness' | 'vision' | 'speech'>

/**
 * Resolves a card selection without borrowing a model from another provider.
 * An empty model remains unconfigured when the card changes provider.
 * The caller must ask for a model or use that provider's own default.
 */
export function resolveModuleSelection(
  selection: AiriExtension['modules']['consciousness'],
  defaults: AiriExtension['modules']['consciousness'],
): AiriExtension['modules']['consciousness'] {
  const provider = selection.provider || defaults.provider
  const model = selection.model || (provider === defaults.provider ? defaults.model : '')
  return { provider, model }
}

export type CardProviderModule = keyof CardModuleDefaults

/**
 * Clears the selections whose provider, set or inherited, matches `shouldClear`.
 * A set speech provider becomes None. A model-only override keeps its provider inheritance.
 * Returns `selections` unchanged when nothing matches.
 */
export function clearModuleSelections<T extends CardModuleDefaults>(
  selections: T,
  modules: readonly CardProviderModule[],
  shouldClear: (providerId: string) => boolean,
  inherited?: CardModuleDefaults,
): T {
  let next = selections
  for (const module of modules) {
    const selection = selections[module]
    const voiceId = module === 'speech' ? selections.speech.voice_id : ''
    if (!selection.provider && !selection.model && !voiceId)
      continue

    const provider = selection.provider || inherited?.[module].provider
    if (!provider || !shouldClear(provider))
      continue

    const cleared = module === 'speech'
      ? { ...selections.speech, provider: selection.provider ? 'speech-noop' : '', model: '', voice_id: '' }
      : { provider: '', model: '' }
    next = { ...next, [module]: cleared }
  }
  return next
}
