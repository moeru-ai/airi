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

const props = defineProps<{
  buttonStyle: string
  iconClass: string
}>()

const { t } = useI18n()
const { connected } = storeToRefs(useModsServerChannelStore())
const openSettings = useElectronEventaInvoke(electronOpenSettings)

const { flickerStyle, onAnimationIteration } = useLampFlickerAnimation(() => !connected.value)

const iconClasses = computed(() => {
  return [
    'i-mingcute:link-3-line',
    !connected.value && lampFlickerAnimationClass,
    props.iconClass,
    'shrink-0 text-neutral-800 transition-colors duration-300 ease-in-out dark:text-neutral-300',
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
  <ControlButtonTooltip side="inward">
    <ControlButton
      :button-style="props.buttonStyle"
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
</template>
