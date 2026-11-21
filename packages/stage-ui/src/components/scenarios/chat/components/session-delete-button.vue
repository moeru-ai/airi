<script setup lang="ts">
import { iconButtonClasses } from './icon-button-classes'

/**
 * The delete button of a conversation or a folder. The first press asks for confirmation: the button turns in place
 * into a pill that names the action, and the second press deletes. The owner keeps the confirmation state and cancels
 * it on a press or a keyboard focus elsewhere.
 */
const props = withDefaults(defineProps<{
  confirming: boolean
  compact: boolean
  /** The name of the button before the first press. */
  label: string
  /** The text of the pill, and its name. */
  confirmLabel: string
  /** What the button deletes. The accessible name ends with it, so a list of buttons has distinct names. */
  subject?: string
  /** The resting button shows only while the pointer is over its group or the button has keyboard focus. */
  revealOnHover?: boolean
}>(), {
  revealOnHover: false,
})

const emit = defineEmits<{
  press: []
}>()

function nameOf(label: string) {
  return props.subject ? `${label}: ${props.subject}` : label
}
</script>

<template>
  <button
    type="button"
    :aria-label="nameOf(props.confirming ? props.confirmLabel : props.label)"
    :title="props.confirming ? props.confirmLabel : props.label"
    :class="props.confirming
      ? [
        'session-confirm-pill shrink-0 inline-flex items-center gap-1 whitespace-nowrap rounded-full outline-none',
        'bg-red-500/10 font-semibold text-red-500 dark:text-red-400',
        'focus-visible:outline-2 focus-visible:outline-red-500',
        props.compact ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
      ]
      : [
        iconButtonClasses,
        props.compact ? 'size-8' : 'size-10',
        'text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400',
        props.revealOnHover ? 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100' : '',
      ]"
    @click="emit('press')"
  >
    <span
      aria-hidden="true"
      :class="props.confirming
        ? 'i-mingcute:delete-2-fill size-3.5'
        : ['i-mingcute:delete-2-line', props.compact ? 'size-4' : 'size-5']"
    />
    <template v-if="props.confirming">
      {{ props.confirmLabel }}
    </template>
  </button>
</template>

<style scoped>
.session-confirm-pill {
  animation: session-confirm-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes session-confirm-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
}

@media (prefers-reduced-motion: reduce) {
  .session-confirm-pill {
    animation: none;
  }
}
</style>
