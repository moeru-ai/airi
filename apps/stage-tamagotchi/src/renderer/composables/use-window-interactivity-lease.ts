import { useIntervalFn } from '@vueuse/core'
import { onUnmounted } from 'vue'

const mouseInputLeaseRenewInterval = 1000

/**
 * Keeps the main-process click-through lease active while the renderer needs it.
 * The composable restores mouse input when its Vue owner unmounts.
 */
export function useWindowInteractivityLease(params: {
  invokeSetIgnoreMouseEvents: (payload: [boolean, { forward: boolean }]) => unknown
}): {
  setIgnoreMouseEvents: (ignore: boolean) => void
} {
  let isIgnoringMouseEvents = false
  const { pause, resume } = useIntervalFn(() => {
    if (isIgnoringMouseEvents)
      params.invokeSetIgnoreMouseEvents([true, { forward: true }])
  }, mouseInputLeaseRenewInterval, { immediate: false })

  function setIgnoreMouseEvents(ignore: boolean) {
    isIgnoringMouseEvents = ignore
    params.invokeSetIgnoreMouseEvents([ignore, { forward: true }])

    if (ignore)
      resume()
    else
      pause()
  }

  onUnmounted(() => {
    pause()
    params.invokeSetIgnoreMouseEvents([false, { forward: true }])
  })

  return {
    setIgnoreMouseEvents,
  }
}
