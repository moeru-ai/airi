<script setup lang="ts">
import type { ChatButtonState } from '../../../../shared/chat-window'

import { useHostChat, useHostEventaContext, useHostEventaInvoke } from '@proj-airi/stage-host-context'
import { computed, onMounted, onScopeDispose, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

import { electronChatButtonStateChanged, electronGetChatButtonState } from '../../../../shared/chat-window'

defineProps<{
  buttonStyle: string
  iconClass: string
}>()

const { t } = useI18n()
const context = useHostEventaContext()
const openChat = useHostChat()
const getChatButtonState = useHostEventaInvoke(electronGetChatButtonState)

const state = shallowRef<ChatButtonState>({ mode: 'legacy', floatingShown: false })
const stopStateChanged = context.value.on(electronChatButtonStateChanged, (event) => {
  if (event?.body)
    state.value = event.body
})
onScopeDispose(stopStateChanged)
onMounted(async () => {
  state.value = await getChatButtonState({})
})

// Only the floating chat is a toggle. The legacy window has no pressed state.
const pressed = computed(() => state.value.mode === 'floating' ? state.value.floatingShown : undefined)
const label = computed(() => pressed.value
  ? t('tamagotchi.stage.controls-island.hide-chat')
  : t('tamagotchi.stage.controls-island.open-chat'))
</script>

<template>
  <ControlButtonTooltip side="inward">
    <ControlButton
      :button-style="[buttonStyle, pressed ? 'bg-primary-100! dark:bg-primary-900/60!' : ''].join(' ')"
      :aria-label="label"
      :aria-pressed="pressed"
      @click="() => openChat()"
    >
      <div
        :class="[
          'i-solar:chat-line-line-duotone',
          iconClass,
          pressed ? 'text-primary-600 dark:text-primary-300' : 'text-neutral-800 dark:text-neutral-300',
        ]"
      />
    </ControlButton>
    <template #tooltip>
      {{ label }}
    </template>
  </ControlButtonTooltip>
</template>
