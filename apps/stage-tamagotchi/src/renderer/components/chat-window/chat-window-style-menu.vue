<script setup lang="ts">
import type { ChatDraftHandover, ChatWindowPreferences } from '../../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { GhostButton } from '@proj-airi/ui'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronChatWindowGetPreferences, electronChatWindowSetPreferences } from '../../../shared/eventa'

const props = defineProps<{
  /**
   * Captures the unsent composer content of this window. A mode switch closes
   * the window, so the content goes to the next chat window.
   */
  collectDraft?: () => ChatDraftHandover | undefined
}>()

const getPreferences = useElectronEventaInvoke(electronChatWindowGetPreferences)
const setPreferences = useElectronEventaInvoke(electronChatWindowSetPreferences)
// The menu stays disabled until the saved preferences arrive, so a choice
// never starts from defaults that would overwrite them.
const preferences = shallowRef<ChatWindowPreferences>()
const { t } = useI18n()

onMounted(async () => {
  preferences.value = await getPreferences()
})

type ChatWindowStyleId = 'legacy' | 'floating-attached' | 'floating-free'

const styles = computed(() => [
  { id: 'legacy', icon: 'i-solar:window-frame-bold-duotone', label: t('tamagotchi.stage.chat-window.style.legacy') },
  { id: 'floating-attached', icon: 'i-solar:magnet-bold-duotone', label: t('tamagotchi.stage.chat-window.style.floating-attached') },
  { id: 'floating-free', icon: 'i-solar:chat-round-dots-bold-duotone', label: t('tamagotchi.stage.chat-window.style.floating-free') },
] satisfies { id: ChatWindowStyleId, icon: string, label: string }[])

const currentStyleId = computed<ChatWindowStyleId | undefined>(() => {
  if (!preferences.value)
    return undefined
  return preferences.value.mode === 'legacy' ? 'legacy' : `floating-${preferences.value.placement}`
})

// An attached chat follows the main window's pin, so only a free one offers
// its own.
const pinnable = computed(() => currentStyleId.value === 'floating-free')

async function apply(next: ChatWindowPreferences) {
  const previous = preferences.value
  preferences.value = next
  const draft = previous && next.mode !== previous.mode ? props.collectDraft?.() : undefined
  try {
    await setPreferences({ preferences: next, draft })
  }
  catch (error) {
    // The main process kept or restored the previous mode; show that one.
    preferences.value = previous
    console.error('[chat-window] Failed to switch the chat window style:', error)
  }
}

// The legacy window keeps the floating placement, so switching back to the
// floating chat restores the placement the user had.
async function selectStyle(id: unknown) {
  if (!preferences.value || id === currentStyleId.value)
    return

  if (id === 'legacy')
    await apply({ ...preferences.value, mode: 'legacy' })
  else if (id === 'floating-attached')
    await apply({ ...preferences.value, mode: 'floating', placement: 'attached' })
  else if (id === 'floating-free')
    await apply({ ...preferences.value, mode: 'floating', placement: 'free' })
}

async function setPinned(pinned: boolean) {
  if (preferences.value)
    await apply({ ...preferences.value, pinned })
}

const itemClasses = [
  'w-full flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-xs outline-none transition-colors',
  'text-neutral-600 dark:text-neutral-300',
  'data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-700 dark:data-[highlighted]:bg-primary-900/30 dark:data-[highlighted]:text-primary-200',
  'data-[state=checked]:font-semibold data-[state=checked]:text-primary-600 dark:data-[state=checked]:text-primary-300',
]
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child :disabled="!preferences">
      <GhostButton
        data-testid="chat-window-style-button"
        size="unset"
        :disabled="!preferences"
        :class="['size-7 text-neutral-400 dark:text-neutral-500']"
        :title="t('tamagotchi.stage.chat-window.style.title')"
        :aria-label="t('tamagotchi.stage.chat-window.style.title')"
      >
        <div class="i-solar:layers-minimalistic-bold-duotone" />
      </GhostButton>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        align="end"
        :side-offset="6"
        :class="[
          'z-200 min-w-[220px] flex flex-col gap-1 rounded-xl p-1 shadow-lg',
          'bg-white dark:bg-neutral-800',
        ]"
      >
        <DropdownMenuRadioGroup :model-value="currentStyleId" @update:model-value="selectStyle">
          <DropdownMenuRadioItem
            v-for="style in styles"
            :key="style.id"
            :value="style.id"
            :class="itemClasses"
          >
            <div :class="[style.icon, 'size-4 shrink-0']" />
            <span class="flex-1">{{ style.label }}</span>
            <DropdownMenuItemIndicator>
              <div class="i-ph:check-bold size-4 shrink-0" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <template v-if="pinnable && preferences">
          <DropdownMenuSeparator :class="['mx-2 h-px bg-neutral-200 dark:bg-neutral-700']" />
          <DropdownMenuCheckboxItem
            data-testid="chat-window-pin-toggle"
            :model-value="preferences.pinned"
            :class="itemClasses"
            @update:model-value="setPinned"
            @select.prevent
          >
            <div :class="[preferences.pinned ? 'i-solar:pin-bold-duotone' : 'i-solar:pin-linear', 'size-4 shrink-0']" />
            <span class="flex-1">{{ t('tamagotchi.stage.chat-window.style.pinned') }}</span>
            <DropdownMenuItemIndicator>
              <div class="i-ph:check-bold size-4 shrink-0" />
            </DropdownMenuItemIndicator>
          </DropdownMenuCheckboxItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
