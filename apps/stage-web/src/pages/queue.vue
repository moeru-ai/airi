<script setup lang="ts">
import { sleep } from '@moeru/std'
import { useQueue } from '@proj-airi/stage-ui/composables/queue'
import { onMounted, ref } from 'vue'

const temp = ref<string>('')

const audioQueue = useQueue<string>({
  handlers: [
    async (text) => {
      // eslint-disable-next-line no-console
      console.log('ready to play speech audio for', text)
    },
  ],
})
const ttsQueue = useQueue<string>({
  handlers: [
    async (ctx) => {
      // eslint-disable-next-line no-console
      console.log('ready to stream speech audio for', ctx)
      audioQueue.add(ctx.data)
    },
  ],
})
const textQueue = useQueue<string>({
  handlers: [
    async (ctx) => {
      const endMarker = ['.', '?', '!']

      let newEndPartDiscovered = false

      for (const marker of endMarker) {
        if (!ctx.data.includes(marker))
          continue

        // find the end of the sentence and push it to the queue with temp
        const periodIndex = ctx.data.indexOf(marker)
        // split
        const beforePeriod = ctx.data.slice(0, periodIndex + 1)
        const afterPeriod = ctx.data.slice(periodIndex + 1)

        temp.value += beforePeriod
        ttsQueue.add(temp.value.trim())
        temp.value = afterPeriod

        newEndPartDiscovered = true
      }

      if (!newEndPartDiscovered)
        temp.value += ctx.data
    },
  ],
})

const textParts = [
  'Hello',
  ' N',
  'eko',
  '! I',
  ' am',
  ' an',
  ' AI',
  ' assistant',
  ' trained',
  ' to',
  ' help',
  ' with',
  ' a',
  ' variety',
  ' of',
  ' tasks',
  ' such',
  ' as',
  ' answering',
  ' questions',
  ',',
  ' providing',
  ' information',
  ',',
  ' giving',
  ' recommendations',
  ',',
  ' and',
  ' more',
  '. How',
  ' can',
  ' I',
  ' assist',
  ' you',
  ' today',
  '?',
  'Hello',
  ' N',
  'eko',
  ',',
  ' I',
  ' am',
  ' an',
  ' AI',
  ' assistant',
  '.',
  ' I',
  ' can',
  ' help',
  ' answer',
  ' questions',
  ',',
  ' provide',
  ' information',
  ',',
  ' assist',
  ' with',
  ' tasks',
  ',',
  ' and',
  ' engage',
  ' in',
  ' conversation',
  '.',
  ' How',
  ' can',
  ' I',
  ' assist',
  ' you',
  ' today',
  '?',
]

async function mockTextPartsStreamHandler() {
  for (const part of textParts) {
    await sleep(100)
    textQueue.add(part)
  }
}

async function handler() {
  mockTextPartsStreamHandler()
}

onMounted(() => {
  handler()
})
</script>

<template>
  <div>
    <div />
  </div>
</template>
