import type { StandardGamepadSnapshot } from '@proj-airi/input-gamepad'
import type { DeepReadonly, ShallowRef } from 'vue'

import { StandardGamepadMonitor } from '@proj-airi/input-gamepad'
import { onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue'

/** Owns one browser Gamepad API polling loop for the current Vue component tree. */
export function useStandardGamepad(): DeepReadonly<ShallowRef<StandardGamepadSnapshot | undefined>> {
  const snapshot = shallowRef<StandardGamepadSnapshot>()
  const monitor = new StandardGamepadMonitor()
  const stopListening = monitor.onSnapshot((nextSnapshot) => {
    snapshot.value = nextSnapshot
  })

  onMounted(() => monitor.start())
  onBeforeUnmount(() => {
    stopListening()
    monitor.stop()
  })

  return readonly(snapshot)
}
