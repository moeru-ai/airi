<script setup lang="ts">
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { BasicButton } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useStopSpeakingButton } from '../../composables/useStopSpeakingButton'

const { t } = useI18n()
const { activeSessionId, sessionMetas } = storeToRefs(useChatSessionStore())
const { speechMuted, toggleSpeechMuted } = useStopSpeakingButton()

const sessionsDrawerOpen = ref(false)
const activeSessionTitle = computed(() => {
  return sessionMetas.value[activeSessionId.value]?.title?.trim()
    || t('stage.chat.sessions.new-chat-fallback')
})
</script>

<template>
  <div
    :class="[
      'h-11 shrink-0 flex items-center justify-between gap-3 border-b border-primary-200/20 px-3',
      'text-neutral-600 dark:border-primary-400/15 dark:text-neutral-300',
    ]"
  >
    <ChatSessionsDrawer v-model="sessionsDrawerOpen" desktop-mode="popover">
      <template #trigger>
        <BasicButton
          size="unset"
          data-testid="conversation-selector-button"
          :class="[
            'min-w-0 max-w-[70%] flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none',
            'hover:bg-primary-100/60 hover:text-primary-700 dark:hover:bg-primary-900/40 dark:hover:text-primary-200',
            'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-1',
          ]"
          :title="t('stage.chat.sessions.title')"
          :aria-label="t('stage.chat.sessions.title')"
          aria-haspopup="dialog"
          :aria-expanded="sessionsDrawerOpen"
        >
          <span aria-hidden="true" :class="['i-solar:dialog-2-outline size-5 shrink-0']" />
          <span truncate text-sm font-medium>{{ activeSessionTitle }}</span>
          <span aria-hidden="true" :class="['i-solar:alt-arrow-down-outline size-4 shrink-0 opacity-60']" />
        </BasicButton>
      </template>
    </ChatSessionsDrawer>

    <BasicButton
      size="unset"
      data-testid="speech-mute-button"
      :class="[
        'size-8 shrink-0 rounded-lg outline-none',
        'text-neutral-500 hover:bg-primary-100/60 hover:text-primary-700 dark:text-neutral-400 dark:hover:bg-primary-900/40 dark:hover:text-primary-200',
        'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-1',
        speechMuted ? 'bg-primary-100/80 text-primary-700 dark:bg-primary-900/50 dark:text-primary-200' : '',
      ]"
      :title="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
      :aria-label="speechMuted ? t('stage.speech-output.unmute') : t('stage.speech-output.mute')"
      :aria-pressed="speechMuted"
      @click="toggleSpeechMuted"
    >
      <span v-if="speechMuted" aria-hidden="true" :class="['i-solar:volume-cross-outline size-5']" />
      <span v-else aria-hidden="true" :class="['i-solar:volume-loud-outline size-5']" />
    </BasicButton>
  </div>
</template>
