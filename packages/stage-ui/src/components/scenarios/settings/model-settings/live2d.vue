<script setup lang="ts">
import { defaultModelParameters, useLive2d } from '@proj-airi/stage-ui-live2d'
import { Button, Checkbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettings } from '../../../../stores/settings'
import { Section } from '../../../layouts'
import { ColorPalette } from '../../../widgets'

defineProps<{
  palette: string[]
}>()
defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const settings = useSettings()
const {
  live2dDisableFocus,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
} = storeToRefs(settings)

const live2d = useLive2d()
const {
  scale,
  position,
  modelParameters,
  currentMotion,
} = storeToRefs(live2d)

const selectedRuntimeMotion = ref<string>('')
const selectedRuntimeMotionName = ref<string>('')
const runtimeMotions = ref<Array<{ name: string, fullPath: string, displayPath: string, group: string, index: number }>>([])
const showMotionSelector = ref(false)

// Get available runtime motions from the model
onMounted(() => {
  // Listen for available motions updates
  watch(() => live2d.availableMotions, (motions) => {
    // Show all motions with their full paths
    runtimeMotions.value = motions.map(m => ({
      name: m.fileName.split('/').pop() || m.fileName,
      fullPath: m.fileName, // Full path like "hiyori_free_zh/runtime/motions/idle.motion3.json"
      displayPath: m.fileName, // Show full path for clarity
      group: m.motionName,
      index: m.motionIndex,
    }))

    console.info('Available motions:', runtimeMotions.value)
  }, { immediate: true })

  // Restore selected motion
  const savedPath = localStorage.getItem('selected-runtime-motion')
  const savedName = localStorage.getItem('selected-runtime-motion-name')
  if (savedPath) {
    selectedRuntimeMotion.value = savedPath
  }
  if (savedName) {
    selectedRuntimeMotionName.value = savedName
  }

  // Add click outside handler
  document.addEventListener('click', handleClickOutside)
})

// Function to reset all parameters to default values
function resetToDefaultParameters() {
  modelParameters.value = { ...defaultModelParameters }
}

// Runtime motion selection handlers
function handleMotionSelect(motion: any) {
  selectedRuntimeMotion.value = motion.displayPath // Store full path
  selectedRuntimeMotionName.value = motion.name // Store just the filename for display
  localStorage.setItem('selected-runtime-motion', motion.displayPath)
  localStorage.setItem('selected-runtime-motion-name', motion.name)
  localStorage.setItem('selected-runtime-motion-group', motion.group)
  localStorage.setItem('selected-runtime-motion-index', motion.index.toString())

  // Enable idle animation
  live2dIdleAnimationEnabled.value = true

  // Set the current motion to the selected runtime motion
  currentMotion.value = { group: motion.group, index: motion.index }

  showMotionSelector.value = false

  console.info('✅ Selected runtime motion:', motion.name)
  console.info('Full path:', motion.displayPath)
  console.info('Group:', motion.group, 'Index:', motion.index)
}

function toggleMotionSelector() {
  showMotionSelector.value = !showMotionSelector.value
}

// Close dropdown when clicking outside
function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('[data-motion-selector]')) {
    showMotionSelector.value = false
  }
}

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

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
    <ColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" mx-auto />
    <Button variant="secondary" @click="$emit('extractColorsFromModel')">
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
    :title="t('settings.live2d.focus.title')"
    icon="i-solar:eye-scan-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <Checkbox
      v-model="live2dDisableFocus"
      :label="t('settings.live2d.focus.button-disable.title')"
    />
  </Section>
  <Section
    title="Parameters"
    icon="i-solar:settings-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <div flex items-center justify-between>
      <span text-sm text-neutral-600 dark:text-neutral-400>Idle Animation</span>
      <div data-motion-selector relative flex flex-col items-end gap-1>
        <button

          :title="selectedRuntimeMotion"
          flex items-center gap-2 border rounded bg-neutral-100 px-4 py-2 text-sm text-neutral-700 font-medium transition-colors dark:border-neutral-700 dark:bg-neutral-800 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700
          @click="toggleMotionSelector"
        >
          <span max-w-32 truncate>{{ selectedRuntimeMotionName || 'Select Motion' }}</span>
          <div
            :class="showMotionSelector ? 'i-solar:alt-arrow-up-line-duotone' : 'i-solar:alt-arrow-down-line-duotone'"
            text-xs transition-transform
          />
        </button>

        <!-- Dropdown menu -->
        <div
          v-if="showMotionSelector"

          bg="white dark:neutral-800"
          border="1 neutral-200 dark:neutral-700"
          absolute right-0 top-10 z-50 max-h-80 min-w-64 overflow-y-auto rounded-lg shadow-lg
        >
          <div v-if="runtimeMotions.length === 0" p-4 text-sm text-neutral-500 dark:text-neutral-400>
            No motions available
          </div>
          <button
            v-for="motion in runtimeMotions"
            :key="motion.fullPath"
            w-full px-4 py-2.5 text-left
            hover:bg="neutral-100 dark:neutral-700"
            transition-colors
            :class="{
              'bg-neutral-100 dark:bg-neutral-700': selectedRuntimeMotion === motion.displayPath,
            }"
            @click="handleMotionSelect(motion)"
          >
            <div text-sm text-neutral-900 font-medium dark:text-neutral-100>
              {{ motion.name }}
            </div>
            <div truncate text-xs text-neutral-500 dark:text-neutral-400>
              {{ motion.displayPath }}
            </div>
          </button>
        </div>
      </div>
    </div>

    <div mt-4 flex items-center justify-between>
      <span text-sm text-neutral-600 dark:text-neutral-400>Auto Blink</span>
      <Checkbox v-model="live2dAutoBlinkEnabled" />
    </div>

    <div mt-3 flex items-center justify-between>
      <span text-sm text-neutral-600 dark:text-neutral-400>Force Auto Blink (fallback timer)</span>
      <Checkbox v-model="live2dForceAutoBlinkEnabled" />
    </div>

    <div mt-4 flex items-center justify-between>
      <span text-sm text-neutral-600 dark:text-neutral-400>Shadow</span>
      <Checkbox v-model="live2dShadowEnabled" />
    </div>

    <button

      mt-4 w-full border rounded bg-neutral-100 px-4 py-2 text-sm text-neutral-700 font-medium transition-colors dark:border-neutral-700 dark:bg-neutral-800 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700
      @click="resetToDefaultParameters"
    >
      Reset To Default Parameters
    </button>

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
</template>
