<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores'

import { Collapsable } from '@proj-airi/stage-ui/components'
import { useI18n } from 'vue-i18n'

interface Props {
  card: AiriCard
}

defineProps<Props>()
const { t } = useI18n()
</script>

<template>
  <Collapsable :default="true">
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
            {{ t('settings.pages.card.basic_info') }}
          </div>
        </div>
        <div transform transition="transform duration-250" :class="{ 'rotate-180': slotProps.visible }">
          <div i-solar:alt-arrow-down-bold-duotone />
        </div>
      </button>
    </template>

    <div flex="~ col" gap-5 p-4>
      <div>
        <label text="sm neutral-500" mb-2 block>
          {{ t('settings.pages.card.name') }}
        </label>
        <input
          v-model="card.name"
          class="input w-full"
          bg="neutral-50 dark:neutral-800"
          border="~ neutral-200 dark:neutral-700"
          rounded-lg px-4 py-2.5
        >
      </div>

      <div>
        <label text="sm neutral-500" mb-2 block>
          {{ t('settings.pages.card.description') }}
        </label>
        <textarea
          v-model="card.description"
          class="textarea w-full"
          bg="neutral-50 dark:neutral-800"
          border="~ neutral-200 dark:neutral-700"
          rounded-lg px-4 py-2.5
          rows="3"
        />
      </div>
    </div>
  </collapsable>
</template>
