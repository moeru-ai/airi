<script setup lang="ts">
import type { Component } from '../../../stores/resources'

import { Progress } from '@proj-airi/stage-ui/components'

const props = defineProps<{
  component: Component
}>()
</script>

<template>
  <div flex flex-col gap-2>
    <div
      v-for="file in Array.from(props.component.files.values())"
      :key="file.filename"
      max-w-full flex flex-col gap="1 sm:2"
    >
      <div grid="~ cols-[85%_15%]" justify-between text="xs sm:sm neutral-600 dark:neutral-400">
        <div flex items-center gap-1>
          <div v-if="file.progress < 100" i-svg-spinners:pulse-ring />
          <div v-else i-solar:check-circle-bold-duotone text="green-600 dark:green-400" />
          <div inline-block flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-nowrap font-mono>
            {{ file.filename }}
          </div>
        </div>
        <div text-right>
          {{ file.progress.toFixed(2) }}%
        </div>
      </div>
      <Progress
        :progress="file.progress"
        bar-class="bg-primary-300 dark:bg-primary-300/50"
      />
    </div>
  </div>
</template>
