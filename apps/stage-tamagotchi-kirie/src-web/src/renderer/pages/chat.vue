<script setup lang="ts">
import type { ChatWindowState } from '../../shared/chat-window'

import { getHostEventaContext, initializeHostContext, useHostEventaInvoke, useHostMouseInElement } from '@proj-airi/stage-host-context'
import { ChatSessionsDrawer } from '@proj-airi/stage-ui/components'
import { useDanmakuFeedExpiry } from '@proj-airi/stage-ui/composables/chat/use-danmaku-feed-expiry'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onScopeDispose, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChatDanmakuFeedMenu from '../components/chat-window/chat-danmaku-feed-menu.vue'
import ChatSpeechMuteButton from '../components/chat-window/chat-speech-mute-button.vue'
import ChatWindowStyleMenu from '../components/chat-window/chat-window-style-menu.vue'
import InteractiveArea from '../components/interactive-area.vue'
import WindowTitleBar from '../components/Window/TitleBar.vue'
import ChatPageShell from './chat-page-shell.vue'

import { chatWindowContentHidden, chatWindowFold, chatWindowGetState, chatWindowStateChanged } from '../../shared/chat-window'
import { dismissOverlays, useChatFloatingClickThrough } from '../composables/use-chat-floating-click-through'
import { useControlsIslandStore } from '../stores/controls-island'

const { activeCard } = storeToRefs(useAiriCardStore())
const sessionsDrawerOpen = shallowRef(false)
const { t } = useI18n()
const interactiveArea = useTemplateRef<InstanceType<typeof InteractiveArea>>('interactive-area')
const context = getHostEventaContext()
const nativeWindow = initializeHostContext().platform.hostWindow
const getState = useHostEventaInvoke(chatWindowGetState)
const state = shallowRef<ChatWindowState>()
const stopState = context.on(chatWindowStateChanged, (event) => {
  if (event?.body)
    state.value = event.body
})
onScopeDispose(stopState)
onMounted(async () => state.value = await getState({}))

const floating = computed(() => state.value?.preferences.mode === 'floating')
const danmaku = computed(() => floating.value && state.value?.preferences.placement === 'danmaku')
const composerFolded = useLocalStorage('chat-window/danmaku/composer-folded', true)
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())
const passiveFeed = computed(() => danmaku.value && fadeOnHoverEnabled.value && composerFolded.value)
const { isOutside: cursorOutsideHistory } = useHostMouseInElement(computed(() => interactiveArea.value?.historyLayer))
const expiredBefore = useDanmakuFeedExpiry(danmaku, () => composerFolded.value && (passiveFeed.value || cursorOutsideHistory.value))
const { hitTest } = useChatFloatingClickThrough({
  pinned: () => floating.value && !!state.value?.pinned,
  passiveArea: () => passiveFeed.value ? interactiveArea.value?.historyLayer : undefined,
})
const contentShown = computed(() => !!state.value && !state.value.folded)
const characterOnLeft = computed(() => state.value?.side === 'right')
watch(contentShown, (shown) => {
  if (!shown)
    void dismissOverlays()
})

function fold() {
  context.emit(chatWindowFold, {})
}

function reportContentHidden() {
  context.emit(chatWindowContentHidden, {})
}
</script>

