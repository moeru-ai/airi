<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { DockButton, lampFlickerAnimationClass } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronOpenSettings } from '../../../../shared/eventa'

const props = defineProps<{
  iconClass: string
}>()

const { t } = useI18n()
const { connected } = storeToRefs(useModsServerChannelStore())
const openSettings = useElectronEventaInvoke(electronOpenSettings)

const iconClasses = computed(() => {
  return [
    'i-mingcute:link-3-line',
    !connected.value && lampFlickerAnimationClass,
    props.iconClass,
    'shrink-0 transition-colors duration-300 ease-in-out',
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
  <DockButton :label="tooltipLabel" @click="openSettings({ route: '/settings/connection' })">
    <span :class="iconClasses" />
  </DockButton>
</template>
