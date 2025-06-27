<script setup lang="ts">
import { useDelayMessageQueue } from '@proj-airi/stage-ui/composables'
import { llmInferenceEndToken } from '@proj-airi/stage-ui/constants'
import { Textarea } from '@proj-airi/ui'
import { ref } from 'vue'

const messageInput = ref<string>('')
const emotionMessageContentProcessed = ref<string[]>([])
const delaysProcessed = ref<number[]>([])
const processing = ref<boolean>(false)

// const emotionMessageContentQueue = useQueue<string>({
//   handlers: [
//     async (ctx) => {
//       emotionMessageContentProcessed.value.push(ctx.data)
//     },
//   ],
// })

const delaysQueue = useDelayMessageQueue()
delaysQueue.onHandlerEvent('delay', (delay) => {
  delaysProcessed.value.push(delay)
})

function onSendMessage() {
  processing.value = true
  const tokens = messageInput.value.split('')
  for (const token of tokens)
    delaysQueue.add(token)

  delaysQueue.add(llmInferenceEndToken)
  messageInput.value = ''
  processing.value = false
}
</script>

<template>
  <div flex flex-col gap-2 p-2>
    <div flex flex-row gap-2>
      <Textarea
        v-model="messageInput"
        placeholder="Message"
        p="2" bg="neutral-100 dark:neutral-700"
        w-full rounded-lg outline-none
        @submit="onSendMessage"
      />
      <button rounded-lg bg="neutral-100 dark:neutral-700" p-4>
        {{ processing ? 'Processing...' : 'Send' }}
      </button>
    </div>
    <div w-full flex flex-row gap-4>
      <div w-full rounded-lg bg="neutral-100 dark:neutral-700" p-2>
        <h3 font-normal>
          Emotion Message
        </h3>
        <div v-for="message in emotionMessageContentProcessed" :key="message">
          <div>{{ message }}</div>
        </div>
      </div>
      <div w-full rounded-lg bg="neutral-100 dark:neutral-700" p-2>
        <h3 font-normal>
          Delays
        </h3>
        <div v-for="message in delaysProcessed" :key="message">
          <div>{{ message }}s</div>
        </div>
      </div>
    </div>
  </div>
</template>
