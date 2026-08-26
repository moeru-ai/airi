import { inject, onUnmounted } from 'vue'

interface ReplayableContext {
  isReplaying: () => boolean
  registerReplayCallback: (callback: () => Promise<void> | void) => () => void
}

export function useReplayable(replayFn?: () => Promise<void> | void) {
  const context = inject<ReplayableContext>('replayable')

  if (!context) {
    console.warn('useReplayable must be used within a Replayable component')

    return {
      isReplaying: () => false,
      registerReplay: () => () => {},
    }
  }

  const registerReplay = (callback: () => Promise<void> | void) => {
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
    isReplaying: context.isReplaying,
    registerReplay,
  }
}