<template>
  <Transition
    :name="characterOnLeft ? 'chat-floating-fold-left' : 'chat-floating-fold-right'"
    @after-enter="hitTest()"
    @after-leave="reportContentHidden()"
  >
    <ChatPageShell v-show="contentShown" :floating="floating">
      <WindowTitleBar
        v-if="!floating"
        :title="activeCard?.name || 'AIRI'"
        icon="i-solar:chat-line-bold"
        @title-click="sessionsDrawerOpen = true"
      >
        <template #actions>
          <ChatSpeechMuteButton />
          <ChatWindowStyleMenu />
          <button
            data-testid="conversation-selector-button"
            :class="['h-7 w-7 flex items-center justify-center rounded-md text-neutral-400 hover:bg-primary-500/10', 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300']"
            :title="t('stage.chat.sessions.title')"
            :aria-label="t('stage.chat.sessions.title')"
            @click="sessionsDrawerOpen = true"
          >
            <div :class="['i-solar:chat-line-bold-duotone']" />
          </button>
        </template>
      </WindowTitleBar>
      <header v-else :class="['flex items-center gap-2 px-4 pb-1', characterOnLeft ? 'flex-row-reverse' : '']">
        <button
          :class="['size-9 shrink-0 flex cursor-nwse-resize items-center justify-center rounded-full bg-white shadow-md dark:bg-neutral-900', 'text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300']"
          :title="t('tamagotchi.stage.chat-window.resize')"
          :aria-label="t('tamagotchi.stage.chat-window.resize')"
          @pointerdown.prevent="nativeWindow.beginResize(characterOnLeft ? 'top-right' : 'top-left')"
        >
          <div :class="[characterOnLeft ? 'i-lucide:move-diagonal' : 'i-lucide:move-diagonal-2', 'size-4']" />
        </button>
        <div :class="['min-w-0 flex items-center gap-1 rounded-full bg-white p-1 shadow-md dark:bg-neutral-900']">
          <button
            v-if="state?.preferences.placement !== 'attached'"
            :class="['h-7 w-5 shrink-0 cursor-grab rounded-full text-neutral-400', 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300']"
            :title="t('tamagotchi.stage.chat-window.move')"
            :aria-label="t('tamagotchi.stage.chat-window.move')"
            @pointerdown.prevent="nativeWindow.beginMove()"
          >
            <div :class="['i-ph:dots-six-vertical-bold']" />
          </button>
          <button
            :class="['min-w-0 truncate rounded-full px-2 text-sm font-medium text-neutral-700 dark:text-neutral-200', 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300']"
            @click="sessionsDrawerOpen = true"
          >
            {{ activeCard?.name || 'AIRI' }}
          </button>
          <ChatSpeechMuteButton :class="['shrink-0 rounded-full!']" />
          <ChatDanmakuFeedMenu v-if="danmaku" :class="['shrink-0 rounded-full!']" />
          <ChatWindowStyleMenu :class="['shrink-0 rounded-full!']" />
        </div>
        <button
          :class="['size-9 shrink-0 flex items-center justify-center rounded-full bg-white shadow-md dark:bg-neutral-900', 'text-neutral-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-300']"
          :title="t('tamagotchi.stage.chat-window.fold')"
          :aria-label="t('tamagotchi.stage.chat-window.fold')"
          @click="fold"
        >
          <div :class="['i-lucide:minimize-2 size-4']" />
        </button>
      </header>
      <!-- One composer instance keeps the draft and attachments across native style changes. -->
      <div :class="['interaction-area min-h-0 w-full flex-1']">
        <InteractiveArea
          ref="interactive-area"
          v-model:composer-folded="composerFolded"
          :floating="floating"
          :composer-foldable="danmaku"
          :passive="passiveFeed"
          :expired-before="expiredBefore"
        />
      </div>
    </ChatPageShell>
  </Transition>
  <ChatSessionsDrawer v-model="sessionsDrawerOpen" />
</template>

<style scoped>
.chat-floating-fold-right-enter-active,
.chat-floating-fold-right-leave-active,
.chat-floating-fold-left-enter-active,
.chat-floating-fold-left-leave-active {
  transition: transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 380ms ease;
}

.chat-floating-fold-right-enter-active,
.chat-floating-fold-right-leave-active {
  transform-origin: bottom right;
}

.chat-floating-fold-left-enter-active,
.chat-floating-fold-left-leave-active {
  transform-origin: bottom left;
}

.chat-floating-fold-right-enter-from,
.chat-floating-fold-right-leave-to,
.chat-floating-fold-left-enter-from,
.chat-floating-fold-left-leave-to {
  transform: scale(0.94);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .chat-floating-fold-right-enter-active,
  .chat-floating-fold-right-leave-active,
  .chat-floating-fold-left-enter-active,
  .chat-floating-fold-left-leave-active {
    transition: none;
  }
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
