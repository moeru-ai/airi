<script setup lang="ts">
import { Collapsable, MarkdownRenderer } from '@proj-airi/stage-ui/components'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const chatHistoryRef = ref<HTMLDivElement>()

const { t } = useI18n()
const { messages, sending, streamingMessage } = storeToRefs(useChatStore())

const { onBeforeMessageComposed, onTokenLiteral } = useChatStore()

// Presentation channel: show assistant text only when corresponding TTS segment starts
type PresentEvent
  = | { type: 'assistant-reset' }
    | { type: 'assistant-append', text: string }
const { data: presentEvent } = useBroadcastChannel<PresentEvent, PresentEvent>({ name: 'airi-chat-present' })
const presentSlices = ref<string[]>([])

watch(presentEvent, (ev) => {
  if (!ev)
    return
  if (ev.type === 'assistant-reset') {
    presentSlices.value = []
  }
  else if (ev.type === 'assistant-append') {
    presentSlices.value.push(ev.text)
  }
})

function scrollToBottom() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!chatHistoryRef.value)
        return

      chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
    })
  })
}

onBeforeMessageComposed(async () => {
  // Scroll down to the new sent message
  await scrollToBottom()
})

onTokenLiteral(async () => {
  // Scroll down to the new responding message
  await scrollToBottom()
})

watch(sending, () => {
  scrollToBottom()
}, { flush: 'post' })
</script>

<template>
  <div ref="chatHistoryRef" v-auto-animate flex="~ col" relative h-full w-full overflow-y-auto rounded-xl px="<sm:2" py="<sm:2">
    <div v-for="(message, index) in messages" :key="index" mb-2>
      <div v-if="message.role === 'error'" flex mr="12">
        <div
          flex="~ col" shadow="sm violet-200/50 dark:none"
          min-w-20 rounded-xl px-3 py-3 h="unset <sm:fit"
          class="bg-violet-100/80 dark:bg-violet-950/80"
        >
          <div flex="~ row" gap-2>
            <div flex-1 class="inline <sm:hidden">
              <span text-sm text="black/60 dark:white/65" font-normal>{{ t('stage.chat.message.character-name.core-system') }}</span>
            </div>
            <div i-solar:danger-triangle-bold-duotone text-violet-500 />
          </div>
          <div v-if="sending && index === messages.length - 1" i-eos-icons:three-dots-loading />
          <MarkdownRenderer
            v-else
            :content="message.content as string"
            class="break-words text-violet-500 dark:text-violet-300"
          />
        </div>
      </div>
      <div v-if="message.role === 'assistant'" flex mr="12">
        <div
          flex="~ col" shadow="sm primary-200/50 dark:none"
          min-w-20 rounded-xl px-3 py-3 h="unset <sm:fit"
          class="bg-primary-50/80 dark:bg-primary-950/80"
        >
          <div>
            <span text-sm text="black/60 dark:white/65" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.airi') }}</span>
          </div>
          <div v-if="message.content" class="break-words" text="primary-700 dark:primary-100">
            <div v-for="(slice, sliceIndex) in message.slices" :key="sliceIndex">
              <div v-if="slice.type === 'tool-call'" mb-2>
                <Collapsable
                  :class="[
                    'bg-primary-100/40 dark:bg-primary-900/60 rounded-lg px-2 pb-2 pt-2',
                    'flex flex-col gap-2 items-start',
                  ]"
                >
                  <template #trigger="{ visible, setVisible }">
                    <button
                      :class="[
                        'w-full', 'text-start',
                      ]"
                      @click="setVisible(!visible)"
                    >
                      <div i-solar:sledgehammer-bold-duotone class="mr-1 inline-block translate-y-1 op-50" /><code>{{ slice.toolCall.toolName }}</code>
                    </button>
                  </template>
                  <div
                    :class="[
                      'rounded-md', 'p-2', 'w-full',
                      'bg-neutral-100/80 text-sm text-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-200',
                    ]"
                  >
                    <div class="whitespace-pre-wrap break-words font-mono">
                      {{ JSON.stringify(JSON.parse(slice.toolCall.args), null, 2).trim() }}
                    </div>
                  </div>
                </Collapsable>
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
          flex="~ col" shadow="sm neutral-200/50 dark:none" px="2" h="unset <sm:fit"
          min-w-20 rounded-xl px-3 py-3
          class="bg-neutral-100/80 dark:bg-neutral-800/80"
        >
          <div>
            <span text-sm text="black/60 dark:white/65" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.you') }}</span>
          </div>
          <MarkdownRenderer
            v-if="message.content"
            :content="message.content as string"
            class="break-words"
          />
          <div v-else />
        </div>
      </div>
    </div>
    <div v-if="sending" flex mr="12">
      <div
        flex="~ col" shadow="sm primary-200/50 dark:none"
        min-w-20 rounded-xl px-3 py-3 h="unset <sm:fit"
        class="bg-primary-50/80 dark:bg-primary-950/80"
      >
        <div>
          <span text-sm text="black/60 dark:white/65" font-normal class="inline <sm:hidden">{{ t('stage.chat.message.character-name.airi') }}</span>
        </div>
        <div v-if="presentSlices.length > 0 || streamingMessage.content" class="break-words" text="primary-700 dark:primary-100">
          <!-- Prefer presentation slices if available; fallback to normal streaming -->
          <template v-if="presentSlices.length > 0">
            <div v-for="(text, idx) in presentSlices" :key="`present-${idx}`">
              <MarkdownRenderer :content="text" />
            </div>
          </template>
          <template v-else>
            <div v-for="(slice, sliceIndex) in streamingMessage.slices" :key="sliceIndex">
              <div v-if="slice.type === 'tool-call'" mb-2>
                <Collapsable
                  :class="[
                    'bg-primary-100/40 dark:bg-primary-900/60 rounded-lg px-2 pb-2 pt-2',
                    'flex flex-col gap-2 items-start',
                  ]"
                >
                  <template #trigger="{ visible, setVisible }">
                    <button
                      :class="[
                        'w-full', 'text-start',
                      ]"
                      @click="setVisible(!visible)"
                    >
                      <div i-solar:sledgehammer-bold-duotone class="mr-1 inline-block translate-y-1 op-50" /><code>{{ slice.toolCall.toolName }}</code>
                    </button>
                  </template>
                  <div
                    :class="[
                      'rounded-md', 'p-2', 'w-full',
                      'bg-neutral-100/80 text-sm text-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-200',
                    ]"
                  >
                    <div class="whitespace-pre-wrap break-words font-mono">
                      {{ JSON.stringify(JSON.parse(slice.toolCall.args), null, 2).trim() }}
                    </div>
                  </div>
                </Collapsable>
              </div>
              <div v-else-if="slice.type === 'tool-call-result'" />
              <MarkdownRenderer v-else :content="slice.text" />
            </div>
          </template>
        </div>
        <div v-else i-eos-icons:three-dots-loading />
      </div>
    </div>
  </div>
</template>
