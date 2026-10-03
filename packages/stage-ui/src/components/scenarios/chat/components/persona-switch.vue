<script setup lang="ts">
import { useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAiriCardStore } from '../../../../stores/modules/airi-card'

/** How long the switch notice stays. */
const VISIBLE_MS = 2_500

const { t } = useI18n()
const { activeCardId, activeCard } = storeToRefs(useAiriCardStore())

// A persona switch moves the chat to that persona's own session. The notice tells the owner who speaks now.
const shownName = ref<string>()
const { start } = useTimeoutFn(() => {
  shownName.value = undefined
}, VISIBLE_MS, { immediate: false })

watch(activeCardId, (next, previous) => {
  if (!previous || next === previous)
    return
  shownName.value = activeCard.value?.name ?? next
  start()
})
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out motion-reduce:transition-none"
    enter-from-class="opacity-0 translate-y-1 scale-98"
    leave-active-class="transition-all duration-300 ease-in motion-reduce:transition-none"
    leave-to-class="opacity-0"
  >
    <div
      v-if="shownName"
      role="status"
      :class="[
        'mx-2 my-1',
        'flex items-center gap-2',
        'rounded-xl px-3 py-1.5',
        'text-xs',
        'bg-gradient-to-r from-complementary-200/80 to-primary-100/60 text-primary-800',
        'dark:from-complementary-800/60 dark:to-primary-900/50 dark:text-primary-100',
      ]"
    >
      <span class="i-solar:users-group-two-rounded-bold-duotone shrink-0 text-base" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate">{{ t('stage.chat.persona-switched', { name: shownName }) }}</span>
    </div>
  </Transition>
</template>
