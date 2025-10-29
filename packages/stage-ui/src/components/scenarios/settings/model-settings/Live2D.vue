<script setup lang="ts">
import { Checkbox, FieldRange } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useLive2d } from '../../../../stores/live2d'
import { useSettings } from '../../../../stores/settings'
import { Section } from '../../../layouts'
import { Button } from '../../../misc'
import { ColorPalette } from '../../../widgets'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const settings = useSettings()
const { live2dDisableFocus, live2dIdleAnimationEnabled, live2dAutoBlinkEnabled } = storeToRefs(settings)

const live2d = useLive2d()
const {
  scale,
  position,
  modelParameters,
} = storeToRefs(live2d)

// Use store values for parameters
const angleX = computed({
  get: () => modelParameters.value.angleX,
  set: (value) => { modelParameters.value.angleX = value },
})

const angleY = computed({
  get: () => modelParameters.value.angleY,
  set: (value) => { modelParameters.value.angleY = value },
})

const angleZ = computed({
  get: () => modelParameters.value.angleZ,
  set: (value) => { modelParameters.value.angleZ = value },
})

const leftEyeOpen = computed({
  get: () => modelParameters.value.leftEyeOpen,
  set: (value) => { modelParameters.value.leftEyeOpen = Math.round(value * 100) / 100 },
})

const rightEyeOpen = computed({
  get: () => modelParameters.value.rightEyeOpen,
  set: (value) => { modelParameters.value.rightEyeOpen = Math.round(value * 100) / 100 },
})

const leftEyeSmile = computed({
  get: () => modelParameters.value.leftEyeSmile,
  set: (value) => { modelParameters.value.leftEyeSmile = value },
})

const rightEyeSmile = computed({
  get: () => modelParameters.value.rightEyeSmile,
  set: (value) => { modelParameters.value.rightEyeSmile = value },
})

const leftEyebrowLR = computed({
  get: () => modelParameters.value.leftEyebrowLR,
  set: (value) => { modelParameters.value.leftEyebrowLR = value },
})

const rightEyebrowLR = computed({
  get: () => modelParameters.value.rightEyebrowLR,
  set: (value) => { modelParameters.value.rightEyebrowLR = value },
})

const leftEyebrowY = computed({
  get: () => modelParameters.value.leftEyebrowY,
  set: (value) => { modelParameters.value.leftEyebrowY = value },
})

const rightEyebrowY = computed({
  get: () => modelParameters.value.rightEyebrowY,
  set: (value) => { modelParameters.value.rightEyebrowY = value },
})

const leftEyebrowAngle = computed({
  get: () => modelParameters.value.leftEyebrowAngle,
  set: (value) => { modelParameters.value.leftEyebrowAngle = value },
})

const rightEyebrowAngle = computed({
  get: () => modelParameters.value.rightEyebrowAngle,
  set: (value) => { modelParameters.value.rightEyebrowAngle = value },
})

const leftEyebrowForm = computed({
  get: () => modelParameters.value.leftEyebrowForm,
  set: (value) => { modelParameters.value.leftEyebrowForm = value },
})

const rightEyebrowForm = computed({
  get: () => modelParameters.value.rightEyebrowForm,
  set: (value) => { modelParameters.value.rightEyebrowForm = value },
})

const mouthOpen = computed({
  get: () => modelParameters.value.mouthOpen,
  set: (value) => { modelParameters.value.mouthOpen = value },
})

const mouthForm = computed({
  get: () => modelParameters.value.mouthForm,
  set: (value) => { modelParameters.value.mouthForm = value },
})

const cheek = computed({
  get: () => modelParameters.value.cheek,
  set: (value) => { modelParameters.value.cheek = value },
})

const bodyAngleX = computed({
  get: () => modelParameters.value.bodyAngleX,
  set: (value) => { modelParameters.value.bodyAngleX = value },
})

const bodyAngleY = computed({
  get: () => modelParameters.value.bodyAngleY,
  set: (value) => { modelParameters.value.bodyAngleY = value },
})

const bodyAngleZ = computed({
  get: () => modelParameters.value.bodyAngleZ,
  set: (value) => { modelParameters.value.bodyAngleZ = value },
})

const breath = computed({
  get: () => modelParameters.value.breath,
  set: (value) => { modelParameters.value.breath = value },
})

