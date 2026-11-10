type LifecycleHook = () => Promise<void> | void

const onAppBeforeQuitHooks = [] as LifecycleHook[]
const onAppWindowAllClosedHooks = [] as LifecycleHook[]

/**
 * Adds a hook and returns the function that removes it. A hook owned by a
 * window must be removed when the window closes, or the list keeps the hook
 * and everything it holds for the life of the app.
 */
function register(hooks: LifecycleHook[], fn: LifecycleHook) {
  hooks.push(fn)
  return () => {
    const index = hooks.indexOf(fn)
    if (index !== -1)
      hooks.splice(index, 1)
  }
}

// Runs a copy of the list: a hook can close a window, and the window removes
// its own hooks while the list is being run.
async function emit(hooks: LifecycleHook[]) {
  for (const fn of hooks.slice()) {
    await fn()
  }
}

export function onAppBeforeQuit(fn: LifecycleHook) {
  return register(onAppBeforeQuitHooks, fn)
}

export async function emitAppBeforeQuit() {
  await emit(onAppBeforeQuitHooks)
}

export function onAppWindowAllClosed(fn: LifecycleHook) {
  return register(onAppWindowAllClosedHooks, fn)
}

export async function emitAppWindowAllClosed() {
  await emit(onAppWindowAllClosedHooks)
}
