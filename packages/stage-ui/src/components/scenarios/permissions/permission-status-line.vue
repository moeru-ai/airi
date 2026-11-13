<script setup lang="ts">
defineProps<{
  /**
   * - `ok`: a green check, for a result.
   * - `busy`: a spinner, while the page waits for the system.
   * - `live`: a blinking dot, while the page listens.
   * - `info`: a neutral mark, for a limit the user can lift.
   */
  tone: 'ok' | 'busy' | 'live' | 'info'
}>()
</script>

<template>
  <p role="status" :class="['m-0 flex items-center gap-2 text-sm', tone === 'ok' ? 'text-neutral-900 font-medium dark:text-neutral-50' : 'text-neutral-500 dark:text-neutral-400', 'animate-slideUpAndFade']">
    <span v-if="tone === 'ok'" :class="['i-mingcute:check-circle-fill', 'size-4.5 shrink-0 text-green-600 dark:text-green-400', 'animate-bounce-in animate-duration-300']" aria-hidden="true" />
    <span v-else-if="tone === 'busy'" :class="['i-mingcute:loading-3-line', 'size-4 shrink-0 animate-spin text-primary-500']" aria-hidden="true" />
    <span v-else-if="tone === 'live'" :class="['size-2 shrink-0 rounded-full bg-primary-500', 'animate-pulse']" aria-hidden="true" />
    <span v-else :class="['i-mingcute:information-line', 'size-4.5 shrink-0']" aria-hidden="true" />
    <slot />
  </p>
</template>
