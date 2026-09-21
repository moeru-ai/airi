<script setup lang="ts">
import { useTheme } from '@proj-airi/ui'
import { useLocalStorage } from '@vueuse/core'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ActionAbout from '../Layouts/InteractiveArea/Actions/About.vue'
import ViewControls from '../Layouts/InteractiveArea/Actions/ViewControls.vue'
import ChatToolbarButton from './ChatToolbarButton.vue'

import { BackgroundDialogPicker } from '../Backgrounds'

const { isDark, toggleDark } = useTheme()
const { t } = useI18n()

const SEND_MODES = ['enter', 'ctrl-enter', 'double-enter'] as const
type SendMode = (typeof SEND_MODES)[number]

const aboutOpen = ref(false)
const backgroundDialogOpen = ref(false)
const sendMode = useLocalStorage<SendMode>('ui/chat/settings/send-mode', 'enter')
const sendModeLabels = computed<Record<SendMode, string>>(() => ({
  'enter': t('stage.send-mode.enter'),
  'ctrl-enter': t('stage.send-mode.ctrl-enter'),
  'double-enter': t('stage.send-mode.double-enter'),
}))
</script>

<template>
  <ActionAbout v-model="aboutOpen" hide-trigger />
  <BackgroundDialogPicker v-model="backgroundDialogOpen" />
  <div absolute bottom--8 right-0 flex gap-2>
    <ViewControls />
    <ChatToolbarButton
      :title="t('stage.mobile-tools.background')"
      :aria-label="t('stage.mobile-tools.background')"
      @click="backgroundDialogOpen = true"
    >
      <div class="i-solar:gallery-wide-outline size-5" />
    </ChatToolbarButton>
    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <ChatToolbarButton
          :title="t('stage.send-mode.title')"
          :aria-label="t('stage.send-mode.title')"
        >
          <div class="i-solar:keyboard-outline size-5" />
        </ChatToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          side="top"
          align="end"
          :side-offset="8"
          :class="[
            'z-50 min-w-[180px] rounded-xl border border-neutral-200/60 bg-neutral-50/90 p-1',
            'shadow-lg backdrop-blur-md dark:border-neutral-800/30 dark:bg-neutral-900/80',
            'flex flex-col gap-1',
          ]"
        >
          <DropdownMenuItem
            v-for="mode in SEND_MODES"
            :key="mode"
            :class="[
              'w-full flex cursor-pointer items-center rounded-lg px-3 py-2 text-xs outline-none transition-colors',
              'hover:bg-primary-100/60 dark:hover:bg-primary-900/40',
              sendMode === mode ? 'bg-primary-100/60 text-primary-600 font-medium dark:bg-primary-900/40 dark:text-primary-300' : 'text-neutral-600 dark:text-neutral-300',
            ]"
            @select="sendMode = mode"
          >
            <div class="mr-2 h-4 w-4 flex items-center justify-center">
              <div v-if="sendMode === mode" class="i-ph:check-bold h-4 w-4" />
            </div>
            <span>{{ sendModeLabels[mode] }}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
    <ChatToolbarButton
      :title="t('stage.mobile-tools.dark-mode')"
      :aria-label="t('stage.mobile-tools.dark-mode')"
      @click="() => toggleDark()"
    >
      <Transition name="fade" mode="out-in">
        <div v-if="isDark" class="i-solar:moon-outline size-5" />
        <div v-else class="i-solar:sun-2-outline size-5" />
      </Transition>
    </ChatToolbarButton>
    <ChatToolbarButton
      data-testid="about-button"
      title="About"
      aria-label="About"
      @click="aboutOpen = true"
    >
      <div class="i-solar:info-circle-outline size-5" />
    </ChatToolbarButton>
  </div>
</template>
