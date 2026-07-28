import type { Directive } from 'vue'

/**
 * Creates a local Vue directive that records a typed button action before the
 * button's click handler runs.
 *
 * Use this for actions that become meaningful when the click is accepted. If
 * an action depends on a later confirmation or async outcome, track that
 * outcome explicitly instead.
 */
export function useTrackButton<TAction extends string>(
  trackAction: (action: TAction) => void,
): Directive<HTMLElement, TAction> {
  const actions = new WeakMap<HTMLElement, TAction>()
  const listeners = new WeakMap<HTMLElement, EventListener>()

  return {
    mounted(element, binding) {
      actions.set(element, binding.value)

      const listener = () => {
        const action = actions.get(element)
        if (action)
          trackAction(action)
      }

      listeners.set(element, listener)
      element.addEventListener('click', listener, { capture: true })
    },
    updated(element, binding) {
      actions.set(element, binding.value)
    },
    beforeUnmount(element) {
      const listener = listeners.get(element)
      if (listener)
        element.removeEventListener('click', listener, { capture: true })

      actions.delete(element)
      listeners.delete(element)
    },
  }
}
