<script setup lang="ts">
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useMediaQuery } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, ref } from 'vue'

interface SessionPreview {
  id: string
  title: string
  updatedAt?: number
  messageCount: number
}

const chatSession = useChatSessionStore()
const { activeSessionId } = storeToRefs(chatSession)
const dialogOpen = ref(false)
const isMobile = useMediaQuery('(max-width: 768px)')
const pendingDeleteId = ref<string | null>(null)

function normalizeContent(content: string | any[] | undefined) {
  if (!content)
    return ''
  if (typeof content === 'string')
    return content
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string')
        return part
      if (part.type === 'text')
        return part.text
      return `[${part.type}]`
    }).join(' ')
  }
  return ''
}

function getLastNonSystemMessage(messages: ChatHistoryItem[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message && message.role !== 'system')
      return message
  }
  return messages.at(-1)
}

function formatTimestamp(timestamp?: number) {
  if (!timestamp)
    return ''
  return new Intl.DateTimeFormat('default', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

const sessions = computed<SessionPreview[]>(() => {
  const allSessions = chatSession.getAllSessions()

  return Object.entries(allSessions)
    .map(([sessionId, messages]) => {
      const lastMessage = getLastNonSystemMessage(messages)
      const updatedAt = lastMessage?.createdAt
      const storedTitle = chatSession.getSessionTitle(sessionId)

      let title = storedTitle
      if (!title) {
        if (sessionId === 'default') {
          title = 'Default'
        }
        else {
          const firstUserMessage = messages.find(m => m.role === 'user')
          title = firstUserMessage ? normalizeContent(firstUserMessage.content).trim() : 'Untitled session'
        }
      }

      // Truncate title if it's too long
      const truncatedTitle = title.length > 60 ? `${title.slice(0, 60)}...` : title

      return {
        id: sessionId,
        title: truncatedTitle,
        updatedAt,
        messageCount: messages.length,
      }
    })
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
})

function handleNewSession() {
  chatSession.createNewSession()
  dialogOpen.value = false
}

function handleSwitch(sessionId: string) {
  chatSession.setActiveSession(sessionId)
  dialogOpen.value = false
}

function requestDelete(sessionId: string) {
  if (sessionId === 'default')
    return
  pendingDeleteId.value = sessionId
}

function cancelDelete() {
  pendingDeleteId.value = null
}

function confirmDelete(sessionId: string) {
  if (sessionId === 'default') {
    pendingDeleteId.value = null
    return
  }

  if (activeSessionId.value === sessionId) {
    const nextSessionId = sessions.value.find(item => item.id !== sessionId)?.id ?? 'default'
    chatSession.setActiveSession(nextSessionId)
  }

  chatSession.deleteSession(sessionId)
  pendingDeleteId.value = null
}
</script>

<template>
  <div :class="['w-full', 'px-2', 'pt-2', 'pb-1', 'flex', 'items-center', 'justify-start']">
    <button
      type="button"
      :class="[
        'flex',
        'items-center',
        'gap-2',
        'rounded-lg',
        'border',
        'border-solid',
        'border-primary-200/40',
        'dark:border-primary-400/30',
        'bg-primary-50/70',
        'dark:bg-primary-950/70',
        'px-3',
        'py-2',
        'text-xs',
        'font-semibold',
        'text-primary-600',
        'dark:text-primary-200',
      ]"
      title="Switch sessions"
      @click="dialogOpen = true"
    >
      <div i-solar:layers-minimalistic-bold-duotone size-4 />
      <span>Sessions</span>
    </button>
  </div>

  <DialogRoot v-model:open="dialogOpen">
    <DialogPortal>
      <DialogOverlay
        :class="[
          'fixed',
          'inset-0',
          'z-[9999]',
          'bg-black/50',
          'backdrop-blur-sm',
          'data-[state=closed]:animate-fadeOut',
          'data-[state=open]:animate-fadeIn',
        ]"
      />
      <DialogContent
        :class="[
          'fixed',
          'z-[9999]',
          'flex',
          'flex-col',
          'gap-4',
          'overflow-hidden',
          'bg-white',
          'shadow-xl',
          'outline-none',
          'backdrop-blur-md',
          'data-[state=closed]:animate-contentHide',
          'data-[state=open]:animate-contentShow',
          'dark:bg-neutral-900',
          isMobile
            ? [
              'left-0',
              'right-0',
              'bottom-0',
              'max-h-[85vh]',
              'rounded-t-2xl',
              'p-5',
              'data-[state=closed]:slide-out-to-bottom',
              'data-[state=open]:slide-in-from-bottom',
            ]
            : [
              'left-1/2',
              'top-1/2',
              'max-h-[85vh]',
              'w-[92vw]',
              'max-w-md',
              'rounded-2xl',
              'p-5',
              '-translate-x-1/2',
              '-translate-y-1/2',
            ],
        ]"
      >
        <DialogTitle :class="['text-sm', 'font-semibold', 'text-neutral-900', 'dark:text-neutral-100']">
          Switch session
        </DialogTitle>

        <div :class="['flex', 'flex-col', 'gap-2']">
          <button
            type="button"
            :class="[
              'flex',
              'items-center',
              'justify-center',
              'gap-2',
              'rounded-lg',
              'border',
              'border-dashed',
              'border-primary-300/70',
              'dark:border-primary-400/40',
              'bg-primary-50/70',
              'dark:bg-primary-950/70',
              'px-3',
              'py-2',
              'text-xs',
              'font-semibold',
              'text-primary-600',
              'dark:text-primary-200',
            ]"
            @click="handleNewSession"
          >
            <div i-solar:add-square-linear size-4 />
            <span>New session</span>
          </button>

          <div :class="['flex', 'flex-col', 'gap-2', 'max-h-[55vh]', 'overflow-y-auto', 'pr-1']">
            <div
              v-for="session in sessions"
              :key="session.id"
              :class="[
                'w-full',
                'rounded-lg',
                'border',
                'border-solid',
                activeSessionId === session.id
                  ? 'border-primary-500/60 bg-primary-100/70 dark:border-primary-300/60 dark:bg-primary-900/60'
                  : 'border-primary-200/30 bg-white/60 dark:border-primary-400/20 dark:bg-black/30',
                'px-3',
                'py-2',
                'text-left',
                'backdrop-blur-sm',
                'cursor-pointer',
              ]"
              role="button"
              tabindex="0"
              @click="handleSwitch(session.id)"
              @keydown.enter.prevent="handleSwitch(session.id)"
              @keydown.space.prevent="handleSwitch(session.id)"
            >
              <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                <div :class="['flex-1', 'min-w-0']">
                  <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
                    <span :class="['text-xs', 'font-semibold', 'text-primary-600', 'dark:text-primary-200', 'truncate']">
                      {{ session.title }}
                    </span>
                    <span :class="['shrink-0', 'text-[0.65rem]', 'text-neutral-500', 'dark:text-neutral-400']">
                      {{ formatTimestamp(session.updatedAt) }}
                    </span>
                  </div>
                  <div :class="['mt-0.5', 'text-[0.6rem]', 'text-neutral-400', 'dark:text-neutral-500']">
                    {{ session.messageCount }} messages
                  </div>
                </div>
                <button
                  type="button"
                  :disabled="session.id === 'default'"
                  :class="[
                    'shrink-0',
                    'rounded-md',
                    'border',
                    'border-solid',
                    'border-transparent',
                    'p-1.5',
                    'text-neutral-400',
                    'transition-colors',
                    'hover:text-red-500',
                    'hover:bg-red-50/50',
                    'dark:text-neutral-500',
                    'dark:hover:text-red-400',
                    'dark:hover:bg-red-950/20',
                    session.id === 'default'
                      ? 'cursor-not-allowed opacity-40'
                      : 'cursor-pointer',
                  ]"
                  :title="session.id === 'default' ? 'Default session cannot be deleted' : 'Delete session'"
                  @click.stop="requestDelete(session.id)"
                >
                  <div i-solar:trash-bin-minimalistic-outline size-4 />
                </button>
              </div>
              <div
                v-if="pendingDeleteId === session.id"
                :class="[
                  'mt-2',
                  'flex',
                  'items-center',
                  'justify-between',
                  'gap-2',
                  'rounded-md',
                  'bg-red-50/70',
                  'px-2',
                  'py-1.5',
                  'text-[0.7rem]',
                  'text-red-600',
                  'dark:bg-red-950/40',
                  'dark:text-red-300',
                ]"
                @click.stop
              >
                <span>Delete this session?</span>
                <div :class="['flex', 'items-center', 'gap-1.5']">
                  <button
                    type="button"
                    :class="[
                      'rounded-md',
                      'bg-white',
                      'px-2',
                      'py-1',
                      'text-[0.65rem]',
                      'text-neutral-600',
                      'shadow-sm',
                      'dark:bg-neutral-900',
                      'dark:text-neutral-300',
                    ]"
                    @click.stop="cancelDelete"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    :class="[
                      'rounded-md',
                      'bg-red-500',
                      'px-2',
                      'py-1',
                      'text-[0.65rem]',
                      'text-white',
                    ]"
                    @click.stop="confirmDelete(session.id)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
