import { defineEventa } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'

/** Assistant spoken caption. The translation type adds the bilingual second line. */
export type CaptionChannelType
  = | 'caption-speaker'
    | 'caption-assistant'
    | 'caption-assistant-translation'

/** A caption update sent through the cross-window caption channel. */
export interface CaptionChannelEvent {
  /** Controls whether the overlay appends text or replaces the current source text. */
  operation?: 'append' | 'replace'
  /** Text rendered by the caption overlay. Empty text clears this source. */
  text: string
  /** Identifies the speaker that owns this caption text. */
  type: CaptionChannelType
  /**
   * Native language name for the translation line, for example `中文`.
   * Present only for `caption-assistant-translation`.
   */
  label?: string
}

/** One caption update on the cross-window caption bus. */
export const captionUpdatedEventa = defineEventa<CaptionChannelEvent>('eventa:event:caption-overlay:updated')

let context: ReturnType<typeof createBroadcastChannelContext>['context'] | undefined

/**
 * Caption bus shared by the stage window, the caption window, and the in-page
 * web overlay. The BroadcastChannel adapter routes through eventa, so windows
 * use one event contract and the same delivery rules as other cross-window
 * events. The context is lazy: runtimes without BroadcastChannel get a no-op
 * bus instead of a startup failure.
 */
function getCaptionContext() {
  if (typeof BroadcastChannel === 'undefined')
    return undefined
  context ??= createBroadcastChannelContext(new BroadcastChannel('airi-caption-overlay')).context
  return context
}

/** Publishes one caption update to every caption listener of this browser profile. */
export function publishCaption(event: CaptionChannelEvent): void {
  void getCaptionContext()?.emit(captionUpdatedEventa, event).catch(() => {
    // A closed bus must not break the caption producer.
  })
}

/** Subscribes to caption updates. Returns the function that detaches the listener. */
export function listenCaptions(handler: (event: CaptionChannelEvent) => void): () => void {
  return getCaptionContext()?.on(captionUpdatedEventa, (event) => {
    if (event.body)
      handler(event.body)
  }) ?? (() => {})
}
