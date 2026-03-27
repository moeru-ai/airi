<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from '../controls-island/control-button-tooltip.vue'
import ControlButton from '../controls-island/control-button.vue'

import { electronOpenSettings } from '../../../../shared/eventa'

const { t, te } = useI18n()
const { connected } = storeToRefs(useModsServerChannelStore())
const openSettings = useElectronEventaInvoke(electronOpenSettings)
const flickerDuration = ref('6.4s')
const flickerDelay = ref('0s')

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
    connected.value ? 'i-ph:wifi-high' : 'i-ph:wifi-slash status-island-lamp-flicker',
    statusIslandSize.icon,
    'shrink-0 transition-colors duration-300 ease-in-out',
    connected.value
      ? 'text-emerald-600 dark:text-emerald-300'
      : 'text-amber-600 dark:text-amber-300',
  ]
})

const iconStyle = computed(() => {
  if (connected.value) {
    return undefined
  }

  return {
    '--status-island-flicker-delay': flickerDelay.value,
    '--status-island-flicker-duration': flickerDuration.value,
  }
})

const buttonLabel = computed(() => {
  if (connected.value) {
    return te('tamagotchi.stage.status-island.connected')
      ? t('tamagotchi.stage.status-island.connected')
      : 'WebSocket connected'
  }

  return te('tamagotchi.stage.status-island.disconnected')
    ? t('tamagotchi.stage.status-island.disconnected')
    : 'WebSocket disconnected'
})

const tooltipLabel = computed(() => {
  const openSettingsLabel = te('tamagotchi.stage.status-island.open-settings')
    ? t('tamagotchi.stage.status-island.open-settings')
    : 'Open WebSocket settings'

  return `${buttonLabel.value}. ${openSettingsLabel}`
})

function randomizeFlicker(resetPhase = false) {
  flickerDuration.value = `${(5.8 + Math.random() * 1.8).toFixed(2)}s`

  if (resetPhase) {
    flickerDelay.value = `${(-Math.random() * 5.4).toFixed(2)}s`
    return
  }

  flickerDelay.value = '0s'
}

function handleFlickerIteration() {
  if (!connected.value) {
    randomizeFlicker()
  }
}

watch(connected, (isConnected) => {
  if (isConnected) {
    flickerDelay.value = '0s'
    return
  }

  randomizeFlicker(true)
}, { immediate: true })
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
        <div :class="iconClasses" :style="iconStyle" @animationiteration="handleFlickerIteration" />
      </ControlButton>
      <template #tooltip>
        {{ tooltipLabel }}
      </template>
    </ControlButtonTooltip>
  </div>
</template>

<style scoped>
@keyframes status-island-lamp-flicker {
  0%,
  6%,
  22%,
  33%,
  52%,
  68%,
  86%,
  100% {
    opacity: 1;
  }

  3% {
    opacity: 0.74;
  }

  9% {
    opacity: 0.92;
  }

  13% {
    opacity: 0.38;
  }

  18% {
    opacity: 0.58;
  }

  27% {
    opacity: 0.44;
  }

  29% {
    opacity: 0.84;
  }

  41% {
    opacity: 0.42;
  }

  45% {
    opacity: 0.88;
  }

  57% {
    opacity: 0.62;
  }

  61% {
    opacity: 0.8;
  }

  73% {
    opacity: 0.36;
  }

  74.4% {
    opacity: 0.08;
  }

  75.2% {
    opacity: 0.82;
  }

  78% {
    opacity: 0.94;
  }

  91% {
    opacity: 0.52;
  }
}

.status-island-lamp-flicker {
  animation-delay: var(--status-island-flicker-delay, 0s);
  animation-duration: var(--status-island-flicker-duration, 6.4s);
  animation-iteration-count: infinite;
  animation-name: status-island-lamp-flicker;
  animation-timing-function: ease-in-out;
  filter: drop-shadow(0 0 0.14rem rgb(251 191 36 / 0.18));
  will-change: opacity;
}
</style>
