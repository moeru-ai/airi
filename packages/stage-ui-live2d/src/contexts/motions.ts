import type { ComputedRef, ShallowRef } from 'vue'

import type { Live2DMotionControl } from '../controls/manifest'

import { computed, shallowRef } from 'vue'

/** Plays one motion on the model owned by the same Live2D Root. */
export interface Live2DMotionExecutor {
  play: (motion: Live2DMotionControl) => boolean | Promise<boolean>
}

/** Reactive motion registry for one Live2D Root. */
export interface Live2DMotionsContext {
  available: Readonly<ShallowRef<Live2DMotionControl[]>>
  enabled: ComputedRef<Live2DMotionControl[]>
  register: (motions: readonly Live2DMotionControl[]) => void
  resolve: (fileName: string) => Live2DMotionControl | undefined
  setExecutor: (executor: Live2DMotionExecutor | undefined) => void
  execute: (fileName: string) => Promise<boolean>
  clear: () => void
}

/** Creates the motion registry for one Live2D Root. */
export function createLive2DMotionsContext(
  isEnabled: (motion: Live2DMotionControl) => boolean,
): Live2DMotionsContext {
  const available = shallowRef<Live2DMotionControl[]>([])
  const enabled = computed(() => available.value.filter(isEnabled))
  let executor: Live2DMotionExecutor | undefined

  function register(motions: readonly Live2DMotionControl[]) {
    available.value = [...new Map(motions.map(motion => [motion.fileName, motion])).values()]
  }

  function resolve(fileName: string) {
    return enabled.value.find(motion => motion.fileName === fileName)
  }

  function setExecutor(nextExecutor: Live2DMotionExecutor | undefined) {
    executor = nextExecutor
  }

  async function execute(fileName: string) {
    const motion = resolve(fileName)
    if (!motion || !executor)
      return false

    return executor.play(motion)
  }

  function clear() {
    available.value = []
    executor = undefined
  }

  return {
    available,
    enabled,
    register,
    resolve,
    setExecutor,
    execute,
    clear,
  }
}
