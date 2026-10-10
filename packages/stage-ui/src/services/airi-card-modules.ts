import type { AiriExtension } from '../types/airiCard'

import { OFFICIAL_SPEECH_STREAMING_PROVIDER_ID } from '../libs/providers/providers/official/constants'

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

/** The committed fields shared by character settings and speech output. */
export type SpeechSelection = Pick<AiriExtension['modules']['speech'], 'provider' | 'model' | 'voice_id'>

/** Resolves provider-owned custom fields without consulting the active character. */
export function resolveSpeechOutputSelection(selection: SpeechSelection, config?: Record<string, unknown>, streamingDefaultModel?: string | null): SpeechSelection {
  let model = selection.model || (typeof config?.model === 'string' ? config.model : '')
  if (selection.provider === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID && !model.includes('/'))
    model = streamingDefaultModel ?? model
  return {
    provider: selection.provider,
    model,
    voice_id: selection.voice_id || (typeof config?.voice === 'string' ? config.voice : ''),
  }
}

/** Keeps inherited fields empty. Compare the resolved provider because an empty source provider inherits defaults. */
export function completeSpeechOverrides(source: SpeechSelection, defaults: SpeechSelection, resolved: SpeechSelection): SpeechSelection {
  const inheritsModel = !source.model && resolved.provider === defaults.provider && resolved.model === defaults.model
  const inheritsVoice = !source.voice_id && resolved.provider === defaults.provider && resolved.model === defaults.model && resolved.voice_id === defaults.voice_id
  return {
    provider: source.provider,
    model: inheritsModel ? '' : resolved.model,
    voice_id: inheritsVoice ? '' : resolved.voice_id,
  }
}

/** Readiness describes configuration requirements, not a successful synthesis request. */
export function getSpeechSelectionState(selection: SpeechSelection): 'muted' | 'incomplete' | 'ready' {
  if (selection.provider === 'speech-noop')
    return 'muted'
  if (!selection.provider || !selection.model || !selection.voice_id)
    return 'incomplete'
  if (selection.provider === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID && !selection.model.includes('/'))
    return 'incomplete'
  return 'ready'
}
