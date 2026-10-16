import type { FullscreenSurfaceId } from '../../shared/eventa'
import type { FullscreenCarrier } from '../stores/fullscreen'

import { onMounted, onUnmounted } from 'vue'

import { useFullscreenStore } from '../stores/fullscreen'

/**
 * Lets the panel of a surface carry its state when the fullscreen mode moves to another window.
 *
 * Use when:
 * - A panel holds state that the user would lose on a move, such as an unsent draft or the page that shows.
 *
 * Expects:
 * - `collect` returns plain data, because the state crosses processes. `restore` takes the same data back.
 *
 * Returns:
 * - Nothing. The carrier starts when the panel mounts, so the panel content exists for `restore`, and it stops when
 *   the panel unmounts.
 */
export function useFullscreenCarry<T>(surface: FullscreenSurfaceId, carrier: FullscreenCarrier<T>) {
  const fullscreen = useFullscreenStore()
  let stop: (() => void) | undefined
  onMounted(() => {
    stop = fullscreen.carry(surface, carrier)
  })
  onUnmounted(() => stop?.())
}
