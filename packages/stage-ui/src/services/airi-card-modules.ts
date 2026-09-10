import type { AiriExtension } from '../types/airiCard'

/** Persisted defaults, separate from the selections applied by the active card. */
export type CardModuleDefaults = Pick<AiriExtension['modules'], 'consciousness' | 'vision' | 'speech' | 'displayModelId'>

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
