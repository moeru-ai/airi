<script setup lang="ts">
import type { ProgressInfo } from '../../../stores/resources'

import { computed } from 'vue'

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
  <div
    left="0" fixed top-0 m-3 rounded-xl p-3
    shadow-md bg="white/80 dark:neutral-900/80"
    backdrop-blur="md"
    w="[calc(100%-1.5rem)]"
    space-y-3
  >
    <div>
      <div flex items-center gap-2>
        <div i-solar:danger-triangle-bold-duotone text="orange" />
        <div>
          Some modules are not available yet...
        </div>
      </div>
      <ul ml-4 mt-3>
        <li>
          <RouterLink to="/settings/modules/hearing">
            <div flex items-center gap-1>
              <div flex items-center gap-1>
                <div i-solar:microphone-3-bold-duotone />
                <span decoration-underline decoration-dashed>Hearing</span>
              </div>
              <div text="neutral-500 dark:neutral-400">
                due to loading inference models...
              </div>
            </div>
          </RouterLink>
        </li>
      </ul>
    </div>
    <div flex items-center gap-2>
      <div v-if="totalProgress < 100" i-svg-spinners:pulse-ring />
      <div v-else i-solar:check-circle-bold />
      <div>
        Preparing external resources...
      </div>
    </div>
    <div w-full flex flex-col gap-2>
      <div
        v-for="file in Array.from(progressInfo.values())"
        :key="file.value.filename"
        max-w-full flex flex-col gap="1 sm:2"
      >
        <div flex justify-between text="xs sm:sm neutral-500 dark:neutral-400">
          <div flex items-center gap-1>
            <div v-if="file.value.progress < 100" i-svg-spinners:pulse-ring />
            <div v-else i-solar:check-circle-bold text="green-600 dark:green-400" />
            <div>
              {{ file.value.filename }}
            </div>
            <div>
              <div :style="{ width: `${file.value.progress}%` }" />
            </div>
          </div>
          <div>{{ file.value.progress.toFixed(2) }}%</div>
        </div>
        <div relative>
          <div
            bg="primary-300 dark:primary-400"
            absolute h-4 rounded-md will-change-width
            :style="{ width: `${file.value.progress}%` }"
            transition="width duration-500 ease-in-out"
          />
          <div
            bg="neutral-100 dark:neutral-900" h-4 w-full rounded-md
          />
        </div>
      </div>
    </div>
  </div>
</template>
