<script setup lang="ts">
import { storeToRefs } from 'pinia'

import { ref } from 'vue'
import Avatar from '../../assets/live2d/models/hiyori_free_zh/avatar.png'
import { useMarkdown } from '../../composables/markdown'
import { useSpeakingStore } from '../../stores/audio'
import { useChatStore } from '../../stores/chat'

const chatHistoryRef = ref<HTMLDivElement>()

const { messages } = storeToRefs(useChatStore())
const bounding = useElementBounding(chatHistoryRef, { immediate: true, windowScroll: true, windowResize: true })
const { y: chatHistoryContainerY } = useScroll(chatHistoryRef)

const { process } = useMarkdown()
const { nowSpeakingAvatarBorderOpacity } = storeToRefs(useSpeakingStore())
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
    relative
    class="<lg:(absolute bottom-0 from-zinc-100/80 to-zinc-800/0 bg-gradient-to-t p-2 dark:from-zinc-800/80)"
    px="<sm:2" py="<sm:2" w="50% <lg:full" flex="~ col 1"
    rounded="lg" max-h="[80vh]"
    overflow-hidden
  >
    <div ref="chatHistoryRef" h-full w-full overflow-scroll>
      <div v-for="(message, index) in messages" :key="index" mb-2>
        <div v-if="message.role === 'assistant'" flex mr="12">
          <div
            class="block <sm:hidden"
            mr-2 h-10
            min-h-10 min-w-10 w-10
            overflow-hidden rounded-full
            border="solid 3"
            transition="all ease-in-out" duration-100
            :style="{
              borderColor: `rgba(236, 72, 153, ${nowSpeakingAvatarBorderOpacity.toFixed(2)})`,
            }"
          >
            <img :src="Avatar">
          </div>
          <div
            flex="~ col"
            bg="pink-50 dark:pink-900"
            border="2 solid pink dark:pink-700"
            min-w-20 rounded-lg px-2 py-1
            h="unset <sm:fit"
          >
            <div>
              <span text-xs text="black/50 dark:white/50" font-semibold class="inline <sm:hidden">Airi</span>
            </div>
            <div v-if="message.content" class="markdown-content" text="base <sm:xs" v-html="process(message.content as string)" />
            <div v-else i-eos-icons:three-dots-loading />
          </div>
        </div>
        <div v-else-if="message.role === 'user'" flex="~ row-reverse" ml="12">
          <div
            class="block <sm:hidden"
            border="purple solid 3"
            ml="2"
            h-10 min-h-10 min-w-10 w-10
            overflow-hidden rounded-full
          >
            <div i-carbon:user-avatar-filled text="purple" h-full w-full p="0" m="0" />
          </div>
          <div
            flex="~ col"
            bg="purple-50 dark:purple-900"
            px="2"
            border="2 solid purple dark:purple-700"
            h="unset <sm:fit" min-w-20 rounded-lg px-2 py-1
          >
            <div>
              <span text-xs text="black/50 dark:white/50" font-semibold class="inline <sm:hidden">You</span>
            </div>
            <div v-if="message.content" class="markdown-content" text="base <sm:xs" whitespace-nowrap v-html="process(message.content as string)" />
            <div v-else />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
