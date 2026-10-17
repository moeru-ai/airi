<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { VoiceInlay } from '@proj-airi/stage-ui/components/scenarios/chat'
import { useTemplateRef } from 'vue'

import { electronInlayReturnHome } from '../../../shared/eventa'
import { useChatFloatingClickThrough } from '../../composables/use-chat-floating-click-through'
import { useGlobalEscape } from '../../composables/use-global-escape'

const inlay = useTemplateRef<InstanceType<typeof VoiceInlay>>('inlay')
const returnHome = useElectronEventaInvoke(electronInlayReturnHome)
const { hitTest } = useChatFloatingClickThrough({ pinned: true })
useGlobalEscape('voice-inlay-dismiss', () => !!inlay.value?.active, () => inlay.value?.dismiss())
</script>

<template>
  <VoiceInlay ref="inlay" :return-home="returnHome" :hit-test="hitTest" />
</template>
