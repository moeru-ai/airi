import type { Plugin } from 'vue'
import type { HistoryState, RouteLocationNormalized } from 'vue-router'

import { nextTick } from 'vue'
import { useRouter } from 'vue-router'

/**
 * Restores the settings viewport per browser history entry. Install after the router.
 * Uses Vue Router web/hash history positions, without persistence across reloads.
 * Positions live for the app lifetime, including when the settings layout unmounts.
 * New pages start at the top; history traversal restores the saved position.
 */
export const settingsScroll: Plugin = {
  install(app) {
    const router = app.runWithContext(() => useRouter())
    const history = router.options.history
    const positions = new Map<HistoryState[string], { top: number, left: number }>()
    const destinations = new WeakMap<RouteLocationNormalized, { top: number, left: number }>()
    let currentEntry = history.state.position
    let disposed = false

    const removeBeforeGuard = router.beforeEach((to, from) => {
      const viewport = document.getElementById('settings-scroll-container')
      const leavingPosition = viewport && { top: viewport.scrollTop, left: viewport.scrollLeft }
      if (leavingPosition)
        positions.set(currentEntry, leavingPosition)

      // On popstate the history entry changes before guards run. Push and replace
      // change it only after guards succeed. URL keys cannot distinguish repeat visits.
      const isHistoryTraversal = history.state.position !== currentEntry
      let destination
      if (isHistoryTraversal)
        destination = positions.get(history.state.position)
      else if (to.path === from.path)
        destination = leavingPosition
      if (destination)
        destinations.set(to, destination)
    })

    const removeAfterGuard = router.afterEach(async (to, _from, failure) => {
      // Aborted and cancelled navigations keep the visible page and its position.
      if (failure)
        return

      const destination = destinations.get(to)
      currentEntry = history.state.position
      // Replacing an entry or pushing over forward history must not reuse its old offset.
      positions.delete(currentEntry)
      await nextTick()
      if (disposed || router.currentRoute.value !== to)
        return

      const viewport = document.getElementById('settings-scroll-container')
      if (!viewport)
        return

      viewport.scrollTop = destination?.top ?? 0
      viewport.scrollLeft = destination?.left ?? 0
    })

    app.onUnmount(() => {
      disposed = true
      removeBeforeGuard()
      removeAfterGuard()
      positions.clear()
    })
  },
}
