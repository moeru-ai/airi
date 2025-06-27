<script setup lang="ts">
import type { Emotion } from '@proj-airi/stage-ui/constants/emotions'

import { useQueue } from '@proj-airi/stage-ui/composables/queue'
import { useEmotionsMessageQueue } from '@proj-airi/stage-ui/composables/queues'
import { llmInferenceEndToken } from '@proj-airi/stage-ui/constants'
import { Textarea } from '@proj-airi/ui'
import { ref } from 'vue'

const messageInput = ref<string>('')
const messagesProcessed = ref<string[]>([])
const emotionsProcessed = ref<string[]>([])
const processing = ref<boolean>(false)

const emotionsQueue = useQueue<Emotion>({
  handlers: [
    async (ctx) => {
      emotionsProcessed.value.push(ctx.data)
    },
  ],
})

const emotionMessageContentQueue = useEmotionsMessageQueue(emotionsQueue)

function onSendMessage() {
  processing.value = true
  const tokens = messageInput.value.split('')
  for (const token of tokens)
    emotionMessageContentQueue.add(token)

  emotionMessageContentQueue.add(llmInferenceEndToken)
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
          Messages
        </h3>
        <div v-for="message in messagesProcessed" :key="message">
          <div>{{ message }}</div>
        </div>
      </div>
      <div w-full rounded-lg bg="neutral-100 dark:neutral-700" p-2>
        <h3 font-normal>
          Emotions
        </h3>
        <div v-for="message in emotionsProcessed" :key="message">
          <div>{{ message }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
