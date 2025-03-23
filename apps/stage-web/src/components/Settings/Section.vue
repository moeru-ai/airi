<script setup lang="ts">
import { Collapsable } from '@proj-airi/stage-ui/components'

defineProps<{
  title: string
  icon: string
  innerClass?: string
}>()
</script>

<template>
  <Collapsable default>
    <template #trigger="slotProps">
      <button
        class="setting-bar"
        bg="zinc-100 dark:zinc-800"
        hover="bg-zinc-200 dark:bg-zinc-700"
        @click="slotProps.setVisible(!slotProps.visible)"
      >
        <div flex gap-1.5>
          <div :class="icon" size-6 />
          {{ $t(title) }}
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
