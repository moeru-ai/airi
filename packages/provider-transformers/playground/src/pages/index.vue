<script setup lang="ts">
import type { InitiateProgressInfo, ProgressStatusInfo } from '@proj-airi/utils-transformers/types'

import { embed } from '@xsai/embed'
import { serialize } from 'superjson'
import { onMounted, ref } from 'vue'

import { createTransformers } from '../../../src'
import embedWorkerURL from '../../../src/worker?worker&url'
import Progress from '../components/Progress.vue'

const modelId = ref('Xenova/all-MiniLM-L6-v2')
const input = ref('Hello, world!')
const results = ref<any>()

const loadingItems = ref<(InitiateProgressInfo | ProgressStatusInfo)[]>([])
const loadingItemsSet = new Set<string>()

const transformersProvider = createTransformers({ embedWorkerURL })

onMounted(async () => {
  await load()
})

async function load() {
  await transformersProvider.loadEmbed(modelId.value, {
    onProgress: (progress) => {
      switch (progress.status) {
        case 'initiate':
          if (loadingItemsSet.has(progress.file)) {
            return
          }

          loadingItemsSet.add(progress.file)
          loadingItems.value.push(progress)
          break

        case 'progress':
          loadingItems.value = loadingItems.value.map((item) => {
            if (item.file === progress.file) {
              return { ...item, ...progress }
            }

            return item
          })

          break

        case 'done':
          // loadingItems.value = loadingItems.value.filter(item => item.file !== progress.file)
          break
      }
    },
  })
}

async function execute() {
  const result = await embed({
    ...transformersProvider.embed(modelId.value),
    input: input.value,
  })

  results.value = result
}

async function handleLoad() {
  await transformersProvider.terminateEmbed()
  await load()
}
</script>

<template>
  <div flex flex-col gap-2>
    <h2 text-xl>
      Options
    </h2>
    <div w-full flex flex-row gap-2>
      <div w-full flex flex-row gap-2>
        <label flex flex-1 flex-row items-center gap-2>
          <div text-nowrap><span>Model ID</span></div>
          <input v-model="modelId" bg="neutral-100 dark:neutral-800" block w-full rounded-lg p-2>
        </label>
        <button rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 @click="() => handleLoad()">
          Load
        </button>
      </div>
    </div>
    <div v-if="loadingItems.length > 0" class="w-full flex flex-col gap-2">
      <Progress
        v-for="(item, index) of loadingItems" :key="index" :text="item.file"
        :percentage="'progress' in item ? item.progress || 0 : 0" :total="'total' in item ? item.total || 0 : 0"
      />
    </div>
  </div>
  <div flex flex-col gap-2>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Inference
      </h2>
      <div>
        <textarea v-model="input" h-full w-full rounded-lg bg="neutral-100 dark:neutral-800" p-4 font-mono />
      </div>
      <div flex flex-row gap-2>
        <button rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 @click="execute">
          Extract
        </button>
      </div>
      <div flex flex-col gap-2>
        <h2 text-xl>
          Results
        </h2>
        <div max-h-100 of-y-scroll whitespace-pre-wrap p-4 font-mono>
          {{ JSON.stringify(serialize(results).json, null, 2) }}
        </div>
      </div>
    </div>
  </div>
</template>
