<script setup lang="ts">
import { useMemoryShortTermStore } from '@proj-airi/stage-ui/stores/modules/memory-short-term'
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const memoryShortTermStore = useMemoryShortTermStore()
const { enabled, maxMessages, configured } = storeToRefs(memoryShortTermStore)
</script>

<template>
  <div :class="['flex','flex-col','gap-6']">
    <div :class="['text-2xl','font-bold']">
      {{ t('settings.pages.modules.memory-short-term.title') }}
    </div>

    <div :class="['text-sm','opacity-70']">
      {{ t('settings.pages.modules.memory-short-term.description') }}
    </div>

    <FieldCheckbox
      v-model="enabled"
      label="Enable Short-Term Memory"
      description="Store recent conversation context for immediate recall"
    />

    <FieldInput
      v-model.number="maxMessages"
      type="number"
      label="Maximum Messages"
      description="Number of recent messages to keep in short-term memory"
      placeholder="20"
      :min="1"
      :max="100"
    />

    <div v-if="configured" :class="['mt-4','rounded-lg','bg-green-100','dark:bg-green-900/30','p-4','text-green-800','dark:text-green-200']">
      Short-term memory is enabled and configured
    </div>
  </div>
</template>
