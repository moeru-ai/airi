<script setup lang="ts">
import { MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const chatHistoryRef = ref<HTMLDivElement>()

const { t } = useI18n()
const { messages, sending, streamingMessage, isLoadingHistory, hasMoreHistory } = storeToRefs(useChatStore())
const { onBeforeMessageComposed, onTokenLiteral, loadInitialHistory, loadMoreHistory } = useChatStore()

// Patch for eslint lintern
console.warn(!!sending, !!streamingMessage)

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

// --- HISTORY LOADING LOGIC ---
/**
 * Loads more history and adjusts the scroll position to maintain the user's view.
 * This function uses a robust "anchor" method to prevent scroll jiggle.
 */
async function handleLoadMore() {
  if (!chatHistoryRef.value || isLoadingHistory.value)
    return

  // 1. Get a reference to the very first message element before we load more
  const firstMessageElement = chatHistoryRef.value.children[0] as HTMLElement | null

  // 2. Load more history, which will prepend new messages
  await loadMoreHistory()

  // 3. Wait for the DOM to update with the new messages
  await nextTick()

  // 4. Find the "old" first message element's new position
  if (firstMessageElement) {
    const newScrollTop = firstMessageElement.offsetTop

    // 5. Adjust the scroll position directly to that element's new vertical offset.
    // This anchors the user's view to the same message they were looking at.
    chatHistoryRef.value.scrollTop = newScrollTop
  }
}
// --- END HISTORY LOADING LOGIC ---

onMounted(async () => {
  // Load initial chat history on component mount
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
</script>

<template>
  <div relative px="<sm:2" py="<sm:2" flex="~ col" rounded="lg" overflow-hidden>
    <!-- Load more button -->
    <div v-if="showLoadMore" class="load-more-container" p="x-4 y-2" flex="~ center">
      <div class="load-more-wrapper">
        <button
          v-if="!isLoadingHistory"
          class="load-more-btn"
          bg="neutral-800/80"
          text="neutral-200 hover:neutral-100"
          p="x-6 y-2"
          rounded="full"
          transition="all duration-200"
          hover="bg-neutral-700/80"
          @click="handleLoadMore"
        >
          Load More History
        </button>
        <div v-else text="primary-300/50" animate-pulse>
          Loading...
        </div>
      </div>
    </div>
    <div ref="chatHistoryRef" v-auto-animate max-h="35dvh" z-5 flex="~ col" h-full w-full overflow-scroll class="chat-history" @scroll="handleScroll">
      <div v-for="(message, index) in messages" :key="index" mb-2>
        <div v-if="message.role === 'error'" flex mr="12">
          <div
            flex="~ col"
            shadow="sm violet-200/50 dark:none"
            min-w-20 rounded-lg px-3 py-2
            h="unset <sm:fit"
            bg="violet-100 dark:violet-800"
            backdrop-blur-sm
          >
            <div flex="~ row" items-center justify-between gap-2>
              <div>
                <span text-xs text="violet-400/90 dark:violet-600/90" font-normal>{{ t('stage.chat.message.character-name.core-system') }}</span>
              </div>
              <div i-solar:danger-triangle-bold-duotone text-violet-500 />
            </div>
            <MarkdownRenderer
              v-if="message.content"
              :content="message.content as string"
              class="break-words"
              text="base <sm:xs"
            />
            <div v-else i-eos-icons:three-dots-loading />
          </div>
        </div>
        <div v-if="message.role === 'assistant'" flex mr="12">
          <div
            flex="~ col"
            shadow="sm primary-200/50 dark:none"
            min-w-20 rounded-lg px-3 py-2
            h="unset <sm:fit"
            backdrop-blur-md
            class="bg-primary-50 dark:bg-primary-900"
          >
            <div>
              <span text="primary-400/90 dark:primary-600/90" text-xs font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.airi') }}</span>
            </div>
            <MarkdownRenderer
              v-if="message.content"
              :content="message.content as string"
              class="break-words"
              text="base <sm:xs"
            />
            <div v-else i-eos-icons:three-dots-loading />
          </div>
        </div>
        <div v-else-if="message.role === 'user'" flex="~">
          <div
            flex="~ col"
            shadow="sm cyan-200/50 dark:none"
            px="2"
            h="unset <sm:fit" min-w-20 rounded-lg px-3 py-2
            bg="white dark:neutral-800"
            backdrop-blur-md
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
    </div>
  </div>
</template>

<style scoped>
/*
DO NOT ATTEMPT TO USE backdrop-filter TOGETHER WITH mask-image.

html - Why doesn't blur backdrop-filter work together with mask-image? - Stack Overflow
https://stackoverflow.com/questions/72780266/why-doesnt-blur-backdrop-filter-work-together-with-mask-image
*/
.chat-history {
  --gradient: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 20%);
  -webkit-mask-image: var(--gradient);
  mask-image: var(--gradient);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: bottom;
  mask-position: bottom;
  padding-top: 2.8rem; /* To prevent button overlap */
}

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
</style>
