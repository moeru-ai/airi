<script setup lang="ts">
import { MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const chatHistoryRef = ref<HTMLDivElement>()

const { t } = useI18n()
const { messages, sending, streamingMessage, loadingInitialHistory, isLoadingHistory, hasMoreHistory } = storeToRefs(useChatStore())
const { onBeforeMessageComposed, onTokenLiteral, loadInitialHistory, loadMoreHistory } = useChatStore()


// Track if we're scrolled to top
const isScrolledToTop = ref(false)

// Only show load more when we have more history and are scrolled to top
const showLoadMore = computed(() => hasMoreHistory.value && isScrolledToTop.value)

// Handle scroll events
function handleScroll(event: Event) {
  const target = event.target as HTMLDivElement
  isScrolledToTop.value = target.scrollTop === 0
}

// Scroll to bottom
async function scrollToBottom() {
  await nextTick()
  if (chatHistoryRef.value) {
    chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
  }
}

onMounted(async () => {
  // Load initial chat history
  await loadInitialHistory(10)
  // Scroll to bottom after initial load
  await scrollToBottom()
})

onBeforeMessageComposed(async () => {
  // Scroll down to the new sent message
  await scrollToBottom()
})

onTokenLiteral(async () => {
  // Scroll down to the new responding message
  await scrollToBottom()
})

// Load more history without changing scroll position
async function handleLoadMore() {
  if (!chatHistoryRef.value)
    return

  // Store current scroll height and position
  const oldScrollHeight = chatHistoryRef.value.scrollHeight
  const oldScrollTop = chatHistoryRef.value.scrollTop

  // Load more history
  await loadMoreHistory()

  // After new content is loaded, adjust scroll position to maintain relative position
  await nextTick()
  if (chatHistoryRef.value) {
    const newScrollHeight = chatHistoryRef.value.scrollHeight
    const heightDiff = newScrollHeight - oldScrollHeight
    chatHistoryRef.value.scrollTop = oldScrollTop + heightDiff
  }
}
</script>

<template>
  <div py="<sm:2" flex="~ col" rounded="lg" relative overflow-hidden py-4>
    <!-- Load more button -->
    <div v-if="showLoadMore" class="load-more-container" p="x-4 y-2" flex="~ center">
      <div class="load-more-wrapper">
        <button
          v-if="!isLoadingHistory"
          class="load-more-btn"
          bg="primary-200/20 dark:primary-400/20"
          text="primary-500 hover:primary-600 dark:primary-300/50"
          p="x-6 y-2"
          rounded="full"
          transition="all duration-200"
          hover="bg-primary-300/20 dark:bg-primary-500/20"
          @click="handleLoadMore"
        >
          Load More History
        </button>
        <div v-else text="primary-300/50" animate-pulse>
          Loading...
        </div>
      </div>
    </div>

    <div flex-1 /> <!-- spacer -->
    <div ref="chatHistoryRef" v-auto-animate px="<sm:2" flex="~ col" h-full w-full overflow-scroll px-4 class="chat-history" @scroll="handleScroll">
      <div flex-1 /> <!-- spacer -->
      <div v-for="(message, index) in messages" :key="index" mb-2>
        <div v-if="message.role === 'error'" flex mr="12">
          <div
            flex="~ col" shadow="md violet-900/50 dark:none"
            min-w-20 rounded-lg px-2 py-1 h="unset <sm:fit"
            class="bg-violet-50/80 <md:bg-violet-500/25 dark:bg-violet-900/80"
          >
            <div flex="~ row" gap-2>
              <div flex-1>
                <span text-xs text="violet-400/90 dark:violet-600/90" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.core-system') }}</span>
              </div>
              <div i-solar:danger-triangle-bold-duotone text-violet-500 />
            </div>
            <div v-if="sending && index === messages.length - 1" i-eos-icons:three-dots-loading />
            <MarkdownRenderer
              v-else
              :content="message.content as string"
              class="break-words text-violet-500"
              text="base <sm:xs"
            />
          </div>
        </div>
        <div v-if="message.role === 'assistant'" flex mr="12">
          <div
            flex="~ col" shadow="sm primary-200/50 dark:none" min-w-20
            rounded-lg px-2 py-1 h="unset <sm:fit"
            class="bg-primary-50/80 <md:bg-primary-500/25 dark:bg-primary-900/80"
          >
            <div>
              <span text-xs text="primary-400/90 dark:primary-600/90" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.airi') }}</span>
            </div>
            <div v-if="message.content" class="break-words" text="primary-700 dark:primary-200">
              <div v-for="(slice, sliceIndex) in message.slices" :key="sliceIndex">
                <div v-if="slice.type === 'tool-call'">
                  <div
                    p="1" border="1 solid primary-200" rounded-lg m="y-1" bg="primary-100"
                  >
                    Called: <code>{{ slice.toolCall.toolName }}</code>
                  </div>
                </div>
                <div v-else-if="slice.type === 'tool-call-result'" /> <!-- this line should be unreachable -->
                <MarkdownRenderer
                  v-else
                  :content="slice.text"
                />
              </div>
            </div>
            <div v-else-if="index === messages.length - 1 && !message.content" i-eos-icons:three-dots-loading />
          </div>
        </div>
        <div v-else-if="message.role === 'user'" flex="~ row-reverse" ml="12">
          <div
            flex="~ col" shadow="sm cyan-200/50 dark:none" px="2"
            h="unset <sm:fit" min-w-20 rounded-lg px-2 py-1
            class="bg-cyan-50/80 <md:bg-cyan-500/25 dark:bg-cyan-900/80"
          >
            <div>
              <span text-xs text="cyan-400/90 dark:cyan-600/90" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.you') }}</span>
            </div>
            <MarkdownRenderer
              v-if="message.content"
              :content="message.content as string"
              class="break-words"
              text="base <sm:xs"
            />
            <div v-else />
          </div>
        </div>
      </div>
      <div v-if="sending" flex mr="12">
        <div
          flex="~ col" shadow="sm primary-200/50 dark:none" min-w-20
          rounded-lg px-2 py-1 h="unset <sm:fit"
          class="bg-primary-50/80 <md:bg-primary-500/25 dark:bg-primary-900/80"
        >
          <div>
            <span text-xs text="primary-400/90 dark:primary-600/90" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.airi') }}</span>
          </div>
          <div v-if="streamingMessage.content" class="break-words" text="primary-700 dark:primary-200">
            <div v-for="(slice, sliceIndex) in streamingMessage.slices" :key="sliceIndex">
              <div v-if="slice.type === 'tool-call'">
                <div
                  p="1" border="1 solid primary-200" rounded-lg m="y-1" bg="primary-100"
                >
                  Called: <code>{{ slice.toolCall.toolName }}</code>
                </div>
              </div>
              <div v-else-if="slice.type === 'tool-call-result'" /> <!-- this line should be unreachable -->
              <MarkdownRenderer
                v-else
                :content="slice.text"
              />
            </div>
          </div>
          <div v-else i-eos-icons:three-dots-loading />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.load-more-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  padding-top: 1rem;
}

.load-more-wrapper {
  width: fit-content;
  margin: 0 auto;
}

.load-more-btn {
  cursor: pointer;
  border: none;
  outline: none;
  font-size: 0.9em;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.chat-history {
  padding-top: 60px; /* Space for the load more button */
}
</style>
