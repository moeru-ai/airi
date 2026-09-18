<script setup lang="ts">
import type { ChatToolCallRendererRegistry } from '@proj-airi/stage-ui/components'
import type { ChatHistoryReplyPayload } from '@proj-airi/stage-ui/components/scenarios/chat'
import type { ChatSendPayload } from '@proj-airi/stage-ui/stores/chat'
import type { ChatToolCallRerunEvent } from '@proj-airi/stage-ui/stores/tool-call-rerun'
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { useStopSpeakingButton } from '@proj-airi/stage-layouts/composables/useStopSpeakingButton'
import { ChatHistory, JournalPreviewModal } from '@proj-airi/stage-ui/components'
import { ChatReplyPreview, useChatComposer, VoiceComposer } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useJournalPreviewStore } from '@proj-airi/stage-ui/stores/journal-preview'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { BasicTextarea, GhostButton } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import ChatImageAttachmentPreview from './chat-image-attachment-preview.vue'
import JournalToolCallBlock from './chat-tool-renderers/journal-tool-call-block.vue'
import ChatViewportLayout from './chat-viewport-layout.vue'

import { useHearingInputChannel } from '../composables/use-hearing-input-channel'
import { artistryToolReferences, computerUseToolReferences, widgetToolReferences } from '../stores/tools'

const router = useRouter()
const messageComposer = useTemplateRef<HTMLDivElement>('message-composer')
const lastEnterTime = ref(0)
// Each request captures this composer selection, including retries and tool reruns.
const computerUseEnabled = ref(true)

const chatStore = useChatStore()
const chatSession = useChatSessionStore()
const chatStream = useChatStreamStore()
const backgroundStore = useBackgroundStore()
const journalPreviewStore = useJournalPreviewStore()
const airiCardStore = useAiriCardStore()

const { activeSessionId, messages } = storeToRefs(chatSession)
const { streamingMessage } = storeToRefs(chatStream)
const { activeSendSessionId, activeStreamingMessage, sending } = storeToRefs(chatStore)
const { activeCard, activeCardId } = storeToRefs(airiCardStore)

type ChatImageAttachment = Extract<NonNullable<ChatSendPayload['attachments']>[number], { type: 'image' }>

interface ImageComposerAttachment extends ChatImageAttachment {
  file: File
  previewId: string
}

const voiceActive = ref(false)
const voiceInput = useTemplateRef<HTMLElement>('voiceInput')
const composer = useChatComposer<ImageComposerAttachment>({
  activeSessionId,
  send: submission => chatStore.send({
    sessionId: submission.sessionId,
    text: submission.text,
    replyToMessageId: submission.replyToMessageId,
    attachments: submission.attachments.map(attachment => ({
      type: attachment.type,
      data: attachment.data,
      mimeType: attachment.mimeType,
    })),
    tools: computerUseEnabled.value ? [...artistryToolReferences, ...computerUseToolReferences] : artistryToolReferences,
  }),
})
const {
  addAttachments,
  attachments,
  clearReplyForMessage,
  draft: messageInput,
  isComposing,
  removeAttachment,
  replyTarget,
  selectReply,
} = composer
useHearingInputChannel(messageInput)
const { t } = useI18n()
const { openImagePreview } = journalPreviewStore
const DOUBLE_ENTER_INTERVAL_MS = 300
const TRAILING_NEWLINES_REGEX = /[\r\n]+$/
const SEND_MODES = ['enter', 'ctrl-enter', 'double-enter'] as const
type SendMode = (typeof SEND_MODES)[number]
const sendMode = useLocalStorage<SendMode>('ui/chat/settings/send-mode', 'enter')
const toolCallRenderers = {
  image_journal: JournalToolCallBlock,
  text_journal: JournalToolCallBlock,
} satisfies ChatToolCallRendererRegistry
const sendModeLabels = computed<Record<SendMode, string>>(() => ({
  'enter': t('stage.send-mode.enter'),
  'ctrl-enter': t('stage.send-mode.ctrl-enter'),
  'double-enter': t('stage.send-mode.double-enter'),
}))
const {
  trackChatMessageDeleted,
  trackChatMessageRetried,
} = useAnalytics()
const { showStopSpeakingButton, stopSpeakingFromChat } = useStopSpeakingButton()

