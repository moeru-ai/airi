<script setup lang="ts">
import { useLampFlickerAnimation } from '@proj-airi/stage-ui/composables/use-lamp-flicker-animation'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { lampFlickerAnimationClass } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
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
  <div
    class="fixed right-3 z-20"
    :style="{ top: 'max(0.75rem, env(safe-area-inset-top, 0px))' }"
  >
    <TooltipProvider :delay-duration="0" :skip-delay-duration="0">
      <TooltipRoot>
        <TooltipTrigger as-child>
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
        </TooltipTrigger>
        <Transition name="pocket-ws-tooltip-fade">
          <TooltipContent
            :class="[
              'border border-solid border-neutral-200/60 dark:border-neutral-800/10',
              'bg-neutral-50/80 dark:bg-neutral-800/70',
              'w-fit flex items-center px-1.5 py-1 rounded-lg backdrop-blur-md text-xs',
            ]"
            side="left"
            :side-offset="4"
          >
            {{ tooltipLabel }}
          </TooltipContent>
        </Transition>
      </TooltipRoot>
    </TooltipProvider>
  </div>
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
