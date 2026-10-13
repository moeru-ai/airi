import type { SherpawModel } from '@proj-airi/provider-inference'

import { acceptsHotwords, SHERPAW_TRANSCRIPTION_PROVIDER_ID } from '@proj-airi/provider-inference'

import { APPLE_SPEECH_TRANSCRIPTION_PROVIDER_ID } from '../providers/providers/apple-speech'

/** Apple Speech rejects a session with more contextual strings. The provider adapter cuts the list to this size. */
const APPLE_CONTEXTUAL_STRINGS = 100

/**
 * What one transcription request does with a bias list.
 *
 * - `sent`: the provider receives `phrases` and applies them.
 * - `ignored`: the provider receives the list, but the selected model cannot apply it.
 * - `unsupported`: Hearing does not send the list, so the request body does not change.
 */
export interface BiasDelivery {
  readonly status: 'sent' | 'ignored' | 'unsupported'
  readonly phrases: readonly string[]
  readonly note: string
}

/**
 * Mirrors the delivery rules of Hearing and the provider adapters for one bias list.
 *
 * The rules live in `stores/modules/hearing.ts`, the Apple Speech provider, and the Sherpaw runtime.
 * The transcription bias devtool shows this result before a request runs. A change to those rules must change this function.
 */
export function describeBiasDelivery(
  target: { providerId: string, supportsHotwords: boolean, sherpawModel?: SherpawModel },
  phrases: readonly string[],
): BiasDelivery {
  if (!target.supportsHotwords)
    return { status: 'unsupported', phrases: [], note: 'This provider does not declare hotwords. Hearing sends the request without the list.' }

  if (target.providerId === SHERPAW_TRANSCRIPTION_PROVIDER_ID) {
    if (!target.sherpawModel)
      return { status: 'ignored', phrases: [], note: 'The configured Sherpaw model is not known to this app.' }
    if (!acceptsHotwords(target.sherpawModel))
      return { status: 'ignored', phrases: [], note: `${target.sherpawModel.name} cannot encode plain-text hotwords. The request keeps greedy search.` }
    return {
      status: 'sent',
      phrases,
      note: `Sent to ${target.sherpawModel.name} as hotwords, one per line, with modified beam search. sherpa-onnx skips a phrase with a character outside the model tokens.`,
    }
  }

  if (target.providerId === APPLE_SPEECH_TRANSCRIPTION_PROVIDER_ID) {
    const sent = phrases.slice(0, APPLE_CONTEXTUAL_STRINGS)
    const cut = phrases.length - sent.length
    return { status: 'sent', phrases: sent, note: `Sent as Apple contextualStrings.${cut > 0 ? ` ${cut} phrases after the first 100 are cut.` : ''}` }
  }

  return { status: 'sent', phrases, note: 'Sent as the hotwords request option.' }
}
