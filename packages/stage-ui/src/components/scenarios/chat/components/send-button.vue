<script setup lang="ts">
import { BasicButton, DropdownMenu } from '@proj-airi/ui'
import {
  DropdownMenuItemIndicator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'

import { useHoverMenu } from '../composables/use-hover-menu'

/** Which key press in the composer sends. The composer applies it to its own key handler. */
type ChatSendMode = 'enter' | 'ctrl-enter' | 'double-enter'

const props = defineProps<{
  disabled?: boolean
  /** Classes of the button itself, so each composer keeps its own button look. */
  buttonClass?: unknown
}>()
const emit = defineEmits<{
  send: []
}>()
const sendMode = defineModel<ChatSendMode>('sendMode', { required: true })

const { t } = useI18n()
/** The send key menu opens on hover, a right-click, or the up arrow. A click always sends. */
const menu = useHoverMenu()
const menuOpen = menu.open

const sendModes: ChatSendMode[] = ['enter', 'ctrl-enter', 'double-enter']

const itemClasses = [
  'w-full flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-left',
  'text-sm leading-none outline-none text-neutral-700 dark:text-neutral-200',
  'data-[highlighted]:bg-primary-100/80 dark:data-[highlighted]:bg-primary-900/40',
  'data-[state=checked]:text-primary-600 dark:data-[state=checked]:text-primary-300',
  'transition-colors duration-150 ease-in-out',
]
</script>

<template>
  <div :class="['relative shrink-0']" @pointerenter="menu.enter()" @pointerleave="menu.leave()">
    <BasicButton
      size="unset"
      type="button"
      data-testid="chat-send-button"
      :disabled="props.disabled"
      :aria-label="t('stage.chat.actions.send')"
      :title="t('stage.chat.actions.send')"
      :class="props.buttonClass"
      @click="menu.close(); emit('send')"
      @contextmenu.prevent="menu.openNow()"
      @keydown.up.prevent="menu.openNow()"
    >
      <span :class="['i-solar:arrow-up-outline size-5']" aria-hidden="true" />
    </BasicButton>
    <DropdownMenu v-model:open="menuOpen" :modal="false" side="top" align="end" variant="blurry" :content-class="['min-w-[200px]']">
      <template #trigger>
        <!-- The menu anchors to the button area. The button keeps its click for sending, so this anchor takes no pointer input. -->
        <span aria-hidden="true" tabindex="-1" :class="['pointer-events-none absolute inset-0']" />
      </template>
      <div @pointerenter="menu.enter()" @pointerleave="menu.leave()">
        <DropdownMenuLabel :class="['px-3 pb-1 pt-2 text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('stage.send-mode.title') }}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup v-model="sendMode">
          <DropdownMenuRadioItem
            v-for="mode in sendModes"
            :key="mode"
            :value="mode"
            :class="itemClasses"
            @select.prevent
          >
            <span :class="['flex-1']">{{ t(`stage.send-mode.${mode}`) }}</span>
            <DropdownMenuItemIndicator>
              <span :class="['i-ph:check-bold size-4 shrink-0']" />
            </DropdownMenuItemIndicator>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </div>
    </DropdownMenu>
  </div>
</template>