// Function to reset all parameters to default values
function resetToDefaultParameters() {
  modelParameters.value = {
    angleX: 0,
    angleY: 0,
    angleZ: 0,
    leftEyeOpen: 0,
    rightEyeOpen: 0,
    leftEyeSmile: 0,
    rightEyeSmile: 0,
    leftEyebrowLR: 0,
    rightEyebrowLR: 0,
    leftEyebrowY: 0,
    rightEyebrowY: 0,
    leftEyebrowAngle: 0,
    rightEyebrowAngle: 0,
    leftEyebrowForm: 0,
    rightEyebrowForm: 0,
    mouthOpen: 0,
    mouthForm: 0,
    cheek: 0,
    bodyAngleX: 0,
    bodyAngleY: 0,
    bodyAngleZ: 0,
    breath: 0,
  }
}

// Auto blink slider animation
let blinkAnimationId: number | null = null
let nextBlinkTimeout: ReturnType<typeof setTimeout> | null = null
const blinkCloseDuration = 200 // 0.2 seconds to close (1 to 0)
const blinkOpenDuration = 200 // 0.2 seconds to open (0 to 1)
const totalBlinkDuration = blinkCloseDuration + blinkOpenDuration
let blinkStartTime = 0
let blinkStartLeft = 1
let blinkStartRight = 1
let isAnimating = false
let isUpdatingFromAnimation = false
let userInteractionTimeout: ReturnType<typeof setTimeout> | null = null

function stopBlinkAnimation() {
  if (blinkAnimationId !== null) {
    cancelAnimationFrame(blinkAnimationId)
    blinkAnimationId = null
    isAnimating = false
  }
  if (nextBlinkTimeout !== null) {
    clearTimeout(nextBlinkTimeout)
    nextBlinkTimeout = null
  }
  if (userInteractionTimeout !== null) {
    clearTimeout(userInteractionTimeout)
    userInteractionTimeout = null
  }
}

function animateEyeBlink() {
  // Prevent multiple animations from running simultaneously
  if (isAnimating || nextBlinkTimeout !== null) {
    return
  }

  stopBlinkAnimation()

  if (!live2dAutoBlinkEnabled.value) {
    return
  }

  isAnimating = true
  blinkStartTime = Date.now()
  blinkStartLeft = modelParameters.value.leftEyeOpen
  blinkStartRight = modelParameters.value.rightEyeOpen

  function animate() {
    if (!live2dAutoBlinkEnabled.value) {
      stopBlinkAnimation()
      return
    }

    const elapsed = Date.now() - blinkStartTime
    const progress = Math.min(elapsed / totalBlinkDuration, 1)

    let newLeft: number
    let newRight: number

    if (elapsed < blinkCloseDuration) {
      // Closing phase: 1 -> 0
      const closeProgress = elapsed / blinkCloseDuration
      const eased = 1 - (1 - closeProgress) ** 2 // Ease out
      newLeft = blinkStartLeft + (0 - blinkStartLeft) * eased
      newRight = blinkStartRight + (0 - blinkStartRight) * eased
    }
    else {
      // Opening phase: 0 -> 1
      const openProgress = (elapsed - blinkCloseDuration) / blinkOpenDuration
      const eased = openProgress * openProgress // Ease in
      newLeft = 0 + (blinkStartLeft - 0) * eased
      newRight = 0 + (blinkStartRight - 0) * eased
    }

    isUpdatingFromAnimation = true
    modelParameters.value.leftEyeOpen = Math.round(newLeft * 100) / 100
    modelParameters.value.rightEyeOpen = Math.round(newRight * 100) / 100
    // Use nextTick to ensure watchers see the flag before it's cleared
    setTimeout(() => {
      isUpdatingFromAnimation = false
    }, 0)

    if (progress < 1) {
      blinkAnimationId = requestAnimationFrame(animate)
    }
    else {
      // Animation complete, eyes back to starting value
      isUpdatingFromAnimation = true
      modelParameters.value.leftEyeOpen = Math.round(blinkStartLeft * 100) / 100
      modelParameters.value.rightEyeOpen = Math.round(blinkStartRight * 100) / 100
      setTimeout(() => {
        isUpdatingFromAnimation = false
      }, 0)

      isAnimating = false
      blinkAnimationId = null

      // Trigger next blink after a delay
      if (live2dAutoBlinkEnabled.value) {
        const nextBlinkDelay = 5000 + Math.random() * 5000 // 5-10 seconds
        nextBlinkTimeout = setTimeout(() => {
          nextBlinkTimeout = null
          if (live2dAutoBlinkEnabled.value && !isAnimating) {
            animateEyeBlink()
          }
        }, nextBlinkDelay)
      }
    }
  }

  blinkAnimationId = requestAnimationFrame(animate)
}

