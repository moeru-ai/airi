<script setup lang="ts">
import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewSnapshotPayload,
} from '@proj-airi/stage-shared/godot-stage'

import type { DisplayModel } from '../../../../stores/display-models'
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Godot from './godot.vue'
import Live2D from './live2d.vue'
import Spine from './spine.vue'
import VRM from './vrm.vue'

import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useSettings } from '../../../../stores/settings'
import { ModelSelectorDialog } from '../../dialogs/model-selector'
import { resolveModelSettingsPanelRenderer } from './runtime'

interface ModelSettingsPanelProps {
  palette: string[]
  settingsClass?: string | string[]
  allowExtractColors?: boolean
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
  godotViewSnapshot?: StageViewSnapshotPayload | null
  godotViewError?: StageViewErrorPayload
  godotViewControlsLocked?: boolean
}

interface ModelSettingsPanelEmits {
  extractColorsFromModel: []
  patchGodotViewState: [patch: StageViewPatch]
}

const props = withDefaults(defineProps<ModelSettingsPanelProps>(), {
  allowExtractColors: true,
  godotViewControlsLocked: true,
  godotViewSnapshot: null,
})

const emit = defineEmits<ModelSettingsPanelEmits>()

const { t } = useI18n()
const modelSelectorOpen = ref(false)
const settingsStore = useSettings()
const airiCardStore = useAiriCardStore()
const { stageModelRenderer, stageModelSelected, stageModelSelectedDisplayModel } = storeToRefs(settingsStore)

const effectiveRenderer = computed(() => resolveModelSettingsPanelRenderer({
  settingsRenderer: stageModelRenderer.value,
  runtimeRenderer: props.runtimeSnapshot.renderer,
}))

async function handleModelPick(selectedModel: DisplayModel | undefined) {
  stageModelSelected.value = selectedModel?.id ?? ''
  airiCardStore.updateActiveCardDisplayModel(selectedModel?.id)
  await settingsStore.updateStageModel()
}
</script>

<template>
  <div
    :class="[
      'flex flex-col gap-2',
      'z-10 overflow-y-scroll p-2',
      settingsClass,
    ]"
  >
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
      </i18n-t>
      <p>
        {{ t('settings.model-select.panel-callout.model-type-example') }}
      </p>
    </Callout>
    <div :class="['flex flex-wrap items-center gap-2']">
      <ModelSelectorDialog v-model:show="modelSelectorOpen" :selected-model="stageModelSelectedDisplayModel" @pick="handleModelPick">
        <Button variant="secondary">
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
    <Godot
      v-if="effectiveRenderer === 'godot'"
      :runtime-snapshot="runtimeSnapshot"
      :view-snapshot="godotViewSnapshot"
      :view-error="godotViewError"
      :view-controls-locked="godotViewControlsLocked"
      @patch-view-state="emit('patchGodotViewState', $event)"
    />
  </div>
</template>
