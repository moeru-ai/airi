<script setup lang="ts">
import type { ControlsMenuRequest } from '../../shared/eventa'

import { defineInvokeHandler } from '@moeru/eventa'
import { electron } from '@proj-airi/electron-eventa'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useEventListener } from '@vueuse/core'
import { computed, nextTick, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'

import ControlsIslandMenu from '../components/stage-islands/controls-island/controls-island-menu.vue'

import {
  electronControlsMenuHide,
  electronControlsMenuOpenHearing,
  electronControlsMenuPageMounted,
  electronControlsMenuShow,
} from '../../shared/eventa'

const open = ref(false)
/**
 * The last request of the main window, with the anchor in the coordinates of this window.
 *
 * The menu mounts with the page, because it also starts a sign-in that another surface asks for. It stays closed until
 * the first request, so nothing uses this first anchor.
 */
const request = shallowRef<ControlsMenuRequest>({ anchor: { x: 0, y: 0, width: 0, height: 0 }, side: 'left', align: 'end' })

const hide = useElectronEventaInvoke(electronControlsMenuHide)
const openHearing = useElectronEventaInvoke(electronControlsMenuOpenHearing)
const reportMounted = useElectronEventaInvoke(electronControlsMenuPageMounted)
const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

// The main process shows the window after this resolves, so the first frame already holds the open menu.
onScopeDispose(defineInvokeHandler(getElectronEventaContext(), electronControlsMenuShow, async (next) => {
  request.value = next
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
  const { x, y, width, height } = request.value.anchor
  return { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` }
})
</script>

<template>
  <ControlsIslandMenu
    v-model:open="open"
    :side="request.side"
    :align="request.align"
    @open-hearing="openHearing"
    @closed="hide"
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
