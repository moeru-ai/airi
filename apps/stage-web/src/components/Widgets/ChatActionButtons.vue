<script setup lang="ts">
import { BackgroundPickerDialog } from '@proj-airi/stage-ui/components'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useBackgroundStore } from '../../stores/background'

const { cleanupMessages } = useChatStore()
const { isDark, toggleDark } = useTheme()

const backgroundDialogOpen = ref(false)
const backgroundStore = useBackgroundStore()
const { options: backgroundOptions } = storeToRefs(backgroundStore)
</script>

<template>
  <BackgroundPickerDialog
    v-model="backgroundDialogOpen"
    :options="backgroundOptions"
    @apply="backgroundStore.applyPickerSelection"
    @remove="option => backgroundStore.removeOption(option.id)"
  />
  <div absolute bottom--8 right-0 flex gap-2>
    <button
      class="max-h-[10lh] min-h-[1lh]"
      bg="neutral-100 dark:neutral-800"
      text="lg neutral-500 dark:neutral-400"
      hover:text="red-500 dark:red-400"
      flex items-center justify-center rounded-md p-2 outline-none
      transition-colors transition-transform active:scale-95
      @click="cleanupMessages()"
    >
      <div class="i-solar:trash-bin-2-bold-duotone" />
    </button>

    <button
      class="max-h-[10lh] min-h-[1lh]"
      bg="neutral-100 dark:neutral-800"
      text="lg neutral-500 dark:neutral-400"
      flex items-center justify-center rounded-md p-2 outline-none
      transition-colors transition-transform active:scale-95
      @click="() => toggleDark()"
    >
      <Transition name="fade" mode="out-in">
        <div v-if="isDark" i-solar:moon-bold />
        <div v-else i-solar:sun-2-bold />
      </Transition>
    </button>
    <button
      class="max-h-[10lh] min-h-[1lh]"
      bg="neutral-100 dark:neutral-800"
      text="lg neutral-500 dark:neutral-400"
      flex items-center justify-center rounded-md p-2 outline-none
      transition-colors transition-transform active:scale-95
      title="Background"
      @click="backgroundDialogOpen = true"
    >
      <div i-solar:gallery-wide-bold-duotone />
    </button>
  </div>
</template>
