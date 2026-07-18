<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

import ContainerError from './container-error.vue'

/**
 * Error boundary that contains exceptions thrown during the render or setup of
 * descendant components and renders a fallback UI instead of letting the error
 * propagate to the host (which would tear the surrounding layout down).
 *
 * Use when:
 * - Wrapping a `<RouterView>` so a single broken route never blanks the whole app shell.
 * - Wrapping any subtree where partial failure is preferable to total failure.
 *
 * Expects:
 * - Children may throw synchronously during render or in `setup`. Async rejections
 *   that bubble out of unhandled promises are NOT caught — Vue does not surface those
 *   to `onErrorCaptured`. Use `app.config.errorHandler` for those.
 *
 * Returns:
 * - Default slot when there is no captured error.
 * - `fallback` slot (or built-in `ContainerError` UI) when an error has been captured.
 *   The boundary suppresses error propagation by returning `false` from
 *   `onErrorCaptured`, so the parent stays mounted.
 */

interface ErrorBoundaryProps {
  /**
   * Optional title shown above the error details. Useful when the boundary
   * wraps a recognizable region (e.g. "Stage failed to load").
   */
  title?: string
  /**
   * Whether to show the built-in retry button. Retry remounts the default slot
   * by bumping an internal key, giving the subtree a fresh chance to render.
   * @default true
   */
  retryable?: boolean
  /**
   * Label for the retry button.
   * @default 'Try again'
   */
  retryLabel?: string
}

const props = withDefaults(defineProps<ErrorBoundaryProps>(), {
  retryable: true,
  retryLabel: 'Try again',
})

const emit = defineEmits<{
  (e: 'error', err: unknown, instance: unknown, info: string): void
  (e: 'retry'): void
}>()

const capturedError = ref<unknown>(null)
const capturedInfo = ref<string>('')
const renderKey = ref(0)

onErrorCaptured((err, instance, info) => {
  capturedError.value = err
  capturedInfo.value = info
  emit('error', err, instance, info)
  // Stop propagation so the host layout keeps rendering.
  return false
})

function retry() {
  capturedError.value = null
  capturedInfo.value = ''
  renderKey.value += 1
  emit('retry')
}

defineExpose({ retry, hasError: () => capturedError.value != null })
</script>

<template>
  <template v-if="capturedError == null">
    <slot :key="renderKey" />
  </template>
  <template v-else>
    <slot
      name="fallback"
      :error="capturedError"
      :info="capturedInfo"
      :retry="retry"
    >
      <div :class="['flex flex-col gap-3 p-4 max-w-2xl mx-auto']">
        <div v-if="props.title" :class="['text-base font-semibold text-red-700 dark:text-red-300']">
          {{ props.title }}
        </div>
        <div v-if="capturedInfo" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
          During: {{ capturedInfo }}
        </div>
        <ContainerError
          :error="capturedError"
          height-preset="lg"
        />
        <div v-if="props.retryable" :class="['flex justify-end']">
          <button
            type="button"
            :class="[
              'px-3 py-1.5 rounded-lg text-sm font-medium',
              'bg-red-100 hover:bg-red-200 text-red-800',
              'dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-200',
              'transition-colors',
            ]"
            @click="retry"
          >
            {{ props.retryLabel }}
          </button>
        </div>
      </div>
    </slot>
  </template>
</template>
