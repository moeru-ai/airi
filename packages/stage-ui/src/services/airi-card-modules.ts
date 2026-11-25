import type { AiriExtension } from '../types/airiCard'

/** Persisted defaults, separate from the selections applied by the active card. */
export type CardModuleDefaults = Pick<AiriExtension['modules'], 'consciousness' | 'vision' | 'speech'>

/** The speech provider that does not speak. The global speech setting uses it for None. */
export const SPEECH_NOOP_PROVIDER_ID = 'speech-noop'

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
 * A model-only override keeps its provider inheritance.
 * Returns `selections` unchanged when nothing matches.
 *
 * Pass `inherited` for the selections of a card. A cleared card selection then inherits the defaults.
 * A card has no None for speech, see {@link normalizeCardSpeech}.
 * Without `inherited`, the selections are the defaults. They have nothing to inherit, so a cleared default speech becomes None.
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
      ? { ...selections.speech, provider: inherited ? '' : SPEECH_NOOP_PROVIDER_ID, model: '', voice_id: '' }
      : { provider: '', model: '' }
    next = { ...next, [module]: cleared }
  }
  return next
}

/**
 * Returns the speech selection of a card without None.
 *
 * A card speech selection either inherits the global speech setting or names a provider. It has no None.
 * Versions before v0.12.0 copied the global speech setting into cards. Its unset value is `speech-noop`,
 * so those cards stored `speech-noop` and stayed silent after the user set up speech.
 * Card synchronization brings such stored cards to other devices.
 * This function reads a stored `speech-noop` as inheritance. It is a supported policy, not a temporary fallback.
 */
export function normalizeCardSpeech<T extends AiriExtension['modules']['speech']>(speech: T): T {
  if (speech.provider !== SPEECH_NOOP_PROVIDER_ID)
    return speech
  return { ...speech, provider: '', model: '', voice_id: '' }
}
