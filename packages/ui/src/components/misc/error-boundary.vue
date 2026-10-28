<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue'

import Button from './button.vue'
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
      <div :class="['mx-auto max-w-2xl p-4']">
        <ContainerError
          :error="capturedError"
          :title="props.title"
          :description="capturedInfo ? `During: ${capturedInfo}` : undefined"
          :show-feedback-button="false"
          height-preset="lg"
        >
          <template v-if="props.retryable" #actions>
            <Button
              type="button"
              color="red"
              size="sm"
              :label="props.retryLabel"
              @click="retry"
            />
          </template>
        </ContainerError>
      </div>
    </slot>
  </template>
</template>
