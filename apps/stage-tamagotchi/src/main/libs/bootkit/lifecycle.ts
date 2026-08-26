const onAppReadyHooks = [] as (() => Promise<void> | void)[]
const onAppBeforeQuitHooks = [] as (() => Promise<void> | void)[]
const onAppWindowAllClosedHooks = [] as (() => Promise<void> | void)[]

export function onAppReady(fn: () => Promise<void> | void) {
  onAppReadyHooks.push(fn)
}

export async function emitAppReady() {
  for (const fn of onAppReadyHooks) {
    await fn()
  }
}

export function onAppBeforeQuit(fn: () => Promise<void> | void) {
  onAppBeforeQuitHooks.push(fn)
}

export async function emitAppBeforeQuit() {
  for (const fn of onAppBeforeQuitHooks) {
    await fn()
  }
}

export function onAppWindowAllClosed(fn: () => Promise<void> | void) {
  onAppWindowAllClosedHooks.push(fn)
}

export async function emitAppWindowAllClosed() {
  for (const fn of onAppWindowAllClosedHooks) {
    await fn()
  }
}
