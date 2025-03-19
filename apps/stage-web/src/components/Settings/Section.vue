<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'
import { useI18n } from 'vue-i18n'

defineProps<{
  title: string
  icon: string
  innerClass?: string
}>()

const { t } = useI18n()
</script>

<template>
  <Collapsable default>
    <template #trigger="slotProps">
      <button
        bg="zinc-100 dark:zinc-800"
        hover="bg-zinc-200 dark:bg-zinc-700"
        transition="all ease-in-out duration-250"
        w-full flex items-center justify-between rounded-lg px-4 py-3 outline-none
        @click="slotProps.setVisible(!slotProps.visible)"
      >
        <div flex gap-1.5>
          <div :class="icon" size-6 />
          {{ t(title) }}
        </div>
        <div
          i-solar:alt-arrow-down-bold-duotone
          transition="transform duration-250"
          :class="{ 'rotate-180': slotProps.visible }"
        />
      </button>
    </template>
    <div grid gap-4 p-4 :class="innerClass">
      <slot />
    </div>
  </Collapsable>
</template>
