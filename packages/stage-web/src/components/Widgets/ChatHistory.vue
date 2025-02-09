<script setup lang="ts">
import { useMarkdown } from '@proj-airi/stage-ui/composables'
import { useChatStore } from '@proj-airi/stage-ui/stores'
import { useElementBounding, useScroll } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { nextTick, ref } from 'vue'

const chatHistoryRef = ref<HTMLDivElement>()

const { messages } = storeToRefs(useChatStore())
const bounding = useElementBounding(chatHistoryRef, { immediate: true, windowScroll: true, windowResize: true })
const { y: chatHistoryContainerY } = useScroll(chatHistoryRef)

const { process } = useMarkdown()
const { onBeforeMessageComposed, onTokenLiteral } = useChatStore()

onBeforeMessageComposed(async () => {
  // Scroll down to the new sent message
  nextTick().then(() => {
    bounding.update()
    chatHistoryContainerY.value = bounding.height.value
  })
})

onTokenLiteral(async () => {
  // Scroll down to the new responding message
  nextTick().then(() => {
    bounding.update()
    chatHistoryContainerY.value = bounding.height.value
  })
})
</script>

<template>
  <div
    relative px="<sm:2" py="<sm:2" flex="~ col" rounded="lg" overflow-hidden
  >
    <div flex-1 /> <!-- spacer -->
    <div ref="chatHistoryRef" v-auto-animate h-full w-full flex="~ col" overflow-scroll>
      <div flex-1 /> <!-- spacer -->
      <div v-for="(message, index) in messages" :key="index" mb-2>
        <div v-if="message.role === 'assistant'" flex mr="12">
          <div
            flex="~ col"
            border="4 solid pink-200/50 dark:pink-500/50"
            shadow="md pink-200/50 dark:none"
            min-w-20 rounded-lg px-2 py-1
            h="unset <sm:fit"
            bg="<md:pink-500/25"
          >
            <div>
              <span text-xs text="pink-400/90 dark:pink-600/90" font-semibold class="inline <sm:hidden">{{ $t('stage.chat.message.character-name.airi') }}</span>
            </div>
            <div v-if="message.content" class="markdown-content" text="base <sm:xs" v-html="process(message.content as string)" />
            <div v-else i-eos-icons:three-dots-loading />
          </div>
        </div>
        <div v-else-if="message.role === 'user'" flex="~ row-reverse" ml="12">
          <div
            flex="~ col"
            border="4 solid cyan-200/50 dark:cyan-500/50"
            shadow="md cyan-200/50 dark:none"
            px="2"
            h="unset <sm:fit" min-w-20 rounded-lg px-2 py-1
            bg="<md:cyan-500/25"
          >
            <div>
              <span text-xs text="cyan-400/90 dark:cyan-600/90" font-semibold class="inline <sm:hidden">{{ $t('stage.chat.message.character-name.you') }}</span>
            </div>
            <div v-if="message.content" class="markdown-content" text="base <sm:xs" v-html="process(message.content as string)" />
            <div v-else />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
