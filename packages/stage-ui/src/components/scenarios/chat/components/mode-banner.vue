<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/** Shows that a handover mode holds the conversation, and returns to the main conversation on request. */
defineProps<{
  /** The mode's recipe name. Without it, the banner leaves. */
  name?: string
}>()

const emit = defineEmits<{
  (e: 'end'): void
}>()

const { t } = useI18n()
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out motion-reduce:transition-none"
    enter-from-class="opacity-0 -translate-y-1 scale-98"
    leave-active-class="transition-all duration-200 ease-in motion-reduce:transition-none"
    leave-to-class="opacity-0 -translate-y-1"
  >
    <div
      v-if="name"
      role="status"
      :class="[
        'mx-2 my-1',
        'flex items-center gap-2',
        'rounded-xl px-3 py-1.5',
        'text-xs',
        'bg-gradient-to-r from-primary-200/80 to-primary-100/60 text-primary-800',
        'dark:from-primary-800/70 dark:to-primary-900/50 dark:text-primary-100',
      ]"
    >
      <span class="i-solar:mask-happly-bold-duotone shrink-0 text-base" aria-hidden="true" />
      <span class="shrink-0 op-75">{{ t('stage.chat.mode.current') }}</span>
      <span class="min-w-0 flex-1 truncate font-medium">{{ name }}</span>
      <button
        type="button"
        :class="[
          'shrink-0 rounded-full px-2 py-0.5',
          'transition-colors duration-200',
          'hover:bg-primary-300/60 dark:hover:bg-primary-700/60',
          'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
        @click="emit('end')"
      >
        {{ t('stage.chat.mode.end') }}
      </button>
    </div>
  </Transition>
</template>
