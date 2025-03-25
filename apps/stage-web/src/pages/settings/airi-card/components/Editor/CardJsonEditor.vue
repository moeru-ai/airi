<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { Collapsable } from '@proj-airi/stage-ui/components'
import { useI18n } from 'vue-i18n'

interface Props {
  card: AiriCard
}

interface Emits {
  (e: 'update:card', card: AiriCard): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const { t } = useI18n()

function copyToClipboard() {
  const jsonStr = JSON.stringify(props.card, null, 2)
  navigator.clipboard.writeText(jsonStr)
}

function formatJson() {
  try {
    const jsonStr = JSON.stringify(props.card, null, 2)
    const formattedCard = JSON.parse(jsonStr)
    emit('update:card', formattedCard)
  }
  catch (err) {
    console.error('JSON formatting error:', err)
  }
}

function handleJsonEdit(e: Event) {
  try {
    const target = e.target as HTMLTextAreaElement
    if (target?.value !== undefined) {
      const updatedCard = JSON.parse(target.value)
      emit('update:card', updatedCard)
    }
  }
  catch (err) {
    console.error('JSON parsing error:', err)
  }
}
</script>

<template>
  <Collapsable>
    <template #trigger="slotProps">
      <button
        bg="zinc-100 dark:zinc-800"
        hover="bg-zinc-200 dark:bg-zinc-700"
        transition="all ease-in-out duration-250"
        w-full flex items-center gap-1.5 rounded-lg px-4 py-3 outline-none
        class="[&_.provider-icon]:grayscale-100 [&_.provider-icon]:hover:grayscale-0"
        @click="slotProps.setVisible(!slotProps.visible)"
      >
        <div flex="~ row 1" items-center gap-1.5>
          <div
            i-solar:face-scan-circle-bold-duotone class="provider-icon size-6"
            transition="filter duration-250 ease-in-out"
          />
          <div>
            {{ t('settings.pages.card.advanced_edit') }}
          </div>
        </div>
        <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
          <div i-solar:alt-arrow-down-bold-duotone />
        </div>
      </button>
    </template>

    <div flex="~ col" gap-5 p-4>
      <div flex="~ row" mb-3 items-center justify-between>
        <span text="sm neutral-500">
          Advanced users can directly edit the JSON configuration
        </span>
        <div flex="~ row" gap-2>
          <button
            bg="neutral-100 dark:neutral-800"
            hover="bg-neutral-200 dark:neutral-700"
            flex="~ row" items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition
            @click="copyToClipboard"
          >
            <div i-solar:copy-linear text-sm />
            Copy
          </button>
          <button
            bg="neutral-100 dark:neutral-800"
            hover="bg-neutral-200 dark:neutral-700"
            flex="~ row" items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition
            @click="formatJson"
          >
            <div i-solar:refresh-circle-linear text-sm />
            Format
          </button>
        </div>
      </div>

      <div
        border="~ neutral-200 dark:neutral-700"
        rounded-lg
        overflow="hidden"
      >
        <div
          bg="neutral-100 dark:neutral-800"
          border-b="~ neutral-200 dark:neutral-700"
          flex="~ row"
          items-center gap-2 px-4 py-2
        >
          <div i-solar:code-linear text="neutral-500" text-sm />
          <span text="sm neutral-500">JSON Editor</span>
        </div>
        <textarea
          :value="JSON.stringify(card, null, 2)"
          class="textarea w-full font-mono"
          bg="neutral-50 dark:neutral-900"
          border="none"
          rows="15"
          text="xs"
          px-4 py-3
          @input="handleJsonEdit"
        />
      </div>
    </div>
  </Collapsable>
</template>
