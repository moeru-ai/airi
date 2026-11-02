<script setup lang="ts">
import type {
  Live2DMotionEditableTrackId,
  Live2DMotionOverlay,
  Live2DMotionOverlayBlendMode,
  Live2DMotionProject,
} from '../composables/keyframes'

import { BasicButton, Range, Select } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { isLive2DMotionViewTargetTrackId } from '../composables/keyframes'
import { motionOverlayColor } from '../composables/timeline-draw'

/**
 * The label of one track in the label column of the motion timeline: the track name, its overlays, and on the active
 * track the controls of the selected overlay. The timeline draws the curves of the track in the lanes beside it.
 */
const props = defineProps<{
  project: Live2DMotionProject
  trackId: Live2DMotionEditableTrackId
  label: string
  active: boolean
  selectedOverlayId?: string
  disabled?: boolean
}>()
const emit = defineEmits<{
  activate: []
  addOverlay: [blendMode: Live2DMotionOverlayBlendMode]
  selectOverlay: [overlayId: string]
  removeOverlay: [overlayId: string]
  updateOverlay: [overlayId: string, patch: Partial<Live2DMotionOverlay>, commit: boolean]
}>()
const { t } = useI18n()

const overlays = computed(() => props.project.overlays.filter(overlay => overlay.trackId === props.trackId))
const selectedOverlay = computed(() => overlays.value.find(overlay => overlay.id === props.selectedOverlayId))
const viewTargetTrack = computed(() => isLive2DMotionViewTargetTrackId(props.trackId))
const blendOptions = [
  { label: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.add'), value: 'add' as const },
  { label: t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.replace'), value: 'replace' as const },
]

function updateWeight(value: number) {
  if (selectedOverlay.value)
    emit('updateOverlay', selectedOverlay.value.id, { weight: value }, true)
}

function updateBlendMode(value: Live2DMotionOverlayBlendMode | undefined) {
  if (selectedOverlay.value && value)
    emit('updateOverlay', selectedOverlay.value.id, { blendMode: value }, true)
}
</script>

<template>
  <div
    :class="[
      'box-border flex flex-col items-stretch gap-2 overflow-y-auto px-3 py-2 transition-colors',
      active ? 'bg-primary-50/60 dark:bg-primary-950/30' : '',
    ]"
    @click="emit('activate')"
  >
    <button
      type="button"
      :aria-expanded="active"
      :class="[
        'flex items-center gap-1.5 -mx-1.5 rounded-md border-none px-1.5 py-0.5 text-left text-sm font-semibold',
        'bg-transparent hover:bg-neutral-200/60 dark:hover:bg-neutral-800/70 transition-colors',
        'text-neutral-800 dark:text-neutral-100',
        'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
      ]"
      @click.stop="emit('activate')"
    >
      <span :class="[active ? 'i-mingcute:down-line' : 'i-mingcute:right-line', 'size-3.5 shrink-0 text-neutral-400']" />
      <span :class="['truncate']">{{ label }}</span>
    </button>

    <div v-if="overlays.length" :class="['flex flex-col gap-1']">
      <button
        v-for="overlay in overlays"
        :key="overlay.id"
        type="button"
        :aria-pressed="overlay.id === selectedOverlayId"
        :class="[
          'truncate rounded-md border-none px-2 py-1 text-left text-xs font-medium transition-opacity',
          overlay.id === selectedOverlayId ? '' : 'opacity-70 hover:opacity-100',
        ]"
        :style="{
          backgroundColor: `${motionOverlayColor(project, overlay.id)}${overlay.id === selectedOverlayId ? '33' : '1a'}`,
          color: motionOverlayColor(project, overlay.id),
        }"
        @click.stop="emit('selectOverlay', overlay.id)"
      >
        {{ viewTargetTrack ? label : `${overlay.name} · ${overlay.blendMode}` }}
      </button>
    </div>

    <div v-if="active" :class="['grid grid-cols-2 gap-1']">
      <template v-if="viewTargetTrack">
        <BasicButton size="sm" :disabled="disabled || overlays.length > 0" :class="['col-span-2 min-w-0 px-1!']" @click.stop="emit('addOverlay', 'replace')">
          <span :class="['i-mingcute:add-circle-line']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.create-keyframes') }}
        </BasicButton>
      </template>
      <template v-else>
        <BasicButton size="sm" :disabled="disabled" :class="['min-w-0 px-1!']" @click.stop="emit('addOverlay', 'add')">
          <span :class="['i-mingcute:add-circle-line']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.add') }}
        </BasicButton>
        <BasicButton size="sm" :disabled="disabled" :class="['min-w-0 px-1!']" @click.stop="emit('addOverlay', 'replace')">
          <span :class="['i-mingcute:add-circle-line']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.replace') }}
        </BasicButton>
      </template>
    </div>

    <div v-if="active && selectedOverlay" :class="['flex flex-col gap-2 pt-1']" @click.stop>
      <template v-if="!viewTargetTrack">
        <Select
          :model-value="selectedOverlay.blendMode"
          :options="blendOptions"
          :disabled="disabled"
          :class="['w-full!']"
          @update:model-value="updateBlendMode"
        />
        <label :class="['flex flex-col gap-1 text-xs text-neutral-500']">
          <span>{{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.weight') }} {{ selectedOverlay.weight.toFixed(2) }}</span>
          <Range
            :model-value="selectedOverlay.weight"
            :min="0"
            :max="1"
            :step="0.05"
            :disabled="disabled"
            @update:model-value="updateWeight"
          />
        </label>
        <span :class="['font-mono text-xs text-neutral-500']">
          {{ (selectedOverlay.startMs / 1000).toFixed(2) }}s–{{ (selectedOverlay.endMs / 1000).toFixed(2) }}s
        </span>
      </template>
      <BasicButton size="sm" :disabled="disabled" :class="['w-full']" @click="emit('removeOverlay', selectedOverlay.id)">
        <span :class="['i-mingcute:delete-2-line']" /> {{ t('tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.remove') }}
      </BasicButton>
    </div>
  </div>
</template>
