<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { tachieControlConfig, useTachie } from '@proj-airi/stage-ui-tachie'
import { Button, FieldCheckbox, FieldRange } from '@proj-airi/ui'
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

const emit = defineEmits<{
  extractColorsFromModel: []
}>()

const { t } = useI18n()
const tachie = useTachie()
const { position, scale, renderScale, shadowEnabled } = storeToRefs(tachie)
const canExtractColors = computed(() => props.runtimeSnapshot.canCapturePreview)
</script>

<template>
  <Section
    :title="t('settings.tachie.scale-and-position.title')"
    icon="i-solar:scale-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80 dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="true"
  >
    <FieldRange
      v-model="scale"
      as="div"
      :min="tachieControlConfig.scale.min"
      :max="tachieControlConfig.scale.max"
      :step="tachieControlConfig.scale.step"
      :default-value="tachieControlConfig.scale.default"
      :label="t('settings.tachie.scale-and-position.scale')"
    />
    <FieldRange
      v-model="position.x"
      as="div"
      :min="tachieControlConfig.x.min"
      :max="tachieControlConfig.x.max"
      :step="tachieControlConfig.x.step"
      :default-value="tachieControlConfig.x.default"
      :label="t('settings.tachie.scale-and-position.x')"
    />
    <FieldRange
      v-model="position.y"
      as="div"
      :min="tachieControlConfig.y.min"
      :max="tachieControlConfig.y.max"
      :step="tachieControlConfig.y.step"
      :default-value="tachieControlConfig.y.default"
      :label="t('settings.tachie.scale-and-position.y')"
    />
  </Section>

  <Section
    v-if="allowExtractColors"
    :title="t('settings.tachie.theme-color-from-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80 dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <ColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" mx-auto />
    <Button :disabled="!canExtractColors" @click="emit('extractColorsFromModel')">
      {{ t('settings.tachie.theme-color-from-model.button-extract.title') }}
    </Button>
  </Section>

  <Section
    :title="t('settings.tachie.rendering.title')"
    icon="i-solar:settings-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80 dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
    size="sm"
    :expand="false"
  >
    <FieldRange
      v-model="renderScale"
      as="div"
      :min="tachieControlConfig.renderScale.min"
      :max="tachieControlConfig.renderScale.max"
      :step="tachieControlConfig.renderScale.step"
      :default-value="tachieControlConfig.renderScale.default"
      :label="t('settings.tachie.rendering.render-scale')"
    />
    <FieldCheckbox
      v-model="shadowEnabled"
      :label="t('settings.tachie.rendering.shadow')"
      placement="right"
    />
  </Section>
</template>
