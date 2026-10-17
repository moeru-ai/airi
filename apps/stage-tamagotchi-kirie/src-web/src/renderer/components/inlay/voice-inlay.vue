<script setup lang="ts">
import { getHostEventaContext, initializeHostContext, useHostEventaInvoke } from '@proj-airi/stage-host-context'
import { VoiceInlay } from '@proj-airi/stage-ui/components/scenarios/chat'
import { onMounted, useTemplateRef } from 'vue'

import { inlayReady, inlayReturnHome } from '../../../shared/inlay'
import { useChatFloatingClickThrough } from '../../composables/use-chat-floating-click-through'
import { useGlobalEscape } from '../../composables/use-global-escape'

const inlay = useTemplateRef<InstanceType<typeof VoiceInlay>>('inlay')
const returnHome = useHostEventaInvoke(inlayReturnHome)
const { hitTest } = useChatFloatingClickThrough({ pinned: true })
const nativeWindow = initializeHostContext().platform.hostWindow
useGlobalEscape('voice-inlay-dismiss', () => !!inlay.value?.active, () => inlay.value?.dismiss())
onMounted(() => getHostEventaContext().emit(inlayReady, {}))

function beginMove(event: PointerEvent) {
  if (event.button !== 0 || !(event.target instanceof Element))
    return
  // Editing, scrolling, and action controls keep their ordinary pointer behavior.
  if (!event.target.closest('.drag-region') || event.target.closest('button, input, textarea, [data-testid="voice-draft-scroller"], [class*="app-region:no-drag"]'))
    return
  event.preventDefault()
  void nativeWindow.beginMove()
}
</script>

<template>
  <div :class="['h-full w-full']" @pointerdown="beginMove">
    <VoiceInlay ref="inlay" :return-home="() => returnHome({})" :hit-test="hitTest" />
  </div>
</template>
