<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { controlConfig, useMMD } from '@proj-airi/stage-ui-mmd'
import { Button, FieldCheckbox, FieldCombobox, FieldRange } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

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

const mmdStore = useMMD()
const {
  scale,
  position,
  rotationY,
  physicsEnabled,
  ikEnabled,
  grantEnabled,
  gazeTrackingEnabled,
  idleMotionName,
  availableMotions,
} = storeToRefs(mmdStore)

const canExtractColors = computed(() => props.runtimeSnapshot.canCapturePreview)

const motionOptions = computed(() => availableMotions.value.map(motion => ({
  label: motion.name,
  value: motion.name,
  description: '',
})))

function handleIdleMotionSelect(name: string | number | undefined) {
  if (typeof name !== 'string')
    return
  idleMotionName.value = name
}

const vmdDialog = useFileDialog({ accept: '.vmd', multiple: true, reset: true })
vmdDialog.onChange(async (files) => {
  if (!files)
    return
  for (const file of Array.from(files)) {
    const descriptor = await mmdStore.addMotion(file)
    // Make the first imported motion the idle if none is chosen yet, so the
    // character immediately animates instead of standing in rest pose.
    if (!idleMotionName.value)
      idleMotionName.value = descriptor.name
  }
})

function playMotionOnce(name: string) {
  mmdStore.playOneShotAction(name, false)
}
</script>

<template>
  <Section
    :title="t('settings.mmd.scale-and-position.title')"
    icon="i-solar:scale-bold-duotone"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    size="sm"
    :expand="true"
  >
    <FieldRange v-model="scale" as="div" :min="controlConfig.scale.min" :max="controlConfig.scale.max" :step="controlConfig.scale.step" :default-value="controlConfig.scale.default" :label="t('settings.mmd.scale-and-position.scale')" />
    <FieldRange v-model="position.x" as="div" :min="controlConfig.x.min" :max="controlConfig.x.max" :step="controlConfig.x.step" :default-value="controlConfig.x.default" :label="t('settings.mmd.scale-and-position.x')" />
    <FieldRange v-model="position.y" as="div" :min="controlConfig.y.min" :max="controlConfig.y.max" :step="controlConfig.y.step" :default-value="controlConfig.y.default" :label="t('settings.mmd.scale-and-position.y')" />
    <FieldRange v-model="rotationY" as="div" :min="controlConfig.rotationY.min" :max="controlConfig.rotationY.max" :step="controlConfig.rotationY.step" :default-value="controlConfig.rotationY.default" :label="t('settings.mmd.scale-and-position.rotation')" />
  </Section>

  <Section
    v-if="allowExtractColors"
    :title="t('settings.mmd.theme-color-from-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="text-sm"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    size="sm"
    :expand="false"
  >
    <ColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" mx-auto />
    <Button variant="secondary" :disabled="!canExtractColors" @click="$emit('extractColorsFromModel')">
      {{ t('settings.mmd.theme-color-from-model.button-extract.title') }}
    </Button>
  </Section>

  <Section
    :title="t('settings.mmd.physics.title')"
    icon="i-solar:atom-bold-duotone"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    size="sm"
    :expand="false"
  >
    <FieldCheckbox v-model="physicsEnabled" :label="t('settings.mmd.physics.enabled')" />
    <FieldCheckbox v-model="ikEnabled" :label="t('settings.mmd.physics.ik')" />
    <FieldCheckbox v-model="grantEnabled" :label="t('settings.mmd.physics.grant')" />
  </Section>

  <Section
    :title="t('settings.mmd.gaze.title')"
    icon="i-solar:eye-bold-duotone"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    size="sm"
    :expand="false"
  >
    <FieldCheckbox v-model="gazeTrackingEnabled" :label="t('settings.mmd.gaze.tracking')" />
  </Section>

  <Section
    :title="t('settings.mmd.animation.title')"
    icon="i-solar:play-bold-duotone"
    inner-class="text-sm"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    size="sm"
    :expand="false"
  >
    <p :class="['mb-2', 'text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
      {{ t('settings.mmd.animation.description') }}
    </p>
    <Button variant="secondary" :class="['mb-2']" @click="vmdDialog.open()">
      {{ t('settings.mmd.animation.import-motion') }}
    </Button>
    <FieldCombobox
      v-if="motionOptions.length > 0"
      :model-value="idleMotionName"
      :options="motionOptions"
      :label="t('settings.mmd.animation.idle-motion')"
      @update:model-value="handleIdleMotionSelect"
    />
    <div v-if="availableMotions.length > 0" :class="['mt-2', 'flex', 'flex-col', 'gap-1']">
      <div
        v-for="motion in availableMotions"
        :key="motion.name"
        :class="['flex', 'items-center', 'justify-between', 'gap-2']"
      >
        <div :class="['truncate', 'text-sm']">
          {{ motion.name }}
        </div>
        <Button variant="secondary" :class="['shrink-0']" @click="playMotionOnce(motion.name)">
          {{ t('settings.mmd.animation.play-once') }}
        </Button>
      </div>
    </div>
  </Section>

  <Section
    :title="t('settings.mmd.morphs.title')"
    icon="i-solar:emoji-funny-square-bold-duotone"
    inner-class="text-sm"
    :class="['rounded-xl', 'bg-white/80 dark:bg-black/75', 'backdrop-blur-lg']"
    size="sm"
    :expand="false"
  >
    <p :class="['text-xs', 'text-neutral-500', 'dark:text-neutral-400']">
      {{ t('settings.mmd.morphs.description') }}
    </p>
  </Section>
</template>
