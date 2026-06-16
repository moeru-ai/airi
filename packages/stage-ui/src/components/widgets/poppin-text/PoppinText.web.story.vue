<script setup lang="ts">
import { FieldRange } from '@proj-airi/ui'
import { ref } from 'vue'

import PoppinText from './PoppinText.web.vue'

import {
  createCutePopupAnimator,
  createFadeAnimator,
  createFloatAnimator,
  createPopupAnimator,
  createStackAnimator,
} from './animators'

const text = ref('行こう、七色のキラキラドキドキに向かって！')
const duration = ref(750)

function createStream(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(text)
      let index = 0
      const interval = setInterval(
        () => {
          if (index < bytes.length) {
            controller.enqueue(bytes.subarray(index, index + 1))
            index += 1
          } else {
            clearInterval(interval)
            controller.close()
          }
        },
        50 + 100 * Math.random(),
      )
    },
  })
}

const textStream = createStream('行こう、七色のキラキラドキドキに向かって！')
const emojiStream = createStream('🧑‍🧒🤾‍♀️🚵👨‍🚀👩‍🚀')
const mixedLanguageStream = createStream('g̈각நிกำषिक्षि')
</script>

<template>
  <Story title="Poppin'Text" group="widgets" :layout="{ type: 'grid', width: '100%' }">
    <template #controls>
      <div px-2>
        <FieldRange v-model.number="duration" :min="50" :max="3000" :step="50" label="Duration" />
      </div>
    </template>

    <Variant id="fade" title="Fade">
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="createFadeAnimator({ duration })" font-m-plus-rounded text-2xl font-bold />
      </div>
    </Variant>

    <Variant id="stream" title="Stream">
      <div h-auto w-full p-4>
        <PoppinText
          :text="textStream"
          :animator="createFloatAnimator({ duration })"
          font-m-plus-rounded
          text-2xl
          font-bold
        />
      </div>
    </Variant>

    <Variant id="emoji-stream" title="Emoji stream">
      <div h-auto w-full p-4>
        <PoppinText
          :text="emojiStream"
          :animator="createFloatAnimator({ duration })"
          font-m-plus-rounded
          text-2xl
          font-bold
        />
      </div>
    </Variant>

    <Variant id="mixed-language-stream" title="Mixed language stream">
      <div h-auto w-full p-4>
        <PoppinText :text="mixedLanguageStream" :animator="createFloatAnimator({ duration })" />
      </div>
    </Variant>

    <Variant id="popup" title="Popup">
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="createPopupAnimator({ duration })" />
      </div>
    </Variant>

    <Variant id="cute-popup" title="Cute Popup">
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="createCutePopupAnimator({ duration })" />
      </div>
    </Variant>

    <Variant id="float" title="Float">
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="createFloatAnimator({ duration })" />
      </div>
    </Variant>

    <Variant id="stack" title="Stack">
      <div h-auto w-full p-4>
        <PoppinText :text="text" :animator="createStackAnimator({ duration })" />
      </div>
    </Variant>
  </Story>
</template>
