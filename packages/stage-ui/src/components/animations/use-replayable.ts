import { inject, onUnmounted } from 'vue'

interface ReplayableContext {
  registerReplayCallback: (callback: () => void | Promise<void>) => () => void
  isReplaying: () => boolean
}

export function useReplayable(replayFn?: () => void | Promise<void>) {
  const context = inject<ReplayableContext>('replayable')

  if (!context) {
    console.warn('useReplayable must be used within a Replayable component')

    return {
      registerReplay: () => () => {},
      isReplaying: () => false,
    }
  }

  const registerReplay = (callback: () => void | Promise<void>) => {
    return context.registerReplayCallback(callback)
  }

  // Auto-register if callback provided
  let unregister: (() => void) | undefined
  if (replayFn) {
    unregister = registerReplay(replayFn)
  }

  onUnmounted(() => {
    unregister?.()
  })

  return {
    registerReplay,
    isReplaying: context.isReplaying,
  }
}
