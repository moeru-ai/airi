<script setup lang="ts">
import { BasicTextarea } from '@proj-airi/stage-ui/components'
import { useQueue } from '@proj-airi/stage-ui/composables/queue'
import { useMessageContentQueue } from '@proj-airi/stage-ui/composables/queues'
import { llmInferenceEndToken } from '@proj-airi/stage-ui/constants'
import { ref } from 'vue'

const messageInput = ref<string>('')
const ttsProcessed = ref<string[]>([])
const processing = ref<boolean>(false)

// async function sleep(ms: number) {
//   return new Promise(resolve => setTimeout(resolve, ms))
// }

const ttsQueue = useQueue<string>({
  handlers: [
    async (ctx) => {
      ttsProcessed.value.push(ctx.data)
    },
  ],
})

const messageContentQueue = useMessageContentQueue(ttsQueue)

async function onSendMessage() {
  processing.value = true
  // const tokens = messageInput.value.split('')
  // for (const token of tokens) {
  // await sleep(100)
  // messageContentQueue.add(token)
  // }
  messageContentQueue.add(messageInput.value)

  messageContentQueue.add(llmInferenceEndToken)
  messageInput.value = ''
  processing.value = false
}
</script>

<template>
  <div flex flex-col gap-2 p-2>
    <div flex flex-row gap-2>
      <BasicTextarea
        v-model="messageInput"
        placeholder="Message"
        p="2" bg="zinc-100 dark:zinc-700"
        w-full rounded-lg outline-none
        @submit="onSendMessage"
      />
      <button rounded-lg bg="zinc-100 dark:zinc-700" p-4>
        {{ processing ? 'Processing...' : 'Send' }}
      </button>
    </div>
    <div w-full flex flex-row gap-4>
      <div w-full rounded-lg bg="zinc-100 dark:zinc-700" p-2>
        <h3 font-semibold>
          TTS Message
        </h3>
        <div v-for="message in ttsProcessed" :key="message">
          <div>{{ message }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
