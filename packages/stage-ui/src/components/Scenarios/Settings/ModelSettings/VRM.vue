<script setup lang="ts">
import { Input } from '@proj-airi/ui'
import { useFileDialog } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVRM } from '../../../../stores'
import { Section } from '../../../Layouts'
import { Button } from '../../../Misc'
import { ColorPalette } from '../../../Widgets'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
  (e: 'switchToLive2D'): void
}>()

const { t } = useI18n()

const modelFileDialog = useFileDialog({
  accept: '.vrm',
})

const vrm = useVRM()
const {
  modelFile,
  loadSource,
  loadingModel,
  modelUrl,
} = storeToRefs(vrm)
const localModelUrl = ref(modelUrl.value)

modelFileDialog.onChange((files) => {
  if (files && files.length > 0) {
    modelFile.value = files[0]
    loadSource.value = 'file'
    loadingModel.value = true
  }
})
</script>

<template>
  <Section
    :title="t('settings.vrm.switch-to-vrm.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Button variant="secondary" @click="$emit('switchToLive2D')">
      {{ t('settings.vrm.switch-to-vrm.change-to-vrm') }}
    </Button>
  </Section>
  <Section
    :title="t('settings.vrm.change-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="text-sm"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <Button variant="secondary" @click="modelFileDialog.open()">
      {{ t('settings.vrm.change-model.from-file') }}...
    </Button>
    <div flex items-center gap-2>
      <Input
        v-model="localModelUrl"
        :disabled="loadingModel"
        class="flex-1"
        :placeholder="t('settings.vrm.change-model.from-url-placeholder')"
      />
      <Button size="sm" variant="secondary" @click="modelUrl = localModelUrl">
        {{ t('settings.vrm.change-model.from-url') }}
      </Button>
    </div>
  </Section>
  <Section
    :title="t('settings.vrm.theme-color-from-model.title')"
    icon="i-solar:magic-stick-3-bold-duotone"
    inner-class="text-sm"
    :class="[
      'rounded-xl',
      'bg-white/80  dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <ColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" mx-auto />
    <Button variant="secondary" @click="$emit('extractColorsFromModel')">
      {{ t('settings.vrm.theme-color-from-model.button-extract.title') }}
    </Button>
  </Section>
</template>
