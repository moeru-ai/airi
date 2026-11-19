<script setup lang="ts">
import type { ControlsMenuAction, ControlsMenuRequest } from '../../shared/eventa'

import { defineInvokeHandler } from '@moeru/eventa'
import { electron } from '@proj-airi/electron-eventa'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'

import ControlsIslandMenu from '../components/stage-islands/controls-island/controls-island-menu.vue'

import {
  electronControlsMenuClosed,
  electronControlsMenuNotificationsRead,
  electronControlsMenuPageMounted,
  electronControlsMenuShow,
} from '../../shared/eventa'

const open = ref(false)
/** The last request of the main window. The anchor is in the coordinates of this window. */
const request = shallowRef<ControlsMenuRequest>()
/** The item that the main window carries out after the menu closes. Each request clears it. */
let action: ControlsMenuAction | undefined
function chooseAction(next: ControlsMenuAction) {
  action = next
}

const reportClosed = useElectronEventaInvoke(electronControlsMenuClosed)
const reportNotificationsRead = useElectronEventaInvoke(electronControlsMenuNotificationsRead)
const reportMounted = useElectronEventaInvoke(electronControlsMenuPageMounted)
const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

// The main process shows the window after this resolves, so the first frame already holds the open menu.
onScopeDispose(defineInvokeHandler(getElectronEventaContext(), electronControlsMenuShow, async (next) => {
  request.value = next
  action = undefined
  open.value = true
  await setIgnoreMouseEvents([false, { forward: false }])
  await nextTick()
}))
onMounted(() => void reportMounted())

// A click in another app takes the focus from this window, and the menu closes as a desktop menu does.
useEventListener(window, 'blur', () => {
  open.value = false
})

// The window covers the work area. During the exit animation, clicks go to the apps below.
watch(open, (opened) => {
  if (!opened)
    void setIgnoreMouseEvents([true, { forward: false }])
})

// The trigger stands where the more button of the main window is, so a click on the button closes the menu.
const anchorStyle = computed(() => {
  const anchor = request.value?.anchor
  if (!anchor)
    return undefined
  return { left: `${anchor.x}px`, top: `${anchor.y}px`, width: `${anchor.width}px`, height: `${anchor.height}px` }
})
</script>

<template>
  <ControlsIslandMenu
    v-if="request"
    v-model:open="open"
    :side="request.side"
    :align="request.align"
    :signing-in="request.signingIn"
    @action="chooseAction"
    @notifications-read="reportNotificationsRead"
    @closed="reportClosed(action)"
  >
    <template #trigger>
      <span aria-hidden="true" data-testid="controls-menu-anchor" :class="['fixed']" :style="anchorStyle" />
    </template>
  </ControlsIslandMenu>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
