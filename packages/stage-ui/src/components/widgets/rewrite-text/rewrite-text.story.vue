<script setup lang="ts">
import { Button } from '@proj-airi/ui'
import { onBeforeUnmount, shallowRef } from 'vue'

import PoppinText from '../poppin-text/PoppinText.web.vue'
import RewriteText from './rewrite-text.vue'

import { createBlurFadeAnimator } from '../poppin-text/animators'

const appear = createBlurFadeAnimator()

/** Chunks that a streaming speech recognizer emits for one sentence. */
const chunks = ['um so ', 'can you ', 'turn on the ', 'lite in the ', 'living room']
const transcript = shallowRef('')
let timer: ReturnType<typeof setInterval> | undefined

function speak() {
  clearInterval(timer)
  transcript.value = ''
  let index = 0
  timer = setInterval(() => {
    transcript.value += chunks[index] ?? ''
    index += 1
    if (index >= chunks.length)
      clearInterval(timer)
  }, 450)
}
onBeforeUnmount(() => clearInterval(timer))

const spoken = 'um so can you turn on the lite in the living room'
const rewritten = 'So, can you turn on the light in the living room?'
/** A new key mounts a new rewrite, so the animation plays again. */
const replay = shallowRef(0)
</script>

<template>
  <Story title="Rewrite Text" group="widgets" :layout="{ type: 'single', iframe: false }">
    <Variant id="live-transcript" title="Live transcript (blur fade)">
      <div :class="['flex flex-col items-start gap-4 p-4']">
        <Button label="Speak" @click="speak" />
        <p :class="['m-0 max-w-110 whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed', 'text-neutral-800 dark:text-neutral-100']">
          <PoppinText as="span" inline :text="[{ key: 'speech-0', text: transcript }]" :animator="appear" />
        </p>
      </div>
    </Variant>
    <Variant id="rewrite" title="Rewrite">
      <div :class="['flex flex-col items-start gap-4 p-4']">
        <Button label="Replay" @click="replay += 1" />
        <p :class="['m-0 max-w-110 whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed', 'text-neutral-800 dark:text-neutral-100']">
          <RewriteText :key="replay" :from="spoken" :to="rewritten" />
        </p>
      </div>
    </Variant>
  </Story>
</template>
