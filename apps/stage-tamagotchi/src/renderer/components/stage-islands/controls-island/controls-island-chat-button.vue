<script setup lang="ts">
import type { ChatButtonState } from '../../../../shared/eventa'

import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { computed, onMounted, onScopeDispose, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

import { electronChatButtonStateChanged, electronGetChatButtonState, electronOpenChat } from '../../../../shared/eventa'

defineProps<{
  buttonStyle: string
  iconClass: string
}>()

const { t } = useI18n()
const context = useElectronEventaContext()
const openChat = useElectronEventaInvoke(electronOpenChat)
const getChatButtonState = useElectronEventaInvoke(electronGetChatButtonState)

const state = shallowRef<ChatButtonState>({ mode: 'legacy', floatingShown: false })
const stopStateChanged = context.value.on(electronChatButtonStateChanged, (event) => {
  if (event?.body)
    state.value = event.body
})
onScopeDispose(stopStateChanged)
onMounted(async () => {
  state.value = await getChatButtonState()
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
      v-track-button="{ name: 'controls_island_action', action: 'toggle_chat' }"
      :button-style="[buttonStyle, pressed ? 'bg-primary-100! dark:bg-primary-900/60!' : ''].join(' ')"
      :aria-label="label"
      :aria-pressed="pressed"
      @click="() => openChat()"
    >
      <div
        i-solar:chat-line-line-duotone
        :class="[
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
