<script setup lang="ts">
import type { DisplayModel } from '../../../../../stores/display-models'
import type { ModelSettingsRuntimeSnapshot } from '../runtime'

import { createLive2D, useLive2dParams, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { BottomDrawer, Button, Checkbox, ProgressiveBlur } from '@proj-airi/ui'
import { useTimeoutFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import MagicMotionSettings from '../../../../../features/motions/live2d/components/magic-settings.vue'
import Live2DExpressionList from '../live2d-expression-list.vue'
import ModelSettingsPreviewStage from '../preview-stage.vue'
import ModelStrip from './model-strip.vue'
import OptionSelect from './option-select.vue'
import Ruler from './ruler.vue'
import ToolPanel from './tool-panel.vue'

import { useSettingsFullBleed } from '../../../../../composables/settings-full-bleed'
import { useAiriCardStore } from '../../../../../stores/modules/airi-card'
import { useSettings } from '../../../../../stores/settings'
import { ColorPalette } from '../../../../widgets'
import { createEmptyModelSettingsRuntimeSnapshot } from '../runtime'
import { useLive2DModelSettings } from '../use-live2d-model-settings'

const props = withDefaults(defineProps<{
  palette: string[]
  allowExtractColors?: boolean
}>(), {
  allowExtractColors: true,
})

const emit = defineEmits<{
  extractColorsFromModel: []
}>()

type TabId = 'model' | 'placement' | 'motion' | 'look' | 'display'
type ToolId = 'model' | 'size' | 'position' | 'look-at' | 'eyes' | 'idle-motion' | 'motion-source' | 'expressions' | 'shadow' | 'theme-color' | 'frame-rate' | 'render-scale' | 'clear-cache'

const { t } = useI18n()

// The stage fills the whole screen, and the settings header floats over it.
useSettingsFullBleed()

const live2d = createLive2D()
onUnmounted(() => live2d.dispose())

const previewStageRef = ref<{ capturePreviewFrame: () => Promise<Blob | undefined> }>()
const runtimeSnapshot = ref<ModelSettingsRuntimeSnapshot>(createEmptyModelSettingsRuntimeSnapshot())

const settingsStore = useSettings()
const { stageModelSelected, stageModelSelectedDisplayModel } = storeToRefs(settingsStore)
const airiCardStore = useAiriCardStore()

const {
  live2dMotionDriver,
  live2dEyeTracking,
  live2dForceIdleEyeAnimation,
  live2dAutoBlinkEnabled,
  live2dIdleAnimationEnabled,
  live2dExpressionEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
  live2dRenderScale,
} = storeToRefs(useSettingsLive2d())
const { scale, position } = storeToRefs(useLive2dParams())

const {
  expressionItems,
  setExpressionPreview,
  setExpressionAvailableToAiri,
  runtimeMotionOptions,
  selectedRuntimeMotion,
  selectIdleMotion,
  blinkMode,
  clearingCache,
  clearModelCache,
  canExtractColors,
} = useLive2DModelSettings({
  runtimeSnapshot: () => runtimeSnapshot.value,
  live2dContext: () => live2d,
})

const tabs = computed(() => [
  { id: 'model' as const, label: t('settings.pages.models.editor.tabs.model'), icon: 'i-mingcute:user-3-line' },
  { id: 'placement' as const, label: t('settings.pages.models.editor.tabs.placement'), icon: 'i-mingcute:move-line' },
  { id: 'motion' as const, label: t('settings.pages.models.editor.tabs.motion'), icon: 'i-mingcute:walk-line' },
  { id: 'look' as const, label: t('settings.pages.models.editor.tabs.look'), icon: 'i-mingcute:emoji-line' },
  { id: 'display' as const, label: t('settings.pages.models.editor.tabs.display'), icon: 'i-mingcute:display-line' },
])

const toolsByTab = computed<Record<TabId, Array<{ id: ToolId, label: string, icon: string }>>>(() => ({
  model: [
    { id: 'model', label: t('settings.pages.models.editor.tabs.model'), icon: 'i-mingcute:user-3-line' },
  ],
  placement: [
    { id: 'size', label: t('settings.pages.models.editor.tools.size'), icon: 'i-mingcute:zoom-in-line' },
    { id: 'position', label: t('settings.pages.models.editor.tools.position'), icon: 'i-mingcute:move-line' },
  ],
  motion: [
    { id: 'look-at', label: t('settings.pages.models.editor.tools.look-at'), icon: 'i-mingcute:eye-2-line' },
    { id: 'eyes', label: t('settings.pages.models.editor.tools.eyes'), icon: 'i-mingcute:eye-close-line' },
    { id: 'idle-motion', label: t('settings.pages.models.editor.tools.idle-motion'), icon: 'i-mingcute:play-circle-line' },
    { id: 'motion-source', label: t('settings.pages.models.editor.tools.motion-source'), icon: 'i-mingcute:sparkles-line' },
  ],
  look: [
    { id: 'expressions', label: t('settings.pages.models.editor.tools.expressions'), icon: 'i-mingcute:emoji-2-line' },
    { id: 'shadow', label: t('settings.pages.models.editor.tools.shadow'), icon: 'i-mingcute:shadow-line' },
    ...(props.allowExtractColors
      ? [{ id: 'theme-color' as const, label: t('settings.pages.models.editor.tools.theme-color'), icon: 'i-mingcute:palette-line' }]
      : []),
  ],
  display: [
    { id: 'frame-rate', label: t('settings.live2d.parameters.fps.title'), icon: 'i-mingcute:dashboard-line' },
    { id: 'render-scale', label: t('settings.live2d.parameters.render-scale.title'), icon: 'i-mingcute:aspect-ratio-line' },
    { id: 'clear-cache', label: t('settings.live2d.clear-model-cache'), icon: 'i-mingcute:delete-2-line' },
  ],
}))

const activeTab = ref<TabId>('placement')
/** The tool that each tab shows. A tab keeps its tool when the user leaves and comes back. */
const activeToolByTab = ref<Record<TabId, ToolId>>({ model: 'model', placement: 'size', motion: 'look-at', look: 'expressions', display: 'frame-rate' })
const activeTabLabel = computed(() => tabs.value.find(tab => tab.id === activeTab.value)?.label ?? '')
const tools = computed(() => toolsByTab.value[activeTab.value])
/** The idle motion list replaces the tool content in place. It closes when the tab or the tool changes. */
const idleMotionListOpen = ref(false)
const activeTool = computed<ToolId>({
  get: () => activeToolByTab.value[activeTab.value],
  set(id) {
    activeToolByTab.value = { ...activeToolByTab.value, [activeTab.value]: id }
    idleMotionListOpen.value = false
  },
})

function selectTab(id: TabId) {
  activeTab.value = id
  idleMotionListOpen.value = false
}

const lookAt = computed<'cursor' | 'off'>({
  get: () => live2dEyeTracking.value ? 'cursor' : 'off',
  set: (value) => { live2dEyeTracking.value = value === 'cursor' },
})
const lookAtOptions = computed(() => [
  { value: 'cursor' as const, label: t('settings.pages.models.editor.look-at.options.cursor') },
  { value: 'off' as const, label: t('settings.pages.models.editor.look-at.options.off') },
])

/**
 * One choice for the two blink settings. `off` turns blinking off. `model` and `airi` turn it on with the
 * model's own blink or with AIRI's blink timer.
 */
const blink = computed<'off' | 'model' | 'airi'>({
  get() {
    if (!live2dAutoBlinkEnabled.value)
      return 'off'

    return blinkMode.value === 'force' ? 'airi' : 'model'
  },
  set(value) {
    if (value === 'off') {
      live2dAutoBlinkEnabled.value = false
      return
    }

    blinkMode.value = value === 'airi' ? 'force' : 'auto'
  },
})
const blinkOptions = computed(() => [
  { value: 'off' as const, label: t('settings.pages.models.editor.eyes.blink-options.off') },
  { value: 'model' as const, label: t('settings.pages.models.editor.eyes.blink-options.model') },
  { value: 'airi' as const, label: t('settings.pages.models.editor.eyes.blink-options.airi') },
])

/**
 * The tools whose values differ from the defaults. Their buttons show a dot. The defaults match the Live2D settings
 * store and the reset values of the rulers. The model, the theme color, and the cache tools have no default.
 */
const changedTools = computed(() => {
  const changed: Partial<Record<ToolId, boolean>> = {
    'size': scale.value !== 1,
    'position': position.value.x !== 0 || position.value.y !== 0,
    'look-at': !live2dEyeTracking.value,
    'eyes': !live2dForceIdleEyeAnimation.value || blink.value !== 'airi',
    'idle-motion': !live2dIdleAnimationEnabled.value,
    'motion-source': live2dMotionDriver.value !== 'universal',
    'expressions': live2dExpressionEnabled.value,
    'shadow': !live2dShadowEnabled.value,
    'frame-rate': live2dMaxFps.value !== 0,
    'render-scale': live2dRenderScale.value !== 2,
  }
  return changed
})
const panelTools = computed(() => tools.value.map(tool => ({ ...tool, changed: changedTools.value[tool.id] ?? false })))

const motionDriverOptions = computed(() => [
  { value: 'universal' as const, label: t('settings.live2d.animation.motion-driver.options.universal.title') },
  { value: 'magic' as const, label: t('settings.live2d.animation.motion-driver.options.magic.title') },
])

const selectedIdleMotionLabel = computed(() => runtimeMotionOptions.value
  .find(option => option.value === selectedRuntimeMotion.value)
  ?.label
  ?? t('settings.live2d.animation.idle-motion.placeholder'))

function pickIdleMotion(value: string) {
  selectIdleMotion(value)
  idleMotionListOpen.value = false
}

const frameRateOptions = computed(() => [
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 0, label: t('settings.live2d.parameters.fps.options.unlimited') },
])
const renderScaleOptions = [0.5, 1, 1.5, 2].map(value => ({ value, label: `${value}×` }))

const formatScale = (value: number) => `${value.toFixed(2)}×`
const formatOffset = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}%`

/**
 * Dragging the character on the stage moves it. The model position is stored as a percent of the stage size,
 * so the pointer movement is divided by the size of the drag surface, which covers the same area as the canvas.
 * Screen Y grows downward and model Y grows upward, so the vertical movement is inverted.
 */
const stageDrag = ref<{ pointerId: number, startX: number, startY: number, width: number, height: number, origin: { x: number, y: number } }>()

function onStagePointerDown(event: PointerEvent) {
  const surface = event.currentTarget as HTMLElement
  surface.setPointerCapture(event.pointerId)
  const rect = surface.getBoundingClientRect()
  stageDrag.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    width: rect.width,
    height: rect.height,
    origin: { x: position.value.x, y: position.value.y },
  }
}

function onStagePointerMove(event: PointerEvent) {
  const drag = stageDrag.value
  if (drag?.pointerId !== event.pointerId)
    return

  position.value = {
    x: Math.round(drag.origin.x + ((event.clientX - drag.startX) / drag.width) * 100),
    y: Math.round(drag.origin.y - ((event.clientY - drag.startY) / drag.height) * 100),
  }
}

/**
 * After a pick, the model name shows over the stage, because the thumbnails have no names.
 * It stays while the stage loads the model, then hides after a moment.
 */
const pickedModelName = ref('')
/** The model that the stage loads after a pick. It is cleared when the stage shows the model. */
const loadingModelId = ref<string>()
const { start: hidePickedModelNameLater, stop: keepPickedModelName } = useTimeoutFn(() => {
  pickedModelName.value = ''
}, 1600, { immediate: false })

watch(() => runtimeSnapshot.value.phase, (phase) => {
  if (phase !== 'mounted' && phase !== 'error')
    return

  loadingModelId.value = undefined
  hidePickedModelNameLater()
})

async function pickModel(selectedModel: DisplayModel | undefined) {
  stageModelSelected.value = selectedModel?.id ?? ''
  pickedModelName.value = selectedModel?.name ?? ''
  loadingModelId.value = selectedModel?.id
  keepPickedModelName()
  await airiCardStore.setActiveCardDefaultAvatarModel(selectedModel?.id)
  await settingsStore.updateStageModel()
}

const clearCacheConfirmOpen = ref(false)

async function confirmClearCache() {
  await clearModelCache()
  clearCacheConfirmOpen.value = false
}

defineExpose({
  capturePreviewFrame: () => previewStageRef.value?.capturePreviewFrame(),
})
</script>

<template>
  <div :class="['relative isolate h-full min-h-120 overflow-hidden']">
    <ModelSettingsPreviewStage
      ref="previewStageRef"
      :live2d-context="live2d"
      :live2d-scene-class="['absolute inset-0']"
      @runtime-snapshot-changed="runtimeSnapshot = $event"
    />

    <div
      v-if="activeTab === 'placement'"
      aria-hidden="true"
      :class="['absolute inset-0 cursor-grab touch-none']"
      @pointerdown="onStagePointerDown"
      @pointermove="onStagePointerMove"
      @pointerup="stageDrag = undefined"
      @pointercancel="stageDrag = undefined"
    />

    <section
      :aria-label="activeTabLabel"
      :class="[
        'absolute inset-x-0 bottom-0 isolate',
        'flex flex-col-reverse gap-3',
        'pb-[calc(16px+env(safe-area-inset-bottom,0px))]',
      ]"
    >
      <Transition
        enter-active-class="transition-opacity duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-300 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="pickedModelName"
          aria-live="polite"
          :class="[
            'pointer-events-none absolute left-1/2 -top-12 max-w-[calc(100%-48px)] -translate-x-1/2',
            'truncate rounded-full px-3.5 py-1.5',
            'text-sm font-medium text-neutral-900 dark:text-neutral-50',
            'bg-neutral-50/70 backdrop-blur-md dark:bg-neutral-900/70',
          ]"
        >
          <span v-if="loadingModelId" aria-hidden="true" :class="['i-mingcute:loading-3-line mr-1.5 inline-block size-3.5 animate-spin align-[-2px]']" />
          {{ pickedModelName }}
        </div>
      </Transition>

      <!-- The stage shows through the controls with a blur that grows toward the bottom edge. It reaches above the controls to fade in softly. -->
      <div aria-hidden="true" :class="['pointer-events-none absolute inset-x-0 bottom-0 -top-16 -z-1']">
        <ProgressiveBlur edge="bottom" :strength="16" />
        <div :class="['absolute inset-0 bg-gradient-to-b from-transparent to-neutral-50/60 dark:to-neutral-950/60']" />
      </div>

      <nav
        role="tablist"
        :class="[
          'mx-3 flex gap-0.5 rounded-full p-1',
          'bg-neutral-50/70 backdrop-blur-md dark:bg-neutral-900/70',
        ]"
      >
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :class="[
            'h-12 min-w-0 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1',
            'text-[11px] font-medium transition-colors duration-200',
            'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
            activeTab === tab.id
              ? 'bg-primary-500/15 text-primary-700 dark:bg-primary-400/15 dark:text-primary-200'
              : 'text-neutral-600 hover:bg-primary-500/10 dark:text-neutral-300',
          ]"
          @click="selectTab(tab.id)"
        >
          <span :class="[tab.icon, 'size-5']" />
          <span :class="['max-w-full truncate']">{{ tab.label }}</span>
        </button>
      </nav>

      <ToolPanel v-model="activeTool" :label="activeTabLabel" :tools="panelTools">
        <template #model>
          <ModelStrip :selected-id="stageModelSelectedDisplayModel?.id" :loading-id="loadingModelId" @pick="pickModel" />
        </template>

        <template #size>
          <Ruler
            v-model="scale"
            :label="t('settings.pages.models.editor.tools.size')"
            :min="0.1"
            :max="3"
            :step="0.01"
            :default-value="1"
            :format="formatScale"
          />
        </template>

        <template #position>
          <div :class="['flex flex-col gap-0.5']">
            <span :class="['text-sm font-semibold text-neutral-900 dark:text-neutral-50']">
              {{ t('settings.pages.models.editor.tools.position') }}
            </span>
            <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
              {{ t('settings.pages.models.editor.position.description') }}
            </span>
          </div>
          <Ruler
            v-model="position.x"
            :label="t('settings.pages.models.editor.position.horizontal')"
            :min="-100"
            :max="100"
            :step="1"
            :default-value="0"
            :format="formatOffset"
          />
          <Ruler
            v-model="position.y"
            :label="t('settings.pages.models.editor.position.vertical')"
            :min="-100"
            :max="100"
            :step="1"
            :default-value="0"
            :format="formatOffset"
          />
        </template>

        <template #look-at>
          <OptionSelect
            v-model="lookAt"
            :label="t('settings.pages.models.editor.look-at.title')"
            :options="lookAtOptions"
          />
        </template>

        <template #eyes>
          <label :class="['flex items-center gap-3 px-1']">
            <span :class="['flex-1 text-sm font-medium text-neutral-700 dark:text-neutral-200']">
              {{ t('settings.pages.models.editor.eyes.look-around') }}
            </span>
            <Checkbox v-model="live2dForceIdleEyeAnimation" :disabled="live2dMotionDriver === 'magic'" />
          </label>
          <OptionSelect v-model="blink" :label="t('settings.pages.models.editor.eyes.blink')" :options="blinkOptions" />
        </template>

        <template #idle-motion>
          <div v-if="idleMotionListOpen" :class="['flex flex-col gap-1']">
            <div :class="['grid grid-cols-[1fr_auto_1fr] items-center']">
              <button
                type="button"
                :class="['justify-self-start flex items-center gap-0.5 rounded-lg px-1 py-1.5', 'text-sm text-primary-600 dark:text-primary-300']"
                @click="idleMotionListOpen = false"
              >
                <span :class="['i-mingcute:left-line size-4']" />
                {{ t('settings.pages.models.editor.back') }}
              </button>
              <span :class="['text-sm font-semibold']">{{ t('settings.pages.models.editor.tools.idle-motion') }}</span>
              <span />
            </div>
            <div role="radiogroup" :aria-label="t('settings.pages.models.editor.tools.idle-motion')" :class="['max-h-56 overflow-y-auto']">
              <button
                v-for="option in runtimeMotionOptions"
                :key="option.value"
                type="button"
                role="radio"
                :aria-checked="option.value === selectedRuntimeMotion"
                :class="['w-full min-h-11 flex items-center gap-2 rounded-lg px-1 text-left text-sm']"
                @click="pickIdleMotion(option.value)"
              >
                <span :class="['size-5 shrink-0 text-primary-600 dark:text-primary-300', option.value === selectedRuntimeMotion ? 'i-mingcute:check-line' : '']" />
                <span :class="['truncate']">{{ option.label }}</span>
              </button>
            </div>
          </div>
          <p v-else-if="runtimeMotionOptions.length === 0" :class="['px-1 text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.live2d.animation.idle-motion.no-motion') }}
          </p>
          <button
            v-else
            type="button"
            :disabled="live2dMotionDriver === 'magic'"
            :class="[
              'min-h-11 flex items-center gap-2 rounded-xl px-1',
              'transition-colors duration-200 hover:bg-primary-500/10',
              'disabled:opacity-50',
            ]"
            @click="idleMotionListOpen = true"
          >
            <span :class="['flex-1 text-left text-sm font-medium text-neutral-700 dark:text-neutral-200']">
              {{ t('settings.pages.models.editor.tools.idle-motion') }}
            </span>
            <span :class="['truncate text-sm text-neutral-900 dark:text-neutral-50']">{{ selectedIdleMotionLabel }}</span>
            <span :class="['i-mingcute:right-line size-4 text-neutral-400']" />
          </button>
        </template>

        <template #motion-source>
          <OptionSelect
            v-model="live2dMotionDriver"
            :label="t('settings.pages.models.editor.tools.motion-source')"
            :options="motionDriverOptions"
          />
          <MagicMotionSettings v-if="live2dMotionDriver === 'magic'" />
        </template>

        <template #expressions>
          <label :class="['flex items-center gap-3 px-1']">
            <span :class="['flex-1 text-sm font-medium text-neutral-700 dark:text-neutral-200']">
              {{ t('settings.live2d.expressions.override-toggle') }}
            </span>
            <Checkbox v-model="live2dExpressionEnabled" />
          </label>
          <p v-if="expressionItems.length === 0" :class="['px-1 text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('settings.live2d.expressions.no-expression') }}
          </p>
          <div v-else :class="['max-h-56 overflow-y-auto']">
            <Live2DExpressionList
              :items="expressionItems"
              @set-active="setExpressionPreview"
              @set-available-to-airi="setExpressionAvailableToAiri"
            />
          </div>
        </template>

        <template #shadow>
          <label :class="['flex items-center gap-3 px-1']">
            <span :class="['flex-1 text-sm font-medium text-neutral-700 dark:text-neutral-200']">
              {{ t('settings.live2d.parameters.shadow') }}
            </span>
            <Checkbox v-model="live2dShadowEnabled" />
          </label>
        </template>

        <template #frame-rate>
          <OptionSelect
            v-model="live2dMaxFps"
            :label="t('settings.live2d.parameters.fps.title')"
            :options="frameRateOptions"
          />
        </template>

        <template #render-scale>
          <OptionSelect
            v-model="live2dRenderScale"
            :label="t('settings.live2d.parameters.render-scale.title')"
            :options="renderScaleOptions"
          />
        </template>

        <template #clear-cache>
          <div :class="['flex items-center gap-3']">
            <span :class="['flex-1 text-sm text-neutral-600 dark:text-neutral-300']">
              {{ t('settings.pages.models.editor.clear-cache-confirm.description') }}
            </span>
            <Button size="sm" color="red" shape="rounded" :outline="false" @click="clearCacheConfirmOpen = true">
              {{ t('settings.pages.models.editor.clear-cache-confirm.confirm') }}
            </Button>
          </div>
        </template>

        <template #theme-color>
          <ColorPalette :colors="palette.map(hex => ({ hex, name: hex }))" />
          <Button color="primary" shape="rounded" :outline="false" :disabled="!canExtractColors" @click="emit('extractColorsFromModel')">
            {{ t('settings.live2d.theme-color-from-model.button-extract.title') }}
          </Button>
        </template>
      </ToolPanel>
    </section>

    <BottomDrawer v-model="clearCacheConfirmOpen" :title="t('settings.pages.models.editor.clear-cache-confirm.title')">
      <div :class="['flex flex-col gap-4 pb-2']">
        <p :class="['text-sm text-neutral-600 dark:text-neutral-300']">
          {{ t('settings.pages.models.editor.clear-cache-confirm.description') }}
        </p>
        <div :class="['flex justify-end gap-2']">
          <Button @click="clearCacheConfirmOpen = false">
            {{ t('settings.pages.models.editor.clear-cache-confirm.cancel') }}
          </Button>
          <Button color="red" variant="primary" :loading="clearingCache" @click="confirmClearCache">
            {{ t('settings.pages.models.editor.clear-cache-confirm.confirm') }}
          </Button>
        </div>
      </div>
    </BottomDrawer>
  </div>
</template>
