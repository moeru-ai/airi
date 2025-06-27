<script setup lang="ts">
import { sleep } from '@moeru/std'
import { Textarea } from '@proj-airi/ui'
import { ref } from 'vue'

const messageInput = ref<string>('')
const processing = ref<boolean>(false)
const streamingMessage = ref({ content: '' })

async function onSendMessage() {
  processing.value = true

  const tokens = messageInput.value.split('')

  enum States {
    Literal = 'literal',
    Special = 'special',
  }

  let state = States.Literal
  let buffer = ''

  for (const textPart of tokens) {
    await sleep(50)
    let newState: States = state

    if (textPart === '<')
      newState = States.Special
    else if (textPart === '>')
      newState = States.Literal

    if (state === States.Literal && newState === States.Special) {
      streamingMessage.value.content += buffer
      buffer = ''
    }

    if (state === States.Special && newState === States.Literal)
      buffer = '' // Clear buffer when exiting Special state

    if (state === States.Literal && newState === States.Literal) {
      streamingMessage.value.content += textPart
      buffer = ''
    }

    state = newState
  }

  if (buffer)
    streamingMessage.value.content += buffer

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
    <div w-full rounded-lg bg="neutral-100 dark:neutral-700" p-2>
      <h3 font-normal>
        Streaming Message
      </h3>
      <div>{{ streamingMessage.content }}</div>
    </div>
  </div>
</template>
