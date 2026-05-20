<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { defaultModelParameters, useExpressionStore, useLive2dParams, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { OPFSCache } from '@proj-airi/stage-ui-live2d/utils/opfs-loader'
import { Button, Checkbox, FieldCheckbox, FieldCombobox, FieldRange, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { PropertyPoint } from '../../../data-pane'
import { Section } from '../../../layouts'
import { ColorPalette } from '../../../widgets'

const props = withDefaults(defineProps<{
  palette: string[]
  allowExtractColors?: boolean
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
}>(), {
  allowExtractColors: true,
})
defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const settings = useSettingsLive2d()
const {
  live2dEyeTracking,
  live2dModelEyeOffset,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dExpressionEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
  live2dRenderScale,
  live2dForceIdleEyeAnimation,
} = storeToRefs(settings)

const live2d = useLive2dParams()
const {
  scale,
  position,
  modelParameters,
  currentMotion,
} = storeToRefs(live2d)

const expressionStore = useExpressionStore()
const { expressions, expressionGroups } = storeToRefs(expressionStore)

/**
 * Check if an expression group is currently active.
 * Only considers non-zero exp3 params (zero-valued params are "reset" instructions).
 * A group is active when at least one of its activation params matches the exp3 value.
 */
function isGroupActive(group: { parameters: { parameterId: string, value: number }[] }): boolean {
  return group.parameters.some((p) => {
    if (p.value === 0)
      return false // Skip reset params
    const entry = expressions.value.get(p.parameterId)
    return entry != null && entry.currentValue === p.value
  })
}

const selectedRuntimeMotion = ref<string>('')
const runtimeMotions = ref<Array<{ name: string, displayPath: string, group: string, index: number }>>([])
const canExtractColors = computed(() => props.runtimeSnapshot.canCapturePreview)
const runtimeMotionOptions = computed(() => {
  const options = runtimeMotions.value.map(motion => ({
    label: motion.name,
    value: motion.displayPath,
    description: motion.displayPath,
  }))
  if (options.length > 0) {
    options.unshift({
      label: t('settings.live2d.animation.idle-motion.disable-motion'),
      value: '<motion disabled>',
      description: t('settings.live2d.animation.idle-motion.disable-motion-description'),
    })
  }
  return options
})
const fpsOptions = computed(() => [
  { value: 30, label: '30' },
  { value: 60, label: '60' },
  { value: 0, label: t('settings.live2d.parameters.fps.options.unlimited') },
])
const blinkModeOptions = computed(() => [
  {
    value: 'auto',
    label: t('settings.live2d.animation.auto-blink.title'),
    description: t('settings.live2d.animation.auto-blink.description'),
  },
  {
    value: 'force',
    label: t('settings.live2d.animation.force-auto-blink.title'),
    description: t('settings.live2d.animation.force-auto-blink.description'),
  },
])
const live2dBlinkMode = computed<'auto' | 'force'>({
  get() {
    return live2dForceAutoBlinkEnabled.value ? 'force' : 'auto'
  },
  set(mode) {
    live2dAutoBlinkEnabled.value = true
    live2dForceAutoBlinkEnabled.value = mode === 'force'
  },
})

watch(() => live2d.availableMotions, (motions) => {
  runtimeMotions.value = motions.map(m => ({
    name: m.fileName.split('/').pop() || m.fileName,
    displayPath: m.fileName,
    group: m.motionName,
    index: m.motionIndex,
  }))

  console.info('Available motions:', runtimeMotions.value)
}, { immediate: true })

const llmModeOptions = computed(() => [
  { value: 'none', label: t('settings.live2d.expressions.expose-to-llm-options.none') },
  { value: 'all', label: t('settings.live2d.expressions.expose-to-llm-options.all') },
  { value: 'custom', label: t('settings.live2d.expressions.expose-to-llm-options.custom') },
])

// Get available runtime motions from the model
onMounted(() => {
  // Restore selected motion
  const savedPath = localStorage.getItem('selected-runtime-motion')
  if (savedPath) {
    selectedRuntimeMotion.value = savedPath
  }
})

// Function to reset all parameters to default values
function resetToDefaultParameters() {
  modelParameters.value = { ...defaultModelParameters }
}

const clearingCache = ref(false)

async function clearModelCache() {
  clearingCache.value = true
  try {
    await OPFSCache.clearAll()
  }
  finally {
    clearingCache.value = false
  }
}

function handleMotionSelect(selectedMotionPath: string | number | undefined) {
  if (typeof selectedMotionPath !== 'string') {
    return
  }

  const motion = runtimeMotions.value.find(item => item.displayPath === selectedMotionPath)
  if (!motion) {
    live2dIdleAnimationEnabled.value = false
    return
  }

  localStorage.setItem('selected-runtime-motion', motion.displayPath)
  localStorage.setItem('selected-runtime-motion-group', motion.group)
  localStorage.setItem('selected-runtime-motion-index', motion.index.toString())

  // Enable idle animation
  live2dIdleAnimationEnabled.value = true

  // Set the current motion to the selected runtime motion
  currentMotion.value = { group: motion.group, index: motion.index }

  console.info('Selected runtime motion:', motion.name)
  console.info('Full path:', motion.displayPath)
  console.info('Group:', motion.group, 'Index:', motion.index)
}

// async function patchMotionMap(source: File, motionMap: Record<string, string>): Promise<File> {
//   if (!Object.keys(motionMap).length)
//     return source

//   const jsZip = new JSZip()
//   const zip = await jsZip.loadAsync(source)
//   const fileName = Object.keys(zip.files).find(key => key.endsWith('model3.json'))
//   if (!fileName) {
//     throw new Error('model3.json not found')
//   }

//   const model3Json = await zip.file(fileName)!.async('string')
//   const model3JsonObject = JSON.parse(model3Json)

//   const motions: Record<string, { File: string }[]> = {}
//   Object.entries(motionMap).forEach(([key, value]) => {
//     if (motions[value]) {
//       motions[value].push({ File: key })
//       return
//     }
//     motions[value] = [{ File: key }]
//   })

//   model3JsonObject.FileReferences.Motions = motions

//   zip.file(fileName, JSON.stringify(model3JsonObject, null, 2))
//   const zipBlob = await zip.generateAsync({ type: 'blob' })

//   return new File([zipBlob], source.name, {
//     type: source.type,
//     lastModified: source.lastModified,
//   })
// }

// async function saveMotionMap() {
//   const fileFromIndexedDB = await localforage.getItem<File>('live2dModel')
//   if (!fileFromIndexedDB) {
//     return
//   }

//   const patchedFile = await patchMotionMap(fileFromIndexedDB, motionMap.value)
//   modelFile.value = patchedFile
// }
</script>

<template>
  <Section
    :title="t('settings.live2d.scale-and-position.title')"
    icon="i-solar:scale-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="true"
  >
    <FieldRange v-model="scale" as="div" :min="0.1" :max="3" :step="0.01" :label="t('settings.live2d.scale-and-position.scale')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.live2d.scale-and-position.scale') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => scale = 1">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="position.x" as="div" :min="-3000" :max="3000" :step="1" :label="t('settings.live2d.scale-and-position.x')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.live2d.scale-and-position.x') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => position.x = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="position.y" as="div" :min="-3000" :max="3000" :step="1" :label="t('settings.live2d.scale-and-position.y')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.live2d.scale-and-position.y') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => position.y = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
  </Section>
  <Section
    v-if="allowExtractColors"
    :title="t('settings.live2d.theme-color-from-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="text-sm"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <p text="neutral-500 dark:neutral-400">
      {{ t('settings.live2d.theme-color-from-model.description') }}
    </p>
    <ColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" mx-auto />
    <Button variant="secondary" :disabled="!canExtractColors" @click="$emit('extractColorsFromModel')">
      {{ t('settings.live2d.theme-color-from-model.button-extract.title') }}
    </Button>
  </Section>
  <!-- <Section
    v-if="modelFile"
    :title="t('settings.live2d.edit-motion-map.title')"
    icon="i-solar:face-scan-circle-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <div v-for="motion in availableMotions" :key="motion.fileName" flex items-center justify-between text-sm>
      <span font-medium font-mono>{{ motion.fileName }}</span>

      <div flex gap-2>
        <select v-model="motionMap[motion.fileName]">
          <option v-for="emotion in Object.keys(Emotion)" :key="emotion">
            {{ emotion }}
          </option>
        </select>

        <Button
          class="form-control"
          @click="currentMotion = { group: motion.motionName, index: motion.motionIndex }"
        >
          Play
        </Button>
      </div>
    </div>
    <Button @click="saveMotionMap">
      Save and patch
    </Button>
    <a
      mt-2 block :href="exportObjectUrl"
      :download="`${modelFile?.name || 'live2d'}-motion-edited.zip`"
    >
      <Button w-full>Export</button>
    </a>
  </Section> -->
  <Section
    :title="t('settings.live2d.animation.title')"
    icon="i-solar:settings-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <FieldCheckbox
      v-model="live2dEyeTracking"
      :label="t('settings.live2d.animation.focus.title')"
      :description="t('settings.live2d.animation.focus.description')"
      placement="right"
    />
    <div v-if="live2dEyeTracking" class="grid grid-cols-4">
      <PropertyPoint
        v-model:x="live2dModelEyeOffset.x"
        v-model:y="live2dModelEyeOffset.y"

        :x-config="{ min: -100, max: 100, step: 0.01, label: 'X', formatValue: (val: number) => val?.toFixed(2) }"
        :y-config="{ min: -100, max: 100, step: 0.01, label: 'Y', formatValue: (val: number) => val?.toFixed(2) }"
      >
        <template #label>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {{ t('settings.live2d.animation.focus.offset') }}
          </p>
        </template>
      </PropertyPoint>
    </div>
    <FieldCheckbox
      v-model="live2dForceIdleEyeAnimation"
      :label="t('settings.live2d.animation.force-idle-eye-animation.title')"
      :description="t('settings.live2d.animation.force-idle-eye-animation.description')"
      placement="right"
    />
    <FieldCheckbox
      v-model="live2dAutoBlinkEnabled"
      :label="t('settings.live2d.animation.blink-enable.title')"
      :description="t('settings.live2d.animation.blink-enable.description')"
      placement="right"
    />
    <label v-if="live2dAutoBlinkEnabled" class="flex flex-wrap gap-4">
      <div class="flex-1">
        <div class="flex items-center gap-1 text-sm font-medium">
          {{ t('settings.live2d.animation.blink-mode.title') }}
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t('settings.live2d.animation.blink-mode.description') }}
        </div>
      </div>
      <SelectTab v-model="live2dBlinkMode" :options="blinkModeOptions" size="sm" :class="['shrink-0']" />
    </label>
    <FieldCombobox
      v-model="selectedRuntimeMotion"
      :label="t('settings.live2d.animation.idle-motion.title')"
      :options="runtimeMotionOptions"
      :placeholder="t('settings.live2d.animation.idle-motion.placeholder')"
      :select-class="['w-full']"
      :content-min-width="256"
      @update:model-value="handleMotionSelect"
    >
      <template #empty>
        {{ t('settings.live2d.animation.idle-motion.no-motion') }}
      </template>
    </FieldCombobox>
  </Section>
  <Section
    :title="t('settings.live2d.parameters.title')"
    icon="i-solar:settings-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <FieldRange
      v-model="live2dRenderScale"
      as="div"
      :min="0.5"
      :max="2"
      :step="0.25"
      :label="t('settings.live2d.parameters.render-scale.title')"
    />

    <label class="flex flex-wrap gap-4">
      <div class="flex-1">
        <div class="flex items-center gap-1 text-sm font-medium">
          <slot name="label">
            {{ t('settings.live2d.parameters.fps.title') }}
          </slot>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400">
          <slot name="description">
            {{ t('settings.live2d.parameters.fps.description') }}
          </slot>
        </div>
      </div>
      <SelectTab v-model="live2dMaxFps" :options="fpsOptions" size="sm" :class="['shrink-0']" />
    </label>

    <div mt-4 flex items-center justify-between>
      <span text-sm>{{ t('settings.live2d.parameters.shadow') }}</span>
      <Checkbox v-model="live2dShadowEnabled" />
    </div>

    <Button
      variant="secondary"
      class="mt-4 w-full"
      @click="resetToDefaultParameters"
    >
      {{ t('settings.live2d.parameters.reset-parameters') }}
    </Button>

    <Button
      variant="secondary"
      class="mt-2 w-full"
      :disabled="clearingCache"
      :loading="clearingCache"
      @click="clearModelCache"
    >
      {{ t('settings.live2d.clear-model-cache') }}
    </Button>

    <!-- Head Rotation -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Head Rotation
    </div>
    <FieldRange v-model="modelParameters.angleX" as="div" :min="-30" :max="30" :step="0.1" label="Angle X">
      <template #label>
        <div flex items-center>
          <div>Angle X</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.angleX = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.angleY" as="div" :min="-30" :max="30" :step="0.1" label="Angle Y">
      <template #label>
        <div flex items-center>
          <div>Angle Y</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.angleY = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.angleZ" as="div" :min="-30" :max="30" :step="0.1" label="Angle Z">
      <template #label>
        <div flex items-center>
          <div>Angle Z</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.angleZ = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Eyes -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Eyes
    </div>
    <FieldRange v-model="modelParameters.leftEyeOpen" as="div" :min="0" :max="1" :step="0.01" label="Left Eye Open/Close">
      <template #label>
        <div flex items-center>
          <div>Left Eye Open/Close</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.leftEyeOpen = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.rightEyeOpen" as="div" :min="0" :max="1" :step="0.01" label="Right Eye Open/Close">
      <template #label>
        <div flex items-center>
          <div>Right Eye Open/Close</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.rightEyeOpen = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.leftEyeSmile" as="div" :min="0" :max="1" :step="0.01" label="Left Eye Smiling">
      <template #label>
        <div flex items-center>
          <div>Left Eye Smiling</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.leftEyeSmile = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.rightEyeSmile" as="div" :min="0" :max="1" :step="0.01" label="Right Eye Smiling">
      <template #label>
        <div flex items-center>
          <div>Right Eye Smiling</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.rightEyeSmile = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Eyebrows -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Eyebrows
    </div>
    <FieldRange v-model="modelParameters.leftEyebrowLR" as="div" :min="-1" :max="1" :step="0.01" label="Left eyebrow Left/Right">
      <template #label>
        <div flex items-center>
          <div>Left eyebrow Left/Right</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.leftEyebrowLR = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.rightEyebrowLR" as="div" :min="-1" :max="1" :step="0.01" label="Right eyebrow Left/Right">
      <template #label>
        <div flex items-center>
          <div>Right eyebrow Left/Right</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.rightEyebrowLR = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.leftEyebrowY" as="div" :min="-1" :max="1" :step="0.01" label="Left Eyebrow Y (Up/Down)">
      <template #label>
        <div flex items-center>
          <div>Left Eyebrow Y</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.leftEyebrowY = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.rightEyebrowY" as="div" :min="-1" :max="1" :step="0.01" label="Right Eyebrow Y (Up/Down)">
      <template #label>
        <div flex items-center>
          <div>Right Eyebrow Y</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.rightEyebrowY = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.leftEyebrowAngle" as="div" :min="-1" :max="1" :step="0.01" label="Left Eyebrow Angle">
      <template #label>
        <div flex items-center>
          <div>Left Eyebrow Angle</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.leftEyebrowAngle = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.rightEyebrowAngle" as="div" :min="-1" :max="1" :step="0.01" label="Right Eyebrow Angle">
      <template #label>
        <div flex items-center>
          <div>Right Eyebrow Angle</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.rightEyebrowAngle = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.leftEyebrowForm" as="div" :min="-1" :max="1" :step="0.01" label="Left Eyebrow Form (Deformation)">
      <template #label>
        <div flex items-center>
          <div>Left Eyebrow Form</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.leftEyebrowForm = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.rightEyebrowForm" as="div" :min="-1" :max="1" :step="0.01" label="Right Eyebrow Form (Deformation)">
      <template #label>
        <div flex items-center>
          <div>Right Eyebrow Form</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.rightEyebrowForm = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Mouth -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Mouth
    </div>
    <FieldRange v-model="modelParameters.mouthOpen" as="div" :min="0" :max="1" :step="0.01" label="Mouth Open/Close">
      <template #label>
        <div flex items-center>
          <div>Mouth Open/Close</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.mouthOpen = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.mouthForm" as="div" :min="-1" :max="1" :step="0.01" label="Mouth Form (Deformation)">
      <template #label>
        <div flex items-center>
          <div>Mouth Form</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.mouthForm = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Face -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Face
    </div>
    <FieldRange v-model="modelParameters.cheek" as="div" :min="0" :max="1" :step="0.01" label="Cheek">
      <template #label>
        <div flex items-center>
          <div>Cheek</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.cheek = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Body -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Body
    </div>
    <FieldRange v-model="modelParameters.bodyAngleX" as="div" :min="-10" :max="10" :step="0.1" label="Body rotation X">
      <template #label>
        <div flex items-center>
          <div>Body rotation X</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.bodyAngleX = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.bodyAngleY" as="div" :min="-10" :max="10" :step="0.1" label="Body rotation Y">
      <template #label>
        <div flex items-center>
          <div>Body rotation Y</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.bodyAngleY = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.bodyAngleZ" as="div" :min="-10" :max="10" :step="0.1" label="Body rotation Z">
      <template #label>
        <div flex items-center>
          <div>Body rotation Z</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.bodyAngleZ = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="modelParameters.breath" as="div" :min="0" :max="1" :step="0.01" label="Breath">
      <template #label>
        <div flex items-center>
          <div>Breath</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => modelParameters.breath = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
  </Section>
  <Section
    :title="t('settings.live2d.expressions.title')"
    icon="i-solar:face-scan-circle-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <div flex items-center justify-between>
      <span text-sm text-neutral-600 dark:text-neutral-400>{{ t('settings.live2d.expressions.override-toggle') }}</span>
      <Checkbox v-model="live2dExpressionEnabled" />
    </div>
    <div v-if="!live2dExpressionEnabled" py-2 text-xs text-neutral-500 dark:text-neutral-400>
      {{ t('settings.live2d.expressions.sdk-preset-preserved-notice') }}
    </div>
    <template v-else-if="expressionGroups.size === 0">
      <div py-2 text-sm text-neutral-500 dark:text-neutral-400>
        {{ t('settings.live2d.expressions.no-expression') }}
      </div>
    </template>
    <template v-else>
      <!-- Expression preview toggles -->
      <div flex flex-col gap-2>
        <div
          v-for="[groupName, group] in expressionGroups"
          :key="groupName"
          flex items-center justify-between
        >
          <span text-sm text-neutral-700 dark:text-neutral-300>{{ groupName }}</span>
          <Checkbox
            :model-value="isGroupActive(group)"
            @update:model-value="expressionStore.toggle(groupName)"
          />
        </div>
      </div>

      <div mt-4 flex flex-wrap items-center gap-3>
        <span whitespace-nowrap text-sm text-neutral-600 dark:text-neutral-400>{{ t('settings.live2d.expressions.expose-to-llm-toggle') }}</span>
        <SelectTab
          :model-value="expressionStore.llmMode"
          :options="llmModeOptions"
          size="sm"
          @update:model-value="(v: string) => expressionStore.setLlmMode(v as 'all' | 'none' | 'custom')"
        />
      </div>
      <span v-if="expressionStore.llmMode !== 'none'" text-xs text-neutral-500 dark:text-neutral-400>
        {{ t('settings.live2d.expressions.llm-integration-wip') }}
      </span>

      <!-- Custom per-expression LLM toggles (only when mode = 'custom') -->
      <div v-if="expressionStore.llmMode === 'custom'" mt-2 flex flex-col gap-2 border-l-2 border-neutral-200 pl-3 dark:border-neutral-700>
        <div
          v-for="[groupName] in expressionGroups"
          :key="`llm-${groupName}`"
          flex items-center justify-between
        >
          <span text-xs text-neutral-600 dark:text-neutral-400>{{ groupName }}</span>
          <Checkbox
            :model-value="expressionStore.llmExposed.get(groupName) ?? false"
            @update:model-value="(v: boolean) => expressionStore.setLlmExposed(groupName, v)"
          />
        </div>
      </div>

      <!-- Action buttons -->
      <div mt-4 flex gap-2>
        <Button variant="secondary" @click="expressionStore.saveDefaults()">
          {{ t('settings.live2d.expressions.save-default') }}
        </Button>
        <Button variant="secondary" @click="expressionStore.resetAll()">
          {{ t('settings.live2d.expressions.reset') }}
        </Button>
      </div>
    </template>
  </Section>
</template>
