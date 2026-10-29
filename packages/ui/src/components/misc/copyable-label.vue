<script setup lang="ts">
import { useClipboard } from '@vueuse/core'

/**
 * A value that the user can copy, for example in a detail panel. The copy button shows on hover, on keyboard focus,
 * and always on a touch screen. It turns into a check for a moment after a copy. The text stays selectable too.
 */
const props = defineProps<{
  /** The text that the button copies. The slot shows it, and can format it. */
  value: string
}>()

const { copy, copied, isSupported } = useClipboard({ legacy: true, copiedDuring: 1200 })
</script>

<template>
  <span :class="['group/copy inline-flex min-w-0 items-start gap-1']">
    <span :class="['min-w-0 select-text break-all']"><slot>{{ props.value }}</slot></span>
    <button
      v-if="isSupported"
      type="button"
      :aria-label="`Copy ${props.value}`"
      :class="[
        // A touch screen gets a real 24 px box, so the target does not cover the text next to it.
        'mt-px flex size-4 shrink-0 items-center justify-center rounded [@media(pointer:coarse)]:size-6',
        'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200',
        // A touch screen has no hover, so the button always shows there.
        copied ? 'opacity-100' : 'opacity-0 group-hover/copy:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
      ]"
      @click="copy(props.value)"
    >
      <span :class="[copied ? 'i-mingcute:check-line text-green-500' : 'i-mingcute:copy-2-line', 'size-3.5']" />
    </button>
  </span>
</template>
