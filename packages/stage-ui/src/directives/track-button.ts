import type { ObjectDirective, Plugin } from 'vue'

import type { TrackButtonEvent } from '../libs/product-signals/events/interaction'

import { captureTrackButtonEvent } from '../libs/product-signals/events/interaction'

export type { ControlsIslandAction } from '../libs/product-signals/events/controls-island'
export type { TrackButtonEvent } from '../libs/product-signals/events/interaction'

/**
 * Creates the DOM directive used by the app-level tracking plugin.
 *
 * The listener deliberately receives no DOM event. This keeps `MouseEvent`
 * objects out of analytics callbacks and reads the latest binding when a
 * reactive event descriptor changes.
 */
export function createTrackButtonDirective(capture: (event: TrackButtonEvent) => void): ObjectDirective<HTMLElement, TrackButtonEvent> {
  const events = new WeakMap<HTMLElement, TrackButtonEvent>()
  const listeners = new WeakMap<HTMLElement, EventListener>()

  return {
    mounted(element, binding) {
      events.set(element, binding.value)

      const listener = () => {
        const event = events.get(element)
        if (event)
          capture(event)
      }

      listeners.set(element, listener)
      element.addEventListener('click', listener, { capture: true })
    },
    updated(element, binding) {
      events.set(element, binding.value)
    },
    beforeUnmount(element) {
      const listener = listeners.get(element)
      if (listener)
        element.removeEventListener('click', listener, { capture: true })

      events.delete(element)
      listeners.delete(element)
    },
  }
}

const vTrackButton = createTrackButtonDirective(captureTrackButtonEvent)

/**
 * Registers `v-track-button` once for a Vue application.
 *
 * Templates provide typed event descriptors while the directive owns DOM
 * listener lifecycle and analytics opt-in checks.
 */
export const trackButtonPlugin: Plugin = {
  install(app) {
    app.directive('track-button', vTrackButton)
  },
}

declare module 'vue' {
  interface GlobalDirectives {
    vTrackButton: typeof vTrackButton
  }
}
