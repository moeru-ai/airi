<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLampFlickerAnimation } from '@proj-airi/stage-ui/composables/use-lamp-flicker-animation'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { lampFlickerAnimationClass } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from '../controls-island/control-button-tooltip.vue'
import ControlButton from '../controls-island/control-button.vue'

import { electronOpenSettings } from '../../../../shared/eventa'

const { t } = useI18n()
const { connected } = storeToRefs(useModsServerChannelStore())
const openSettings = useElectronEventaInvoke(electronOpenSettings)

const { flickerStyle, onAnimationIteration } = useLampFlickerAnimation(() => !connected.value)

const statusIslandSize = {
  border: 'border-2',
  icon: 'size-6',
  padding: 'p-2.5',
} as const

const buttonStyle = computed(() => {
  return [
    statusIslandSize.border,
    statusIslandSize.padding,
    'transition-all duration-300 ease-in-out',
    connected.value
      ? 'border-emerald-200/60 bg-white/85 hover:bg-emerald-50/90 dark:border-emerald-400/15 dark:bg-neutral-900/75 dark:hover:bg-neutral-900/88'
      : 'border-amber-300/80 bg-amber-50/90 hover:bg-amber-100/90 dark:border-amber-400/30 dark:bg-amber-950/25 dark:hover:bg-amber-950/38',
  ]
})

const iconClasses = computed(() => {
  return [
    connected.value ? 'i-ph:wifi-high' : `i-ph:wifi-slash ${lampFlickerAnimationClass}`,
    statusIslandSize.icon,
    'shrink-0 transition-colors duration-300 ease-in-out',
    connected.value
      ? 'text-emerald-600 dark:text-emerald-300'
      : 'text-amber-600 dark:text-amber-300',
  ]
})

const buttonLabel = computed(() => {
  return connected.value
    ? t('stage.websocket-status.connected')
    : t('stage.websocket-status.disconnected')
})

const tooltipLabel = computed(() => {
  return `${buttonLabel.value}. ${t('stage.websocket-status.open-settings')}`
})
</script>

<template>
  <div fixed right-3 top-3 z-20>
    <ControlButtonTooltip side="left">
      <ControlButton
        :button-style="buttonStyle.join(' ')"
        :aria-label="tooltipLabel"
        :title="tooltipLabel"
        @click="openSettings({ route: '/settings/connection' })"
      >
        <div :class="iconClasses" :style="flickerStyle" @animationiteration="onAnimationIteration" />
      </ControlButton>
      <template #tooltip>
        {{ tooltipLabel }}
      </template>
    </ControlButtonTooltip>
  </div>
</template>
