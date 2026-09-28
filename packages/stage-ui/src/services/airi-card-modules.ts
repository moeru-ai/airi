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

/** Resolves inherited settings without carrying a voice across provider or model boundaries. */
export function resolveCardModules(modules: AiriExtension['modules'], defaults: CardModuleDefaults): CardModuleDefaults {
  const speech = resolveModuleSelection(modules.speech, defaults.speech)
  return {
    consciousness: resolveModuleSelection(modules.consciousness, defaults.consciousness),
    vision: resolveModuleSelection(modules.vision, defaults.vision),
    speech: {
      ...speech,
      voice_id: modules.speech.voice_id || (
        speech.provider === defaults.speech.provider && speech.model === defaults.speech.model
          ? defaults.speech.voice_id
          : ''
      ),
    },
    displayModelId: modules.displayModelId || defaults.displayModelId,
  }
}
