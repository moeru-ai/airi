<script setup lang="ts">
import type { ProgressInfo } from '../../../stores/resources'

import { Progress } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'

import WindowRouterLink from '../../Tauri/WindowRouterLink.vue'

const props = defineProps<{
  progressInfo: ProgressInfo
}>()

const totalProgress = computed(() => {
  return Array.from(
    props.progressInfo.values(),
  ).reduce((acc, file) => acc + file.value.progress, 0) / props.progressInfo.size
})
</script>

<template>
  <div flex flex-col gap-3>
    <div>
      <div flex items-center gap-2 text="sm orange-600 dark:orange-400">
        <div i-solar:danger-triangle-bold-duotone />
        <div>
          Some modules haven't been available yet...
        </div>
      </div>
      <ul ml-4 mt-3>
        <li>
          <WindowRouterLink to="/settings/modules/hearing" label="settings">
            <div flex items-center gap-1>
              <div flex items-center gap-1>
                <div i-solar:microphone-3-bold-duotone text="neutral-500 dark:neutral-400" />
                <span decoration-underline decoration-dashed>Hearing</span>
              </div>
              <div text="neutral-500 dark:neutral-400">
                due to loading inference models...
              </div>
            </div>
          </WindowRouterLink>
        </li>
      </ul>
    </div>
    <div flex items-center gap-2 text-sm>
      <div v-if="totalProgress < 100" i-svg-spinners:pulse-ring />
      <div v-else i-solar:check-circle-bold-duotone text="neutral-500 dark:neutral-400" />
      <div>
        Preparing external resources...
      </div>
    </div>
    <div v-if="Array(props.progressInfo.values()).length > 0" w-full flex flex-col gap-2>
      <div
        v-for="file in Array.from(progressInfo.values())"
        :key="file.value.filename"
        max-w-full flex flex-col gap="1 sm:2"
      >
        <div flex justify-between text="xs sm:sm neutral-600 dark:neutral-400">
          <div flex items-center gap-1>
            <div v-if="file.value.progress < 100" i-svg-spinners:pulse-ring />
            <div v-else i-solar:check-circle-bold-duotone text="green-600 dark:green-400" />
            <div>
              {{ file.value.filename }}
            </div>
            <div>
              <div :style="{ width: `${file.value.progress}%` }" />
            </div>
          </div>
          <div>{{ file.value.progress.toFixed(2) }}%</div>
        </div>
        <Progress
          :progress="file.value.progress"
          bar-class="bg-primary-300 dark:bg-primary-300/50"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-shine-animation {
  animation: progress-shine 2s linear infinite;
  will-change: transform, opacity;
}

@keyframes progress-shine {
  0% {
    opacity: 0.4;
    transform: scale(0, 1);
  }
  100% {
    opacity: 0;
    transform: scale(1, 1);
  }
}
</style>
