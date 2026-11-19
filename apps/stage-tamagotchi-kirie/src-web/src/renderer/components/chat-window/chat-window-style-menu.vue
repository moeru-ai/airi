<script setup lang="ts">
import type { ChatWindowMode, ChatWindowPreferences } from '../../../shared/eventa'
import type { ChatHeaderButtonVariant } from './chat-header-button'

import { useHostEventaInvoke } from '@proj-airi/stage-host-context'
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
import { chatHeaderButtonClass } from './chat-header-button'

// The root is the menu, which renders no element, so a class from the parent
// goes to the trigger button.
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  variant?: ChatHeaderButtonVariant
}>(), {
  variant: 'plain',
})

const getPreferences = useHostEventaInvoke(electronChatWindowGetPreferences)
const setPreferences = useHostEventaInvoke(electronChatWindowSetPreferences)
// The menu stays disabled until the saved preferences arrive, so it never
// shows a style or a placement that is not saved.
const preferences = shallowRef<ChatWindowPreferences>()
const { t } = useI18n()

onMounted(async () => {
  preferences.value = await getPreferences({})
})

// The legacy mode keeps the floating placement, so a switch back to the
// floating chat restores the placement the user had.
const styles = computed(() => [
  { mode: 'legacy', icon: 'i-solar:window-frame-bold-duotone', label: t('tamagotchi.stage.chat-window.style.legacy') },
  { mode: 'floating', icon: 'i-solar:chat-round-dots-bold-duotone', label: t('tamagotchi.stage.chat-window.style.floating') },
] satisfies { mode: ChatWindowMode, icon: string, label: string }[])

/** Counts choices, so only the latest one decides what the menu shows. */
let latestChoice = 0

/** Saves what a choice changes. The host keeps the preferences that it leaves out. */
async function apply(changes: Partial<ChatWindowPreferences>) {
  if (!preferences.value)
    return
  const choice = ++latestChoice
  preferences.value = { ...preferences.value, ...changes }
  try {
    await setPreferences(changes)
  }
  catch (error) {
    console.error('[chat-window] Failed to switch the chat window style:', error)
    // The host kept the open window and its saved mode. A newer choice
    // already shows its own preferences, and it reads them back itself if it
    // fails too.
    const saved = await getPreferences({})
    if (choice === latestChoice)
      preferences.value = saved
  }
}

async function selectStyle(mode: ChatWindowMode) {
  if (mode !== preferences.value?.mode)
    await apply({ mode })
}

async function setAttached(attached: boolean) {
  await apply({ placement: attached ? 'attached' : 'free' })
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
        :class="chatHeaderButtonClass(variant)"
        :title="t('tamagotchi.stage.chat-window.style.title')"
        :aria-label="t('tamagotchi.stage.chat-window.style.title')"
      >
        <div :class="['i-solar:layers-minimalistic-bold-duotone']" />
      </button>
    </template>

    <DropdownMenuRadioGroup :model-value="preferences?.mode">
      <DropdownMenuRadioItem
        v-for="style in styles"
        :key="style.mode"
        :value="style.mode"
        :class="itemClasses"
        @select="selectStyle(style.mode)"
      >
        <div :class="[style.icon, 'size-4 shrink-0']" />
        <span :class="['flex-1']">{{ style.label }}</span>
        <DropdownMenuItemIndicator>
          <div :class="['i-ph:check-bold size-4 shrink-0']" />
        </DropdownMenuItemIndicator>
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
    <template v-if="preferences?.mode === 'floating'">
      <DropdownMenuSeparator :class="['mx-2 h-px bg-neutral-200/80 dark:bg-neutral-700/80']" />
      <DropdownMenuCheckboxItem
        :model-value="preferences.placement === 'attached'"
        :class="itemClasses"
        @update:model-value="setAttached"
        @select.prevent
      >
        <div :class="['i-solar:magnet-bold-duotone', 'size-4 shrink-0']" />
        <span :class="['flex-1']">{{ t('tamagotchi.stage.chat-window.style.attached') }}</span>
        <DropdownMenuItemIndicator>
          <div :class="['i-ph:check-bold size-4 shrink-0']" />
        </DropdownMenuItemIndicator>
      </DropdownMenuCheckboxItem>
    </template>
  </DropdownMenu>
</template>
