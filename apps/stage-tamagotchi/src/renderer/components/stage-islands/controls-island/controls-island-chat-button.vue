<script setup lang="ts">
import type { ChatButtonState } from '../../../../shared/eventa'

import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { DockButton } from '@proj-airi/ui'
import { computed, onMounted, onScopeDispose, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronChatButtonStateChanged, electronGetChatButtonState, electronOpenChat } from '../../../../shared/eventa'

defineProps<{
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
  <!--
    The click tracker is a DOM directive, and `DockButton` renders no element of its own. The wrapper takes no box, and
    the click of the button bubbles to it.
  -->
  <span v-track-button="{ name: 'controls_island_action', action: 'toggle_chat' }" :class="['contents']">
    <DockButton data-testid="controls-island-chat" :label="label" :pressed="pressed" @click="() => openChat()">
      <span :class="['i-mingcute:chat-2-line', iconClass]" />
    </DockButton>
  </span>
</template>