// Watch for auto blink enabled/disabled
watch(live2dAutoBlinkEnabled, (enabled) => {
  if (enabled) {
    // Start animation when enabled, but only if not already running
    if (!isAnimating && nextBlinkTimeout === null) {
      animateEyeBlink()
    }
  }
  else {
    // Stop animation when disabled
    stopBlinkAnimation()
  }
})

// Track user interaction with sliders - only react if not currently animating
watch(() => modelParameters.value.leftEyeOpen, (newValue, oldValue) => {
  if (!live2dAutoBlinkEnabled.value || isAnimating || isUpdatingFromAnimation || nextBlinkTimeout !== null) {
    return
  }

  // If user manually changed the value while auto blink is enabled
  if (oldValue !== undefined && Math.abs(newValue - oldValue) > 0.01) {
    stopBlinkAnimation()
    // Resume animation after user stops interacting
    if (userInteractionTimeout !== null) {
      clearTimeout(userInteractionTimeout)
    }
    userInteractionTimeout = setTimeout(() => {
      if (live2dAutoBlinkEnabled.value && !isAnimating && nextBlinkTimeout === null) {
        animateEyeBlink()
      }
      userInteractionTimeout = null
    }, 1000)
  }
})

watch(() => modelParameters.value.rightEyeOpen, (newValue, oldValue) => {
  if (!live2dAutoBlinkEnabled.value || isAnimating || isUpdatingFromAnimation || nextBlinkTimeout !== null) {
    return
  }

  // If user manually changed the value while auto blink is enabled
  if (oldValue !== undefined && Math.abs(newValue - oldValue) > 0.01) {
    stopBlinkAnimation()
    // Resume animation after user stops interacting
    if (userInteractionTimeout !== null) {
      clearTimeout(userInteractionTimeout)
    }
    userInteractionTimeout = setTimeout(() => {
      if (live2dAutoBlinkEnabled.value && !isAnimating && nextBlinkTimeout === null) {
        animateEyeBlink()
      }
      userInteractionTimeout = null
    }, 1000)
  }
})

