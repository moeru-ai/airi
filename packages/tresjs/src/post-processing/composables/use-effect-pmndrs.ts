/**
 * https://github.com/Tresjs/post-processing/blob/c89b5b4353d889d58da4dd6746e64b32a3f711ec/src/core/pmndrs/EffectComposerPmndrs.vue
 */

import type { Effect } from 'postprocessing'
import type { Reactive, ShallowRef } from 'vue'

import { useTres } from '@tresjs/core'
import { EffectPass } from 'postprocessing'
import { inject, nextTick, onUnmounted, shallowRef, watch, watchEffect } from 'vue'

import { effectComposerInjectionKey } from '../components/EffectComposerPmndrs.vue'

/**
 * @param newEffectFunction - A function that returns a new effect instance.
 * @param passDependencies - A reactive object that the pass depends on (usually props). Changes to this object will trigger re-rendering.
 * @param dependencyFieldsTriggeringRecreation - fields in passDependencies that require effect recreation when changed
 */
export function useEffectPmndrs<T extends Effect, D extends Record<PropertyKey, any>>(newEffectFunction: () => T, passDependencies: Reactive<D>, dependencyFieldsTriggeringRecreation?: (keyof D)[]): {
  pass: ShallowRef<EffectPass | null>
  effect: ShallowRef<T | null>
} {
  const composer = inject(effectComposerInjectionKey)

  const pass = shallowRef<EffectPass | null>(null) as ShallowRef<EffectPass | null>
  const effect = shallowRef<T | null>(null) as ShallowRef<T | null>

  const { scene, camera, invalidate } = useTres()

  watch(passDependencies, () => invalidate())

  const removePass = () => {
    if (pass.value) {
      composer?.value?.removePass(pass.value)
    }

    effect.value?.dispose()
    pass.value?.dispose()
  }

  const createEffect = (index?: number) => {
    if (!camera.value || !composer?.value || !scene.value) {
      return
    }

    effect.value = newEffectFunction()
    pass.value = new EffectPass(camera.value, effect.value)

    composer.value.addPass(pass.value, index)
  }

  // Watch for changes in props that require effect recreation
  if (dependencyFieldsTriggeringRecreation) {
    watch(
      () => dependencyFieldsTriggeringRecreation.map(field => passDependencies[field]),
      () => {
        if (!composer?.value) {
          return
        }

        const index = composer.value?.passes.findIndex(p => p === pass.value)
        if (!~index) {
          return
        }

        removePass()
        createEffect(index)
      },
    )
  }

  watchEffect(() => {
    if (!camera.value || !effect?.value) {
      return
    }

    effect.value.mainCamera = camera.value
  })

  // Initial effect creation
  const unwatch = watchEffect(() => {
    if (!camera.value || !composer?.value || !scene.value) {
      return
    }

    nextTick(() => unwatch())
    if (effect.value) {
      return
    }

    createEffect()
  })

  onUnmounted(() => {
    removePass()
  })

  return {
    pass,
    effect,
  }
}
