<script setup lang="ts">
import { useDark, useToggle } from '@vueuse/core'
import { embed } from '@xsai/embed'
import { serialize } from 'superjson'
import { onMounted, ref } from 'vue'

import { createTransformers } from '../../src'
import embedWorkerURL from '../../src/worker?worker&url'

const isDark = useDark()
const toggleDark = useToggle(isDark)

const modelId = ref('Xenova/all-MiniLM-L6-v2')
const input = ref('Hello, world!')
const results = ref<any>()

const transformersProvider = createTransformers({ embedWorkerURL })

onMounted(async () => {
  await transformersProvider.loadEmbed(modelId.value)
})

async function execute() {
  const result = await embed({
    ...transformersProvider.embed(modelId.value),
    model: modelId.value,
    input: input.value,
  })

  results.value = result
}
</script>

<template>
  <div flex flex-col gap-2 p-4>
    <header flex flex-row items-center justify-between>
      <h1 text-2xl>
        <a href="https://huggingface.co/docs/transformers.js/index">🤗 Transformers.js</a> + <a
          href="https://github.com/moeru-ai/xsai"
        >xsai</a> Playground
      </h1>
      <button text-lg @click="() => toggleDark()">
        <div v-if="isDark" i-solar:moon-stars-bold-duotone />
        <div v-else i-solar:sun-bold />
      </button>
    </header>
    <div flex flex-col gap-2>
      <h2 text-xl>
        Options
      </h2>
      <div w-full flex flex-row gap-2>
        <div w-full flex flex-row gap-2>
          <label flex flex-row items-center gap-2>
            <div text-nowrap><span>Model ID</span></div>
            <input v-model="modelId" bg="neutral-100 dark:neutral-800" block min-w-full w-full rounded-lg p-2>
          </label>
        </div>
      </div>
    </div>
    <div grid grid-cols-2 gap-2>
      <div flex flex-col gap-2>
        <h2 text-xl>
          Inference
        </h2>
        <div>
          <textarea v-model="input" h-full w-full rounded-lg bg="neutral-100 dark:neutral-800" p-4 font-mono />
        </div>
        <div flex flex-row gap-2>
          <button rounded-lg bg="blue-100 dark:blue-900" px-4 py-2 @click="execute">
            Execute
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
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  overscroll-behavior: none;
}

html {
  background: #fff;
  transition: all 0.3s ease-in-out;
}

html.dark {
  background: #121212;
  color-scheme: dark;
}
</style>
