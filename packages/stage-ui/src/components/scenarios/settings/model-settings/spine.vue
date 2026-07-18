<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { useSpine } from '@proj-airi/stage-ui-spine'
import { Button, FieldCombobox, FieldRange, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useSettings } from '../../../../stores/settings'
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

const settings = useSettings()
const {
  spineDefaultMixDuration,
  spineMaxFps,
  spineRenderScale,
} = storeToRefs(settings)

const spineStore = useSpine()
const {
  scale,
  position,
  currentAnimation,
  availableAnimations,
  currentSkin,
  availableSkins,
  availableVariants,
  currentVariant,
  animationSpeed,
} = storeToRefs(spineStore)

const canExtractColors = computed(() => props.runtimeSnapshot.canCapturePreview)
const hasMultipleVariants = computed(() => availableVariants.value.length > 1)

const variantOptions = computed(() => availableVariants.value.map(v => ({
  label: v.name,
  value: v.name,
  description: '',
})))

const animationOptions = computed(() => availableAnimations.value.map(animation => ({
  label: animation.name,
  value: animation.name,
  description: `${animation.duration.toFixed(2)}s`,
})))

const skinOptions = computed(() => availableSkins.value.map(skin => ({
  label: skin.name,
  value: skin.name,
  description: '',
})))

const fpsOptions = computed(() => [
  { value: 0, label: t('settings.spine.fps.options.unlimited') },
  { value: 60, label: '60' },
  { value: 30, label: '30' },
])

function handleVariantSelect(variantName: string | number | undefined) {
  if (typeof variantName !== 'string')
    return
  currentVariant.value = variantName
}

function handleAnimationSelect(animationName: string | number | undefined) {
  if (typeof animationName !== 'string')
    return
  currentAnimation.value = { ...currentAnimation.value, name: animationName }
}

function handleSkinSelect(skinName: string | number | undefined) {
  if (typeof skinName !== 'string')
    return
  currentSkin.value = skinName
}
</script>

<template>
  <Section
    :title="t('settings.spine.scale-and-position.title')"
    icon="i-solar:scale-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="true"
  >
    <FieldRange v-model="scale" as="div" :min="0.1" :max="3" :step="0.01" :default-value="1" :label="t('settings.spine.scale-and-position.scale')" />
    <FieldRange v-model="position.x" as="div" :min="-3000" :max="3000" :step="1" :default-value="0" :label="t('settings.spine.scale-and-position.x')" />
    <FieldRange v-model="position.y" as="div" :min="-3000" :max="3000" :step="1" :default-value="0" :label="t('settings.spine.scale-and-position.y')" />
  </Section>

  <Section
    v-if="allowExtractColors"
    :title="t('settings.spine.theme-color-from-model.title')"
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
    <Button variant="secondary" :disabled="!canExtractColors" @click="$emit('extractColorsFromModel')">
      {{ t('settings.spine.theme-color-from-model.button-extract.title') }}
    </Button>
  </Section>

  <Section
    :title="t('settings.spine.appearance.title')"
    icon="i-solar:hanger-2-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <FieldCombobox
      v-if="hasMultipleVariants"
      :model-value="currentVariant"
      :options="variantOptions"
      :label="t('settings.spine.variant.title')"
      @update:model-value="handleVariantSelect"
    />
    <FieldCombobox
      :model-value="currentSkin"
      :options="skinOptions"
      :label="t('settings.spine.skin.title')"
      @update:model-value="handleSkinSelect"
    />
  </Section>

  <Section
    :title="t('settings.spine.animation.title')"
    icon="i-solar:play-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <FieldCombobox
      :model-value="currentAnimation.name"
      :options="animationOptions"
      :label="t('settings.spine.animation.idle-animation')"
      @update:model-value="handleAnimationSelect"
    />
    <FieldRange v-model="spineDefaultMixDuration" as="div" :min="0" :max="2" :step="0.05" :default-value="0.2" :label="t('settings.spine.animation.mix-duration')" />
    <FieldRange v-model="animationSpeed" as="div" :min="0.1" :max="3" :step="0.05" :default-value="1" :label="t('settings.spine.animation.speed')" />
  </Section>

  <Section
    :title="t('settings.spine.rendering.title')"
    icon="i-solar:settings-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <div :class="['flex', 'items-center', 'justify-between', 'gap-2']">
      <div :class="['text-sm', 'font-medium']">
        {{ t('settings.spine.rendering.max-fps') }}
      </div>
      <SelectTab v-model="spineMaxFps" :options="fpsOptions" size="sm" :class="['shrink-0']" />
    </div>
    <FieldRange v-model="spineRenderScale" as="div" :min="0.5" :max="3" :step="0.1" :default-value="1" :label="t('settings.spine.rendering.render-scale')" />
  </Section>
</template>
