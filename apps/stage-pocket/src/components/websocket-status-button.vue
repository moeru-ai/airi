<script setup lang="ts">
import { useLampFlickerAnimation } from '@proj-airi/stage-ui/composables/use-lamp-flicker-animation'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { lampFlickerAnimationClass } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const { connected } = storeToRefs(useModsServerChannelStore())

const { flickerStyle, onAnimationIteration } = useLampFlickerAnimation(() => !connected.value)

const statusSize = {
  border: 'border-2',
  icon: 'size-6',
  padding: 'p-2.5',
} as const

const buttonClass = computed(() => {
  return [
    statusSize.border,
    statusSize.padding,
    'transition-all duration-300 ease-in-out',
    'border-solid rounded-xl backdrop-blur-md',
    'w-fit flex items-center self-end justify-center',
    connected.value
      ? 'border-emerald-200/60 bg-white/85 hover:bg-emerald-50/90 dark:border-emerald-400/15 dark:bg-neutral-900/75 dark:hover:bg-neutral-900/88'
      : 'border-amber-300/80 bg-amber-50/90 hover:bg-amber-100/90 dark:border-amber-400/30 dark:bg-amber-950/25 dark:hover:bg-amber-950/38',
  ]
})

const iconClasses = computed(() => {
  return [
    connected.value ? 'i-ph:wifi-high' : `i-ph:wifi-slash ${lampFlickerAnimationClass}`,
    statusSize.icon,
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

function openConnectionSettings() {
  void router.push('/settings/connection')
}
</script>

<template>
  <button
    type="button"
    :class="buttonClass"
    :aria-label="tooltipLabel"
    :title="tooltipLabel"
    @click="openConnectionSettings"
  >
    <div
      :class="iconClasses"
      :style="flickerStyle"
      @animationiteration="onAnimationIteration"
    />
  </button>
</template>

<style scoped>
.pocket-ws-tooltip-fade-enter-active,
.pocket-ws-tooltip-fade-leave-active {
  transition: opacity 0.2s ease-in-out;
}

.pocket-ws-tooltip-fade-enter-from,
.pocket-ws-tooltip-fade-leave-to {
  opacity: 0;
}

.pocket-ws-tooltip-fade-enter-to,
.pocket-ws-tooltip-fade-leave-from {
  opacity: 1;
}
</style>
