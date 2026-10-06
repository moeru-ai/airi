import type { ObjectDirective, Plugin } from 'vue'

import type { TrackSwitchEvent } from '../libs/product-signals/events/switch'

import { switchToggleEvent } from '@proj-airi/ui'

import { captureTrackSwitchEvent } from '../libs/product-signals/events/interaction'

/** Tracks user-requested switch values. Initialization and external model updates emit no interaction event. */
export function createTrackSwitchDirective(capture: (event: TrackSwitchEvent) => void): ObjectDirective<HTMLElement, string> {
  const states = new WeakMap<HTMLElement, { control: string, listener: EventListener }>()
  const handled = new WeakSet<Event>()

  return {
    mounted(element, binding) {
      const listener: EventListener = (event) => {
        const state = states.get(element)
        if (!state || !(event instanceof CustomEvent) || typeof event.detail !== 'boolean' || handled.has(event))
          return

        handled.add(event)
        capture({ control: state.control, checked: event.detail })
      }
      const state = { control: binding.value, listener }
      states.set(element, state)
      element.addEventListener(switchToggleEvent, listener)
    },
    updated(element, binding) {
      const state = states.get(element)
      if (state)
        state.control = binding.value
    },
    beforeUnmount(element) {
      const state = states.get(element)
      if (state)
        element.removeEventListener(switchToggleEvent, state.listener)
      states.delete(element)
    },
  }
}

const vTrackSwitch = createTrackSwitchDirective(captureTrackSwitchEvent)

export const trackSwitchPlugin: Plugin = {
  install(app) {
    app.directive('track-switch', vTrackSwitch)
  },
}

declare module 'vue' {
  interface GlobalDirectives {
    vTrackSwitch: typeof vTrackSwitch
  }
}
