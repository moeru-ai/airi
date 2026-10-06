import type { Router } from 'vue-router'

declare global {
  interface Window {
    __airiKirieAndroidBack?: () => void
  }
}

export function installKirieAndroidNavigation(router: Router) {
  // NOTICE:
  // Kirie Android's asset WebView does not traverse same-document hash history.
  // Runtime comparison showed that router.back() leaves the active route unchanged.
  // Source: apps/stage-pocket/src/main.ts uses hash history for kirie-android.
  // Remove this stack when the WebView traverses Kirie's hash history correctly.
  const routeStack: string[] = []
  let backTarget: string | undefined

  router.afterEach((to, _from, failure) => {
    if (failure)
      return

    if (backTarget === to.fullPath) {
      backTarget = undefined
      return
    }

    if (routeStack.at(-1) !== to.fullPath)
      routeStack.push(to.fullPath)
  })

  function navigateBack() {
    if (routeStack.length <= 1)
      return

    routeStack.pop()
    backTarget = routeStack.at(-1)
    if (!backTarget)
      return

    void router.replace(backTarget)
  }

  router.back = navigateBack
  window.__airiKirieAndroidBack = navigateBack
}