const latestImageEntries = computed(() => {
  if (!activeCardId.value)
    return []
  return backgroundStore.journalEntries.slice(0, 3)
})

function navigateToImageJournal() {
  if (!activeCardId.value)
    return
  router.push(`/settings/airi-card?cardId=${activeCardId.value}&tab=gallery`)
}

async function handleSend() {
  await composer.submit()
}

function sendFromKeyboard() {
  messageInput.value = messageInput.value.replace(TRAILING_NEWLINES_REGEX, '')
  void handleSend()
}

const fileInput = ref<HTMLInputElement | null>(null)

function handleManualAttach() {
  fileInput.value?.click()
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files?.length) {
    handleFilePaste(Array.from(target.files))
  }
}

function handleMessageInputKeydown(event: KeyboardEvent) {
  if (isComposing.value || event.key !== 'Enter')
    return

  const hasControl = event.ctrlKey || event.metaKey
  const hasShift = event.shiftKey

  switch (sendMode.value) {
    case 'enter':
      if (!hasShift && !hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'ctrl-enter':
      if (hasControl) {
        event.preventDefault()
        sendFromKeyboard()
      }
      return
    case 'double-enter':
      if (!hasShift && !hasControl) {
        const now = Date.now()
        if (now - lastEnterTime.value < DOUBLE_ENTER_INTERVAL_MS) {
          event.preventDefault()
          sendFromKeyboard()
          lastEnterTime.value = 0
        }
        else {
          lastEnterTime.value = now
        }
      }
  }
}

async function handleFilePaste(files: File[]) {
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64Data = (e.target?.result as string)?.split(',')[1]
        if (base64Data) {
          addAttachments({
            type: 'image',
            data: base64Data,
            mimeType: file.type,
            file,
            previewId: crypto.randomUUID(),
          })
        }
      }
      reader.readAsDataURL(file)
    }
  }
}

watch(sendMode, () => {
  lastEnterTime.value = 0
})

const historyMessages = computed(() => messages.value as unknown as ChatHistoryItem[])
const assistantLabel = computed(() => activeCard.value?.name?.trim() || undefined)
const isActiveSessionSending = computed(() => sending.value && activeSendSessionId.value === activeSessionId.value)
const visibleStreamingMessage = computed(() => activeSendSessionId.value === activeSessionId.value
  ? activeStreamingMessage.value
  : streamingMessage.value)

async function handleDeleteMessage(payload: { message: ChatHistoryItem, index: number }) {
  const { index, message } = payload
  await chatSession.deleteMessage({
    sessionId: chatSession.activeSessionId,
    index,
  })
  trackChatMessageDeleted({
    source: 'history',
    message_role: message?.role ?? 'unknown',
  })
  clearReplyForMessage(message)
}

async function handleReplyMessage(payload: ChatHistoryReplyPayload) {
  selectReply(payload)
  await nextTick()
  messageComposer.value?.querySelector('textarea')?.focus()
}

async function handleCancelReply() {
  composer.clearReply()
  await nextTick()
  messageComposer.value?.querySelector('textarea')?.focus()
}

onMounted(() => {
  backgroundStore.initializeStore()
})

async function handleRetryMessage(index: number) {
  await chatStore.retry({
    sessionId: chatSession.activeSessionId,
    index,
    tools: computerUseEnabled.value ? [...widgetToolReferences, ...computerUseToolReferences] : widgetToolReferences,
  })
  trackChatMessageRetried({
    source: 'history',
  })
}

/**
 * Triggering workflow: {@link ChatHistory} `toolCallRerun` -> handleToolCallRerun
 * -> chatStore.rerunToolCall for the selected invocation in this message.
 */
