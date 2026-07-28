<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useAnalytics } from '@proj-airi/stage-ui/composables/use-analytics'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

import { noticeWindowEventa } from '../../../../shared/eventa'
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
const { useTrack } = useAnalytics()

const requestNotice = useElectronEventaInvoke(noticeWindowEventa.openWindow)
const NOTICE_WINDOW_ID = 'fade-on-hover'
const enableFadeOnHover = useTrack('enable_fade_on_hover', () => uiStore.enableFadeOnHover())
const disableFadeOnHover = useTrack('disable_fade_on_hover', () => uiStore.disableFadeOnHover())

async function handleToggle() {
  if (enabled.value) {
    disableFadeOnHover()
    return
  }

  if (uiStore.dontShowItAgainNoticeFadeOnHover) {
    enableFadeOnHover()
    return
  }

  try {
    const acknowledged = await requestNotice({
      id: NOTICE_WINDOW_ID,
      route: '/notice/fade-on-hover',
      type: 'fade-on-hover',
    })
    if (acknowledged) {
      enableFadeOnHover()
    }
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
      :aria-label="enabled ? t('tamagotchi.stage.controls-island.fade-on-hover.disable') : t('tamagotchi.stage.controls-island.fade-on-hover.enable')"
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
