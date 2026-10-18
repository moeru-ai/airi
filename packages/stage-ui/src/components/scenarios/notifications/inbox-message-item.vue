<script setup lang="ts">
import type { InboxMessageView } from './inbox-presentation'

defineProps<{
  message: InboxMessageView
  age: string
  /** `island` sits on the dark stage card. `drawer` follows the light or dark theme. */
  surface: 'island' | 'drawer'
}>()

const emit = defineEmits<{
  open: []
}>()
</script>

<template>
  <li :class="['relative']">
    <!-- Opening a message marks it read. A message has no actions of its own. -->
    <button
      type="button"
      :class="[
        'w-full flex flex-col gap-1 rounded-2xl px-4 py-3 text-left',
        'transition-colors duration-200 ease-in-out outline-none',
        'focus-visible:outline-2 focus-visible:outline-primary-400',
        surface === 'island'
          ? 'hover:bg-white/6'
          : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/70',
      ]"
      @click="emit('open')"
    >
      <span :class="['flex items-baseline gap-3']">
        <span
          :class="[
            'min-w-0 flex-1 truncate text-sm',
            message.unread ? 'font-semibold' : 'font-normal',
            surface === 'island' ? 'text-white' : 'text-neutral-900 dark:text-neutral-100',
          ]"
        >
          {{ message.title }}
        </span>
        <span
          :class="[
            'shrink-0 text-xs',
            surface === 'island' ? 'text-white/45' : 'text-neutral-400 dark:text-neutral-500',
          ]"
        >
          {{ age }}
        </span>
      </span>
      <span
        :class="[
          'line-clamp-2 text-xs leading-relaxed',
          surface === 'island' ? 'text-white/65' : 'text-neutral-500 dark:text-neutral-400',
        ]"
      >
        {{ message.body }}
      </span>
    </button>
    <span
      v-if="message.unread"
      aria-hidden="true"
      :class="['absolute left-1.5 top-[1.15rem] size-1.5 rounded-full bg-primary-400']"
    />
  </li>
</template>
