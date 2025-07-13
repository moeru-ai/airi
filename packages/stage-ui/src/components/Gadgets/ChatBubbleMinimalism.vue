<script setup lang="ts">
import { until } from '@vueuse/core'
import { createTimeline } from 'animejs'
import { nextTick, onMounted, ref } from 'vue'

import PoppinText from '../Widgets/PoppinText/PoppinText.web.vue'

import { createFadeAnimator } from '../Widgets/PoppinText/animators'

const props = withDefaults(
  defineProps<{
    containerClass?: string | string[]
    containerClassExtra?: string | string[]
    text?: string | ReadableStream
    textClass?: string | string[]
    side?: 'left' | 'right'
    loading?: boolean
  }>(),
  {
    side: 'right',
  },
)

const chatBubbleContainerRef = ref<HTMLDivElement>()
const chatBubbleRef = ref<HTMLDivElement>()

onMounted(async () => {
  await until(chatBubbleContainerRef).toBeTruthy()
  await until(chatBubbleRef).toBeTruthy()
  const containerWidth = chatBubbleContainerRef.value!.getBoundingClientRect().width

  createTimeline({ loop: false })
    .set(chatBubbleRef.value!, {
      width: 0,
      borderWidth: 0,
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      ease: 'outQuart',
      duration: 500,
    })
    .add(chatBubbleRef.value!, {
      width: [0, props.loading ? 'fit-content' : containerWidth],
      borderWidth: [0, 2],
      paddingLeft: [0, 12],
      paddingRight: [0, 12],
      paddingTop: [0, 12],
      paddingBottom: [0, 12],
      ease: 'outQuart',
      duration: 500,
    })
})

async function handleOnTextSplit(_: string) {
  // Scroll to bottom
  await nextTick()
  await scrollToBottom()
}

async function scrollToBottom() {
  if (chatBubbleRef.value) {
    const borderHeight = 4 + 1 // 4px from border-2 class (top and bottom), 1px mystery addition
    chatBubbleRef.value.style.maxHeight = `${chatBubbleRef.value.scrollHeight + borderHeight}px`
    await nextTick()
  }
}
</script>

<template>
  <div ref="chatBubbleContainerRef">
    <div
      ref="chatBubbleRef"
      transition="max-height,max-width,colors duration-500 ease-in-out"
      relative overflow-y-auto will-change-max-height will-change-max-width scrollbar-none
      :class="[
        props.side === 'left' ? 'rounded-tr-2xl rounded-br-2xl rounded-tl-2xl rounded-bl-sm' : 'rounded-tl-2xl rounded-bl-2xl rounded-tr-2xl rounded-br-sm',
        props.side === 'left' ? '' : 'float-right',
        ...(props.containerClass
          ? (typeof props.containerClass === 'string' ? [props.containerClass] : props.containerClass)
          : [
            'border-2 border-solid border-neutral-100 dark:border-neutral-900',
            'bg-white/90 backdrop-blur-md dark:bg-neutral-950/90',
            ...(props.containerClassExtra
              ? (typeof props.containerClassExtra === 'string' ? [props.containerClassExtra] : props.containerClassExtra)
              : []),
          ]),
      ]"
    >
      <div v-if="props.loading" i-svg-spinners:3-dots-scale />
      <PoppinText
        v-else
        min-h-0
        :text="props.text"
        :text-class="[...(typeof props.textClass === 'string' ? [props.textClass] : (props.textClass || [])), 'vertical-middle']"
        :animator="createFadeAnimator({ duration: 100 })"
        @text-split="handleOnTextSplit"
      />
    </div>
  </div>
</template>
