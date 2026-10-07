import type { Router } from 'vue-router'

declare global {
  interface Window {
    __airiKirieAndroidBack?: () => void
  }
}

/** Routes programmatic traversal through the asset WebView history. */
export function installKirieAndroidNavigation(router: Router) {
  // NOTICE:
  // Kirie Android's asset WebView does not traverse same-document hash history.
  // Runtime comparison showed that router.back() leaves the active route unchanged.
  // Source: apps/stage-pocket/src/main.ts uses hash history for kirie-android.
  // Remove this stack when the WebView traverses Kirie's hash history correctly.
  const routeStack: string[] = []
  // The cursor preserves forward entries until a new successful push replaces them.
  let position = -1
  let traversal: { path: string, position: number } | undefined
  const nativeGo = router.go.bind(router)
  const history = router.options.history
  const replace = history.replace.bind(history)
  let replaced = false

  // Vue Router commits this boundary only after guards succeed, including push({ replace: true }).
  history.replace = (to, data) => {
    replace(to, data)
    replaced = true
  }

  router.afterEach((to, _from, failure) => {
    const replaceEntry = replaced
    replaced = false
    if (failure) {
      traversal = undefined
      return
    }

    if (traversal?.path === to.fullPath) {
      position = traversal.position
      traversal = undefined
      return
    }

    if (replaceEntry && position >= 0) {
      routeStack[position] = to.fullPath
      return
    }

    if (routeStack[position] !== to.fullPath) {
      routeStack.splice(position + 1)
      routeStack.push(to.fullPath)
      position = routeStack.length - 1
    }
  })

  function navigate(delta: number) {
    if (delta === 0) {
      nativeGo(delta)
      return
    }

    const targetPosition = position + delta
    const path = routeStack[targetPosition]
    if (!path || traversal)
      return

    traversal = { path, position: targetPosition }
    void router.replace(path)
  }

  router.go = navigate
  router.back = () => navigate(-1)
  router.forward = () => navigate(1)
  window.__airiKirieAndroidBack = () => {
    // NOTICE:
    // Pocket leaves a catch-all route unchanged and reloads other routes on system Back.
    // Capacitor sends this action to WebView navigation instead of Vue Router traversal.
    // Source/context: recordings-android/android-back-final-7f930b29f-2026-10-07/events/.
    // Remove this behavior when Pocket system Back uses Vue Router traversal.
    const isNotFoundRoute = router.currentRoute.value.matched
      .some(route => route.name === '/[...all]')
    if (isNotFoundRoute)
      return

    nativeGo(0)
  }
}
