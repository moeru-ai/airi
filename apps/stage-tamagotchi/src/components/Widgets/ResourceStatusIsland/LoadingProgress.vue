<script setup lang="ts">
import type { Ref } from 'vue'

import { onMounted, ref } from 'vue'

interface ProgressInfoItem {
  filename: string
  progress: number
  currentSize: number
  totalSize: number
}

interface ProgressInfo {
  files: Ref<ProgressInfoItem>[]
  totalProgress: number
}

const progressInfo = ref<ProgressInfo>({
  files: [],
  totalProgress: 0,
})

const simulatingProgressFiles = [
  { filename: 'model.safetensors', totalSize: 1000000 },
  { filename: 'config.json', totalSize: 500000 },
  { filename: 'metadata.json', totalSize: 200000 },
]

function simulateProgressForItem(totalSize: number, item: Ref<ProgressInfoItem>) {
  const interval = setInterval(() => {
    if (item.value.progress >= 100) {
      item.value.progress = 100
      clearInterval(interval)
      return
    }

    item.value.currentSize += 8192
    item.value.progress = (item.value.currentSize / totalSize) * 100
  }, 100)
}

function simulateProgress() {
  for (const file of simulatingProgressFiles) {
    const item = ref<ProgressInfoItem>({
      filename: file.filename,
      progress: 0,
      currentSize: 0,
      totalSize: file.totalSize,
    })

    progressInfo.value.files.push(item)
    simulateProgressForItem(file.totalSize, item)

    const interval = setInterval(() => {
      const totalProgress = progressInfo.value.files.reduce((acc, file) => acc + file.value.progress, 0) / progressInfo.value.files.length
      progressInfo.value.totalProgress = totalProgress

      if (totalProgress >= 100) {
        clearInterval(interval)
      }
    }, 100)
  }
}

onMounted(() => {
  // Simulate progress for demonstration purposes
  simulateProgress()
})
</script>

<template>
  <div
    left="0" fixed top-0 m-3 rounded-xl p-3
    shadow-md bg="white/80 dark:neutral-900/80"
    backdrop-blur="md"
    w="[calc(100%-1.5rem)]"
  >
    <div mb-3 flex items-center gap-2>
      <div v-if="progressInfo.totalProgress < 100" i-svg-spinners:pulse-ring />
      <div v-else i-solar:check-circle-bold />
      <div>
        Preparing external resources...
      </div>
    </div>
    <div w-full flex flex-col gap-2>
      <div
        v-for="file in progressInfo.files"
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
