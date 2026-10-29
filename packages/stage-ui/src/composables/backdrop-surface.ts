import type { InjectionKey, MaybeRefOrGetter } from 'vue'

import { inject, toValue, watch } from 'vue'

/**
 * Draws a platform material behind elements, for example the native window glass of the desktop app.
 *
 * The host provides it once at the app level. Without a provider, {@link useBackdropSurface} does nothing.
 * The host draws only the material. Each component paints its own fill over it.
 */
export interface BackdropSurfaceHost {
  /** Starts the material behind the element. The returned function stops it. */
  register: (element: HTMLElement) => () => void
}

export const backdropSurfaceHostKey: InjectionKey<BackdropSurfaceHost> = Symbol('@proj-airi/stage-ui/backdrop-surface-host')

/**
 * Declares that an element is a translucent surface, so the host can draw its material behind it.
 *
 * Use when:
 * - A component paints a translucent fill, and the desktop behind it shows through.
 *
 * Expects:
 * - The element paints its own fill. The fill stays readable without the material, because many hosts have none.
 * - `element` can change. A surface that appears registers, and a surface that goes away unregisters.
 * - `enabled` turns the declaration off and on while the element stays mounted.
 */
export function useBackdropSurface(
  element: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options: { enabled?: MaybeRefOrGetter<boolean> } = {},
) {
  const host = inject(backdropSurfaceHostKey, undefined)
  if (!host)
    return

  watch(() => toValue(options.enabled ?? true) ? toValue(element) : undefined, (target, _, onCleanup) => {
    if (target)
      onCleanup(host.register(target))
  }, { immediate: true, flush: 'post' })
}
