import type { FullscreenSurfaceId } from '../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { defineStore } from 'pinia'
import { computed, ref, shallowReactive } from 'vue'
import { useRouter } from 'vue-router'

import { electronFullscreenSurfaceChanged } from '../../shared/eventa'
import { fullscreenSurfaceOf, fullscreenSurfaces } from '../components/fullscreen/surfaces'

/**
 * Where the fullscreen mode is, in the window that hosts it.
 *
 * - `closed`: nothing of the fullscreen mode is mounted.
 * - `expanding`: the host runs its open transition. The main window grows over its display here.
 * - `open`: the stage sits on the left, and the surface shows on the right.
 * - `closing`: the host runs its close transition. The main window shrinks back here.
 */
export type FullscreenPhase = 'closed' | 'expanding' | 'open' | 'closing'

/**
 * The fullscreen mode in the window that hosts it: the window covers its display, and a surface from
 * {@link fullscreenSurfaces} shows beside the character.
 *
 * Switching surfaces is not a navigation. Each surface that showed stays mounted until the mode closes, so it keeps what
 * it holds, and a settings page keeps its route. Closing the mode leaves those pages through the router, so a page can
 * stop it, like the card editor does for unsaved changes.
 *
 * Use when:
 * - An entry point opens a surface, the island switches it, or the host page runs the open and close transitions.
 *
 * Expects:
 * - The host page sets `home` to its own path, runs each transition, and reports its end through `settle`.
 *
 * Returns:
 * - The phase, the surface, the mounted surfaces, and actions that open, resume, close, and settle the mode.
 */
export const useFullscreenStore = defineStore('fullscreen', () => {
  const router = useRouter()
  const reportSurface = useElectronEventaInvoke(electronFullscreenSurfaceChanged)

  const phase = ref<FullscreenPhase>('closed')
  /** What shows on the right while the mode is active. */
  const surface = ref<FullscreenSurfaceId>('settings')
  /** The surfaces that showed since the mode opened. Their panels stay mounted until it closes. */
  const mounted = shallowReactive(new Set<FullscreenSurfaceId>())
  const active = computed(() => phase.value !== 'closed')
  /** The page of the window that hosts the mode. The router returns to it when the mode leaves the surface pages. */
  const home = ref('/')

  /** Tells the main process what shows and what stays mounted. It needs them to hand the chat draft over and to restore after a reload. */
  function report(shown: FullscreenSurfaceId | undefined) {
    void reportSurface({ surface: shown, mounted: shown ? [...mounted] : [] }).catch(error => console.error('[Main window fullscreen] Failed to report the surface:', error))
  }

  function show(next: FullscreenSurfaceId) {
    surface.value = next
    mounted.add(next)
  }

  /** Shows a surface, opening the mode when it is closed. `page` goes to the surface, such as a settings page. */
  async function open(next: FullscreenSurfaceId, page?: string) {
    await fullscreenSurfaces[next].prepare?.({ router, page })
    show(next)
    if (phase.value === 'closed')
      phase.value = 'expanding'
    else if (phase.value === 'open')
      report(next)
  }

  /** Shows the mode at once, without a transition, when the main window kept it across a page reload. */
  async function resume(kept: FullscreenSurfaceId) {
    if (phase.value !== 'closed')
      return
    await fullscreenSurfaces[kept].prepare?.({ router })
    show(kept)
    phase.value = 'open'
    report(kept)
  }

  /**
   * Closes the mode. The router leaves the surface pages first. A page that stops it, such as the card editor with
   * unsaved changes, keeps the mode open, and its surface shows so that its dialog is in view.
   */
  async function close() {
    if (phase.value !== 'open')
      return
    if (fullscreenSurfaceOf(router.currentRoute.value.path)) {
      const failure = await router.push(home.value)
      if (failure) {
        // The page that stopped the leave keeps its route, so its surface comes into view with its dialog.
        const blocked = fullscreenSurfaceOf(router.currentRoute.value.path)
        if (blocked) {
          show(blocked)
          report(blocked)
        }
        return
      }
    }
    // A page that leaves on its own while the mode is open also arrives here, and the check below keeps one close.
    if (phase.value !== 'open')
      return
    phase.value = 'closing'
    // The surfaces unmount as the transition starts, so the chat has no composer to collect from any more.
    report(undefined)
  }

  /** Hides a surface whose content moved elsewhere, such as the chat after a chat mode switch, and closes an empty mode. */
  async function dismiss(gone: FullscreenSurfaceId) {
    if (phase.value !== 'open')
      return
    mounted.delete(gone)
    const remaining = [...mounted][0]
    if (!remaining) {
      await close()
      return
    }
    if (surface.value === gone)
      surface.value = remaining
    report(surface.value)
  }

  /** Ends a transition. A closed mode unmounts every surface, so the next opening starts fresh. */
  function settle(state: 'open' | 'closed') {
    phase.value = state
    if (state === 'open') {
      report(surface.value)
      return
    }
    mounted.clear()
    // A rollback can close the mode on a settings page, so the route returns to the page of the host too.
    if (fullscreenSurfaceOf(router.currentRoute.value.path))
      void router.replace(home.value)
  }

  return { phase, surface, mounted, active, home, open, resume, close, dismiss, settle }
})
