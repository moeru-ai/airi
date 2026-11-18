<script setup lang="ts">
import { BasicButton, DropdownMenu, MenuLabel, MenuRadioItem } from '@proj-airi/ui'
import { DropdownMenuRadioGroup } from 'reka-ui'
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
        <MenuLabel>{{ t('stage.send-mode.title') }}</MenuLabel>
        <DropdownMenuRadioGroup v-model="sendMode">
          <MenuRadioItem v-for="mode in sendModes" :key="mode" :value="mode">
            <span :class="['flex-1']">{{ t(`stage.send-mode.${mode}`) }}</span>
          </MenuRadioItem>
        </DropdownMenuRadioGroup>
      </div>
    </DropdownMenu>
  </div>
</template>
