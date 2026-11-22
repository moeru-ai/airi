<script setup lang="ts">
import { Avatar } from '@proj-airi/ui'

/** The round model avatar of the character of a conversation row, as the character switcher shows it. */
const props = defineProps<{
  /** The preview image of the default model of the character. Without it, the avatar shows a person icon. */
  src?: string
  compact: boolean
  /** Adds a check that marks the conversation of this window. */
  current: boolean
}>()
</script>

<template>
  <span :class="['relative shrink-0', props.compact ? 'size-7' : 'size-9']">
    <Avatar
      :src="props.src"
      :class="['block size-full rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-700', '[&_[data-avatar-image]]:object-top']"
    >
      <template #fallback>
        <span aria-hidden="true" :class="['i-mingcute:user-3-line', props.compact ? 'size-4' : 'size-5']" />
      </template>
    </Avatar>
    <span
      v-if="props.current"
      aria-hidden="true"
      :class="[
        'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full',
        'bg-primary-500 text-white ring-2 ring-primary-50 dark:ring-primary-950',
        props.compact ? 'size-3.5' : 'size-4',
      ]"
    >
      <span :class="['i-mingcute:check-fill size-2.5']" />
    </span>
  </span>
</template>
