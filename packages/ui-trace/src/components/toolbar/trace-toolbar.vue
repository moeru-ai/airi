<script setup lang="ts">
import { UtilityButton } from '@proj-airi/ui'
import { TooltipProvider } from 'reka-ui'
import { useI18n } from 'vue-i18n'

/**
 * The toolbar of the timeline. Recording controls are on the left, after the `leading` slot of the host. View
 * controls and the export are on the right.
 */
defineProps<{
  recording: boolean
  following: boolean
  /** The scrub cursor is set, so it can clear. */
  hasCursor: boolean
}>()

const emit = defineEmits<{
  toggleRecording: []
  startFromNow: []
  toggleFollow: []
  fit: []
  clearCursor: []
  export: []
}>()

const { t } = useI18n()
const key = (name: string) => `tamagotchi.settings.devtools.pages.io-tracer.${name}`
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div :class="['flex shrink-0 items-center gap-1 px-1.5 py-1', 'border-b border-neutral-200 dark:border-neutral-800']">
      <slot name="leading" />
      <UtilityButton
        :icon="recording ? 'i-mingcute:pause-fill' : 'i-mingcute:radiobox-fill'"
        :icon-class="recording ? '' : 'text-red-500'"
        :label="recording ? t(key('actions.pause')) : t(key('actions.record'))"
        :pressed="recording"
        @click="emit('toggleRecording')"
      />
      <UtilityButton
        icon="i-mingcute:refresh-anticlockwise-1-line"
        :label="t(key('actions.start-from-now'))"
        :description="t(key('actions.start-from-now-description'))"
        @click="emit('startFromNow')"
      />

      <div :class="['flex-1']" />

      <UtilityButton
        icon="i-mingcute:live-line"
        :label="t(key('toggles.follow'))"
        :pressed="following"
        :disabled="!recording"
        @click="emit('toggleFollow')"
      />
      <UtilityButton icon="i-mingcute:fullscreen-line" :label="t(key('actions.fit'))" @click="emit('fit')" />
      <UtilityButton icon="i-mingcute:eraser-line" :label="t(key('actions.clear-cursor'))" :disabled="!hasCursor" @click="emit('clearCursor')" />
      <UtilityButton icon="i-mingcute:download-2-line" :label="t(key('actions.export'))" @click="emit('export')" />
    </div>
  </TooltipProvider>
</template>