onUnmounted(() => {
  stopBlinkAnimation()
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
    <FieldRange v-model="scale" as="div" :min="0.5" :max="2" :step="0.01" :label="t('settings.live2d.scale-and-position.scale')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.live2d.scale-and-position.scale') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => scale = 1">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="position.x" as="div" :min="-100" :max="100" :step="1" :label="t('settings.live2d.scale-and-position.x')">
      <template #label>
        <div flex items-center>
          <div>{{ t('settings.live2d.scale-and-position.x') }}</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => position.x = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="position.y" as="div" :min="-100" :max="100" :step="1" :label="t('settings.live2d.scale-and-position.y')">
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
      <Checkbox v-model="live2dIdleAnimationEnabled" />
    </div>

    <div mt-4 flex items-center justify-between>
      <span text-sm text-neutral-600 dark:text-neutral-400>Auto Blink</span>
      <Checkbox v-model="live2dAutoBlinkEnabled" />
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
    <FieldRange v-model="angleX" as="div" :min="-30" :max="30" :step="0.1" label="Angle X">
      <template #label>
        <div flex items-center>
          <div>Angle X</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => angleX = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="angleY" as="div" :min="-30" :max="30" :step="0.1" label="Angle Y">
      <template #label>
        <div flex items-center>
          <div>Angle Y</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => angleY = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="angleZ" as="div" :min="-30" :max="30" :step="0.1" label="Angle Z">
      <template #label>
        <div flex items-center>
          <div>Angle Z</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => angleZ = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Eyes -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Eyes
    </div>
    <FieldRange v-model="leftEyeOpen" as="div" :min="0" :max="1" :step="0.01" label="Left Eye Open/Close">
      <template #label>
        <div flex items-center>
          <div>Left Eye Open/Close</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => leftEyeOpen = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="rightEyeOpen" as="div" :min="0" :max="1" :step="0.01" label="Right Eye Open/Close">
      <template #label>
        <div flex items-center>
          <div>Right Eye Open/Close</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => rightEyeOpen = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="leftEyeSmile" as="div" :min="0" :max="1" :step="0.01" label="Left Eye Smiling">
      <template #label>
        <div flex items-center>
          <div>Left Eye Smiling</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => leftEyeSmile = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="rightEyeSmile" as="div" :min="0" :max="1" :step="0.01" label="Right Eye Smiling">
      <template #label>
        <div flex items-center>
          <div>Right Eye Smiling</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => rightEyeSmile = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Eyebrows -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Eyebrows
    </div>
    <FieldRange v-model="leftEyebrowLR" as="div" :min="-1" :max="1" :step="0.01" label="Left eyebrow Left/Right">
      <template #label>
        <div flex items-center>
          <div>Left eyebrow Left/Right</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => leftEyebrowLR = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="rightEyebrowLR" as="div" :min="-1" :max="1" :step="0.01" label="Right eyebrow Left/Right">
      <template #label>
        <div flex items-center>
          <div>Right eyebrow Left/Right</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => rightEyebrowLR = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="leftEyebrowY" as="div" :min="-1" :max="1" :step="0.01" label="Left Eyebrow Y (Up/Down)">
      <template #label>
        <div flex items-center>
          <div>Left Eyebrow Y</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => leftEyebrowY = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="rightEyebrowY" as="div" :min="-1" :max="1" :step="0.01" label="Right Eyebrow Y (Up/Down)">
      <template #label>
        <div flex items-center>
          <div>Right Eyebrow Y</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => rightEyebrowY = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="leftEyebrowAngle" as="div" :min="-1" :max="1" :step="0.01" label="Left Eyebrow Angle">
      <template #label>
        <div flex items-center>
          <div>Left Eyebrow Angle</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => leftEyebrowAngle = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="rightEyebrowAngle" as="div" :min="-1" :max="1" :step="0.01" label="Right Eyebrow Angle">
      <template #label>
        <div flex items-center>
          <div>Right Eyebrow Angle</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => rightEyebrowAngle = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="leftEyebrowForm" as="div" :min="-1" :max="1" :step="0.01" label="Left Eyebrow Form (Deformation)">
      <template #label>
        <div flex items-center>
          <div>Left Eyebrow Form</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => leftEyebrowForm = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="rightEyebrowForm" as="div" :min="-1" :max="1" :step="0.01" label="Right Eyebrow Form (Deformation)">
      <template #label>
        <div flex items-center>
          <div>Right Eyebrow Form</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => rightEyebrowForm = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Mouth -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Mouth
    </div>
    <FieldRange v-model="mouthOpen" as="div" :min="0" :max="1" :step="0.01" label="Mouth Open/Close">
      <template #label>
        <div flex items-center>
          <div>Mouth Open/Close</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => mouthOpen = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="mouthForm" as="div" :min="-1" :max="1" :step="0.01" label="Mouth Form (Deformation)">
      <template #label>
        <div flex items-center>
          <div>Mouth Form</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => mouthForm = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Face -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Face
    </div>
    <FieldRange v-model="cheek" as="div" :min="0" :max="1" :step="0.01" label="Cheek">
      <template #label>
        <div flex items-center>
          <div>Cheek</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => cheek = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>

    <!-- Body -->
    <div mb-2 mt-4 text-xs text-neutral-500 font-semibold dark:text-neutral-400>
      Body
    </div>
    <FieldRange v-model="bodyAngleX" as="div" :min="-10" :max="10" :step="0.1" label="Body rotation X">
      <template #label>
        <div flex items-center>
          <div>Body rotation X</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => bodyAngleX = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="bodyAngleY" as="div" :min="-10" :max="10" :step="0.1" label="Body rotation Y">
      <template #label>
        <div flex items-center>
          <div>Body rotation Y</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => bodyAngleY = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="bodyAngleZ" as="div" :min="-10" :max="10" :step="0.1" label="Body rotation Z">
      <template #label>
        <div flex items-center>
          <div>Body rotation Z</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => bodyAngleZ = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
    <FieldRange v-model="breath" as="div" :min="0" :max="1" :step="0.01" label="Breath">
      <template #label>
        <div flex items-center>
          <div>Breath</div>
          <button px-2 text-xs outline-none title="Reset value to default" @click="() => breath = 0">
            <div i-solar:forward-linear transform-scale-x--100 text="neutral-500 dark:neutral-400" />
          </button>
        </div>
      </template>
    </FieldRange>
  </Section>
</template>
