export interface LifecycleAppHooks {
  onStart: (hook: () => void | Promise<void>) => void
  onStop: (hook: () => void | Promise<void>) => void
}

export interface Lifecycle {
  appHooks: LifecycleAppHooks
}

export interface LifecycleTriggerable extends Lifecycle {
  emitOnStart: () => Promise<void>
  emitOnStop: () => Promise<void>
}

export function buildLifecycle(): Lifecycle {
  const onStartHooks: (() => void | Promise<void>)[] = []
  const onStopHooks: (() => void | Promise<void>)[] = []

  const lifecycle: LifecycleTriggerable = {
    appHooks: {
      onStart(hook: () => void | Promise<void>) {
        if (hook) {
          onStartHooks.push(hook)
        }
      },
      onStop(hook: () => void | Promise<void>) {
        if (hook) {
          onStopHooks.push(hook)
        }
      },
    },
    emitOnStart: async () => {
      for (const hook of onStartHooks) {
        await hook()
      }
    },
    emitOnStop: async () => {
      for (const hook of onStopHooks) {
        await hook()
      }
    },
  }

  return lifecycle
}
