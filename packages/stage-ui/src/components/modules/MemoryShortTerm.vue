<script setup lang="ts">
import { useMemoryShortTermStore } from '@proj-airi/stage-ui/stores/modules/memory-short-term'
import { FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const memoryShortTermStore = useMemoryShortTermStore()
const { enabled, maxMessages, configured } = storeToRefs(memoryShortTermStore)

const maxMessagesString = computed({
  get: () => maxMessages.value.toString(),
  set: (value: string) => {
    const num = Number.parseInt(value, 10)
    if (!Number.isNaN(num)) {
      maxMessages.value = num
    }
  },
})
</script>

<template>
  <div :class="['flex', 'flex-col', 'gap-6']">
    <div :class="['text-2xl', 'font-bold']">
      {{ t('settings.pages.modules.memory-short-term.title') }}
    </div>

    <div :class="['text-sm', 'opacity-70']">
      {{ t('settings.pages.modules.memory-short-term.description') }}
    </div>

    <FieldCheckbox
      v-model="enabled"
      label="Enable Short-Term Memory"
      description="Store recent conversation context for immediate recall"
    />

    <FieldInput
      v-model="maxMessagesString"
      type="number"
      label="Maximum Messages"
      description="Number of recent messages to keep in short-term memory"
      placeholder="20"
    />

    <div v-if="configured" :class="['mt-4', 'rounded-lg', 'bg-green-100', 'dark:bg-green-900/30', 'p-4', 'text-green-800', 'dark:text-green-200']">
      Short-term memory is enabled and configured
    </div>
  </div>
</template>
