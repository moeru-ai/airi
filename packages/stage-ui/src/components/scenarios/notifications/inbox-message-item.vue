<script setup lang="ts">
import type { InboxMessageView } from './inbox-presentation'

defineProps<{
  message: InboxMessageView
  age: string
}>()

const emit = defineEmits<{
  open: []
}>()
</script>

<template>
  <li :class="['relative']">
    <!--
      Opening a message marks it read. A message has no actions of its own.
      This stays a plain button: BasicButton centers its content and scales on press,
      which suits a compact action but not a full-width, two-line list row.
    -->
    <button
      type="button"
      :class="[
        'w-full flex flex-col gap-1 rounded-2xl px-4 py-3 text-left',
        'transition-colors duration-200 ease-in-out outline-none',
        'hover:bg-neutral-200/60 dark:hover:bg-neutral-700/50',
        'focus-visible:outline-2 focus-visible:outline-primary-400',
      ]"
      @click="emit('open')"
    >
      <span :class="['flex items-baseline gap-3']">
        <span
          :class="[
            'min-w-0 flex-1 truncate text-sm text-neutral-900 dark:text-neutral-100',
            message.unread ? 'font-semibold' : 'font-normal',
          ]"
        >
          {{ message.title }}
        </span>
        <span :class="['shrink-0 text-xs text-neutral-400 dark:text-neutral-500']">
          {{ age }}
        </span>
      </span>
      <span :class="['line-clamp-2 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400']">
        {{ message.body }}
      </span>
    </button>
    <!-- The unread mark of a row. It uses the theme color like Badge, but stays smaller than the trigger dot, so it does not compete with the title. -->
    <span
      v-if="message.unread"
      aria-hidden="true"
      :class="['absolute left-1.5 top-[1.15rem] size-1.5 rounded-full bg-primary-400']"
    />
  </li>
</template>
