<script setup lang="ts">
import type { ChatWindowPreferences } from '../../../shared/eventa'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { DropdownMenu } from '@proj-airi/ui'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItemIndicator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from 'reka-ui'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronChatWindowGetPreferences, electronChatWindowSetPreferences } from '../../../shared/eventa'

// The root is the menu, which renders no element, so a class from the parent
// goes to the trigger button.
defineOptions({ inheritAttrs: false })

const getPreferences = useElectronEventaInvoke(electronChatWindowGetPreferences)
const setPreferences = useElectronEventaInvoke(electronChatWindowSetPreferences)
// The menu stays disabled until the saved preferences arrive, so a choice
// never starts from defaults that would overwrite them.
const preferences = shallowRef<ChatWindowPreferences>()
const { t } = useI18n()

onMounted(async () => {
  preferences.value = await getPreferences()
})

/**
 * The preferences each menu item selects. The legacy window keeps the
 * floating placement, so switching back to the floating chat restores the
 * placement the user had.
 */
const styleChoices = {
  'legacy': { mode: 'legacy' },
  'floating-attached': { mode: 'floating', placement: 'attached' },
  'floating-free': { mode: 'floating', placement: 'free' },
  'floating-danmaku': { mode: 'floating', placement: 'danmaku' },
} as const satisfies Record<string, Partial<ChatWindowPreferences>>

type ChatWindowStyleId = keyof typeof styleChoices

const styles = computed(() => [
  { id: 'legacy', icon: 'i-solar:window-frame-bold-duotone', label: t('tamagotchi.stage.chat-window.style.legacy') },
  { id: 'floating-attached', icon: 'i-solar:magnet-bold-duotone', label: t('tamagotchi.stage.chat-window.style.floating-attached') },
  { id: 'floating-free', icon: 'i-solar:chat-round-dots-bold-duotone', label: t('tamagotchi.stage.chat-window.style.floating-free') },
  { id: 'floating-danmaku', icon: 'i-solar:subtitles-bold-duotone', label: t('tamagotchi.stage.chat-window.style.floating-danmaku') },
] satisfies { id: ChatWindowStyleId, icon: string, label: string }[])

const currentStyleId = computed<ChatWindowStyleId | undefined>(() => {
  if (!preferences.value)
    return undefined
  return preferences.value.mode === 'legacy' ? 'legacy' : `floating-${preferences.value.placement}`
})

// An attached or danmaku chat follows the main window's pin, so only a free
// one offers its own.
const pinnable = computed(() => currentStyleId.value === 'floating-free')

/** Counts choices, so only the latest one decides what the menu shows. */
let latestChoice = 0

async function apply(next: ChatWindowPreferences) {
  const choice = ++latestChoice
  preferences.value = next
  try {
    await setPreferences(next)
  }
  catch (error) {
    console.error('[chat-window] Failed to switch the chat window style:', error)
    // The main process kept the open window and its saved mode. A newer
    // choice already shows its own preferences, and it reads them back itself
    // if it fails too.
    const saved = await getPreferences()
    if (choice === latestChoice)
      preferences.value = saved
  }
}

async function selectStyle(id: ChatWindowStyleId) {
  if (preferences.value && id !== currentStyleId.value)
    await apply({ ...preferences.value, ...styleChoices[id] })
}

async function setPinned(pinned: boolean) {
  if (preferences.value)
    await apply({ ...preferences.value, pinned })
}

const itemClasses = [
  'w-full flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-left',
  'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
  'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
  'data-[state=checked]:font-semibold data-[state=checked]:text-primary-500 dark:data-[state=checked]:text-primary-300',
  'transition-colors duration-150 ease-in-out',
]
</script>

<template>
  <DropdownMenu
    align="end"
    :content-class="['min-w-[220px]']"
    :disabled="!preferences"
  >
    <template #trigger>
      <button
        v-bind="$attrs"
        :disabled="!preferences"
        :class="[
          'h-7 w-7 flex items-center justify-center rounded-md outline-none',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300',
          'text-base transition-colors transition-transform active:scale-95 disabled:opacity-50',
          'text-neutral-400 hover:bg-neutral-200 hover:text-primary-500 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-primary-400',
        ]"
        :title="t('tamagotchi.stage.chat-window.style.title')"
        :aria-label="t('tamagotchi.stage.chat-window.style.title')"
      >
        <div class="i-solar:layers-minimalistic-bold-duotone" />
      </button>
    </template>

    <DropdownMenuRadioGroup :model-value="currentStyleId">
      <DropdownMenuRadioItem
        v-for="style in styles"
        :key="style.id"
        :value="style.id"
        :class="itemClasses"
        @select="selectStyle(style.id)"
      >
        <div :class="[style.icon, 'size-4 shrink-0']" />
        <span class="flex-1">{{ style.label }}</span>
        <DropdownMenuItemIndicator>
          <div class="i-ph:check-bold size-4 shrink-0" />
        </DropdownMenuItemIndicator>
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
    <template v-if="pinnable && preferences">
      <DropdownMenuSeparator :class="['mx-2 h-px bg-neutral-200/80 dark:bg-neutral-700/80']" />
      <DropdownMenuCheckboxItem
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
  </DropdownMenu>
</template>
