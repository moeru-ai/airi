<script setup lang="ts">
import type { Live2DExpressionSettingsCommand } from '@proj-airi/stage-ui-live2d/stores/expression-store'

import type { DisplayModel } from '../../../../stores/display-models'
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { Button, Callout, ScrollableArea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Live2D from './live2d.vue'
import MMD from './mmd.vue'
import Spine from './spine.vue'
import Tachie from './tachie.vue'
import VRM from './vrm.vue'

import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useSettings } from '../../../../stores/settings'
import { ModelSelectorDialog } from '../../dialogs/model-selector'

interface ModelSettingsPanelProps {
  palette: string[]
  settingsClass?: string | string[]
  allowExtractColors?: boolean
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
}

interface ModelSettingsPanelEmits {
  extractColorsFromModel: []
  live2dExpressionCommand: [command: Live2DExpressionSettingsCommand]
}

const props = withDefaults(defineProps<ModelSettingsPanelProps>(), {
  allowExtractColors: true,
})

const emit = defineEmits<ModelSettingsPanelEmits>()

const { t } = useI18n()
const modelSelectorOpen = ref(false)
const settingsStore = useSettings()
const airiCardStore = useAiriCardStore()
const { stageModelSelected, stageModelSelectedDisplayModel } = storeToRefs(settingsStore)

const effectiveRenderer = computed(() => props.runtimeSnapshot.renderer)

async function handleModelPick(selectedModel: DisplayModel | undefined) {
  stageModelSelected.value = selectedModel?.id ?? ''
  await airiCardStore.updateActiveCardDisplayModel(selectedModel?.id)
  await settingsStore.updateStageModel()
}
</script>

<template>
  <ScrollableArea
    :class="[
      'z-10',
      settingsClass,
    ]"
  >
    <div :class="['flex flex-col gap-2 p-2']">
      <Callout :label="t('settings.model-select.panel-callout.support-status-header')">
        <i18n-t keypath="settings.model-select.panel-callout.support-status" tag="p">
          <template #select-button>
            <strong>{{ t('settings.model-select.select-model.button') }}</strong>
          </template>
          <template #zip>
            <code>.zip</code>
          </template>
          <template #vrm>
            <code>.vrm</code>
          </template>
          <template #mmd>
            <code>.pmx</code>/<code>.pmd</code>
          </template>
        </i18n-t>
        <p>
          {{ t('settings.model-select.panel-callout.model-type-example') }}
        </p>
        <p v-if="effectiveRenderer === 'tachie'">
          {{ t('settings.tachie.archive-description') }}
        </p>
      </Callout>
      <div :class="['flex flex-wrap items-center gap-2']">
        <ModelSelectorDialog v-model:show="modelSelectorOpen" :selected-model="stageModelSelectedDisplayModel" @pick="handleModelPick">
          <Button>
            {{ t('settings.model-select.select-model.button') }}
          </Button>
        </ModelSelectorDialog>
        <slot name="actions" />
      </div>
      <Live2D
        v-if="effectiveRenderer === 'live2d'"
        :allow-extract-colors="allowExtractColors"
        :palette="palette"
        :runtime-snapshot="runtimeSnapshot"
        @extract-colors-from-model="emit('extractColorsFromModel')"
        @live2d-expression-command="emit('live2dExpressionCommand', $event)"
      />
      <VRM
        v-if="effectiveRenderer === 'vrm'"
        :allow-extract-colors="allowExtractColors"
        :palette="palette"
        :runtime-snapshot="runtimeSnapshot"
        @extract-colors-from-model="emit('extractColorsFromModel')"
      />
      <Spine
        v-if="effectiveRenderer === 'spine'"
        :allow-extract-colors="allowExtractColors"
        :palette="palette"
        :runtime-snapshot="runtimeSnapshot"
        @extract-colors-from-model="$emit('extractColorsFromModel')"
      />
      <MMD
        v-if="effectiveRenderer === 'mmd'"
        :allow-extract-colors="allowExtractColors"
        :palette="palette"
        :runtime-snapshot="runtimeSnapshot"
        @extract-colors-from-model="emit('extractColorsFromModel')"
      />
      <Tachie
        v-if="effectiveRenderer === 'tachie'"
        :allow-extract-colors="allowExtractColors"
        :palette="palette"
        :runtime-snapshot="runtimeSnapshot"
        @extract-colors-from-model="emit('extractColorsFromModel')"
      />
    </div>
  </ScrollableArea>
</template>