async function handleToolCallRerun(payload: ChatToolCallRerunEvent) {
  await chatStore.rerunToolCall({
    sessionId: chatSession.activeSessionId,
    messageId: payload.message.id,
    index: payload.index,
    toolCallId: payload.toolCallId,
    invocationId: payload.invocationId,
    toolName: payload.toolName,
    args: payload.args,
    tools: computerUseEnabled.value ? computerUseToolReferences : [],
  })
}
</script>

<template>
  <ChatViewportLayout>
    <template #history="{ tailInset }">
      <ChatHistory
        :messages="historyMessages"
        :assistant-label="assistantLabel"
        :sending="isActiveSessionSending"
        :streaming-message="visibleStreamingMessage"
        :tail-inset="tailInset"
        :tool-call-renderers="toolCallRenderers"
        @delete-message="handleDeleteMessage"
        @reply-message="handleReplyMessage"
        @retry-message="handleRetryMessage($event.index)"
        @tool-call-rerun="handleToolCallRerun"
      />
    </template>

    <template #composer>
      <div
        ref="message-composer"
        :class="[
          'min-h-0 max-h-full flex flex-col gap-1 overflow-hidden',
        ]"
      >
        <div
          data-testid="chat-composer-previews"
          :class="[
            'min-h-0 overflow-y-auto scrollbar-none',
          ]"
        >
          <!-- Journal Preview Chips -->
          <div v-if="latestImageEntries.length > 0" class="flex gap-2 overflow-x-auto px-2 py-1 scrollbar-none">
            <div
              v-for="entry in latestImageEntries"
              :key="entry.id"
              :class="[
                'group relative h-14 w-14 shrink-0 cursor-pointer of-hidden rounded-lg',
                'border border-primary-200/30 transition-all hover:border-primary-500',
                'dark:border-primary-800/30 dark:hover:border-primary-400',
              ]"
              @click="openImagePreview(entry)"
            >
              <img :src="entry.url || ''" class="h-full w-full object-cover">
              <div :class="['absolute inset-0 flex items-end p-1', 'bg-gradient-to-t from-black/60 to-transparent']">
                <span class="truncate text-[8px] text-white font-medium">{{ entry.title }}</span>
              </div>

              <!-- Save Button (Top Right, Hover Only) -->
              <button
                :class="[
                  'absolute right-1 top-1 z-10 p-1 rounded-md bg-black/40 text-white backdrop-blur-sm',
                  'opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60',
                ]"
                title="Save to computer"
                @click.stop="journalPreviewStore.downloadImage(entry.url || '', entry.title)"
              >
                <div class="i-solar:download-minimalistic-bold-duotone text-[10px]" />
              </button>
            </div>
          </div>
          <div
            v-if="attachments.length > 0"
            :class="[
              'flex flex-nowrap gap-2 overflow-x-auto border-t border-primary-100 p-2 scrollbar-none',
            ]"
          >
            <ChatImageAttachmentPreview
              v-for="(attachment, index) in attachments"
              :key="attachment.previewId"
              :file="attachment.file"
              @remove="removeAttachment(index)"
            />
          </div>
        </div>
        <div :class="['flex shrink-0 items-center justify-end gap-2 py-1']">
          <GhostButton
            data-testid="computer-use-toggle"
            size="unset"
            :class="['h-9 gap-2 px-2 text-xs']"
            :aria-label="t('stage.computer-use.label')"
            :title="t('stage.computer-use.description')"
            :active="computerUseEnabled"
            :aria-pressed="computerUseEnabled"
            :disabled="isActiveSessionSending"
            @click="computerUseEnabled = !computerUseEnabled"
          >
            <span :class="['i-solar:monitor-bold-duotone h-5 w-5 shrink-0']" />
            <span>{{ t('stage.computer-use.label') }}</span>
          </GhostButton>
          <DropdownMenuRoot>
            <DropdownMenuTrigger as-child>
              <GhostButton
                size="unset"
                :class="['h-9 w-9']"
                :title="t('stage.send-mode.title')"
                :aria-label="t('stage.send-mode.title')"
              >
                <span :class="['i-solar:keyboard-bold-duotone h-5 w-5']" />
              </GhostButton>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent
                align="end"
                side="top"
                :side-offset="8"
                :class="[
                  'z-50 min-w-[180px] rounded-xl p-1 shadow',
                  'bg-white dark:bg-neutral-800',
                  'flex flex-col gap-1',
                  'data-[side=top]:animate-slideDownAndFade',
                  'data-[side=left]:animate-none',
                  'data-[side=bottom]:animate-none',
                  'data-[side=right]:animate-none',
                ]"
              >
                <DropdownMenuItem
                  v-for="mode in SEND_MODES"
                  :key="mode"
                  :class="[
                    'w-full flex cursor-pointer items-center rounded-md px-3 py-2 text-left text-xs outline-none transition-colors',
                    'hover:bg-primary-50 dark:hover:bg-primary-900/20',
                    sendMode === mode ? 'bg-primary-50 text-primary-600 font-semibold dark:bg-primary-900/20 dark:text-primary-300' : 'text-neutral-500',
                  ]"
                  @select="sendMode = mode"
                >
                  <div class="mr-2 h-4 w-4 flex shrink-0 items-center justify-center">
                    <div v-if="sendMode === mode" class="i-ph:check-bold text-base" />
                  </div>
                  <span>{{ sendModeLabels[mode] }}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenuRoot>

          <GhostButton
            v-if="showStopSpeakingButton"
            size="unset"
            :class="['h-9 w-9']"
            data-testid="stop-speaking-button"
            title="Stop speaking"
            aria-label="Stop speaking"
            @click="stopSpeakingFromChat"
          >
            <span :class="['i-solar:stop-circle-bold-duotone h-5 w-5']" />
          </GhostButton>

          <GhostButton
            size="unset"
            :class="['h-9 w-9']"
            title="Image Journal"
            aria-label="Image Journal"
            @click="navigateToImageJournal"
          >
            <span :class="['i-solar:gallery-bold-duotone h-5 w-5']" />
          </GhostButton>

          <GhostButton
            size="unset"
            :class="['h-9 w-9']"
            title="Attach Image"
            aria-label="Attach Image"
            @click="handleManualAttach"
          >
            <span :class="['i-solar:camera-add-bold-duotone h-5 w-5']" />
          </GhostButton>
          <input
            ref="fileInput"
            type="file"
            accept="image/*"
            class="hidden"
            multiple
            @change="handleFileSelect"
          >
        </div>
        <div
          ref="voiceInput"
          :class="[
            'relative w-full shrink-0 overflow-hidden rounded-xl border-2 border-solid',
            'border-primary-200/20 bg-primary-100/50 backdrop-blur-md',
            'dark:border-primary-400/20 dark:bg-primary-900/70',
          ]"
        >
          <ChatReplyPreview
            :class="[voiceActive && 'invisible']"
            :target="replyTarget"
            @cancel="handleCancelReply"
          />
          <BasicTextarea
            v-model="messageInput"
            :submit-on-enter="false"
            :placeholder="t('stage.message')"
            :class="['ph-no-capture [scrollbar-gutter:stable] pr-14', voiceActive && 'invisible']"
            text="primary-600 dark:primary-100  placeholder:primary-500 dark:placeholder:primary-200"
            bg="transparent"
            max-h="[10lh]" min-h="14"
            w-full resize-none overflow-y-auto border-2 border-transparent border-solid p-2 font-medium outline-none
            transition="all duration-250 ease-in-out placeholder:all placeholder:duration-250 placeholder:ease-in-out"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"
            @keydown="handleMessageInputKeydown"
            @paste-file="handleFilePaste"
          />
          <div :class="['absolute bottom-2 right-2']">
            <VoiceComposer
              v-model="messageInput"
              :input-element="voiceInput"
              :session-id="activeSessionId"
              :reply-to-message-id="replyTarget?.message.id"
              :tools="artistryToolReferences"
              @recording-change="voiceActive = $event"
              @sent="composer.clearReply()"
            />
          </div>
        </div>
      </div>
    </template>
  </ChatViewportLayout>

  <!-- Shared Preview Modal -->
  <JournalPreviewModal />
</template>
