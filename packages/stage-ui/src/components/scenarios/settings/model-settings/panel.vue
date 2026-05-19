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
    <Callout label="We support both 2D and 3D models">
      <p>
        Click <strong>Select Model</strong> to import different formats of
        models into catalog, currently, <code>.zip</code> (Live2D, Spine) and <code>.vrm</code> (VRM) are supported.
      </p>
      <p>
        Neuro-sama uses 2D model driven by Live2D Inc. developed framework.
        Grok Ani uses 3D model that is driven by VRM / MMD open formats.
        Spine 2D models are supported via Esoteric Software's Spine runtime.
      </p>
    </Callout>
    <div :class="['flex flex-wrap items-center gap-2']">
      <ModelSelectorDialog v-model:show="modelSelectorOpen" :selected-model="stageModelSelectedDisplayModel" @pick="handleModelPick">
        <Button variant="secondary">
          Select Model
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
