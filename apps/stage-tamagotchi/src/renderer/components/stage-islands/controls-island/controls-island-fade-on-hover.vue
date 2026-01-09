<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

import { noticeWindowEventa } from '../../../../shared/eventa'
import { useElectronEventaInvoke } from '../../../composables/electron-vueuse/use-electron-eventa-context'
import { useControlsIslandStore } from '../../../stores/controls-island'

interface Props {
  iconClass?: string
  buttonStyle?: string
}

const props = withDefaults(defineProps<Props>(), {
  iconClass: 'size-5',
})

const uiStore = useControlsIslandStore()
const enabled = computed(() => uiStore.fadeOnHoverEnabled)
const { t } = useI18n()

const requestNotice = useElectronEventaInvoke(noticeWindowEventa.openWindow)
const NOTICE_WINDOW_ID = 'fade-on-hover'

async function handleToggle() {
  if (enabled.value) {
    uiStore.disableFadeOnHover()
    return
  }

  if (uiStore.dontShowItAgainNoticeFadeOnHover) {
    uiStore.enableFadeOnHover()
    return
  }

  try {
    const acknowledged = await requestNotice({
      id: NOTICE_WINDOW_ID,
      route: '/notice/fade-on-hover',
      type: 'fade-on-hover',
    })
    if (acknowledged)
      uiStore.enableFadeOnHover()
  }
  catch (error) {
    console.error('Failed to open fade-on-hover notice:', error)
  }
}
</script>

<template>
  <ControlButtonTooltip>
    <ControlButton
      :button-style="props.buttonStyle"
      :class="{ 'border-primary-300/70 shadow-[0_10px_24px_rgba(0,0,0,0.22)]': enabled }"
      @click="handleToggle"
    >
      <Transition name="fade" mode="out-in">
        <div v-if="enabled" i-ph:eye :class="props.iconClass" text="primary-700 dark:primary-300" />
        <div v-else i-ph:eye-slash :class="props.iconClass" text="neutral-800 dark:neutral-300" />
      </Transition>
    </ControlButton>

    <template #tooltip>
      {{ enabled ? t('tamagotchi.stage.controls-island.fade-on-hover.disable') : t('tamagotchi.stage.controls-island.fade-on-hover.enable') }}
    </template>
  </ControlButtonTooltip>
</template>
