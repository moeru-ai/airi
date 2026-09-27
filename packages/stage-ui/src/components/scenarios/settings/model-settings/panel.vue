<script setup lang="ts">
import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewSnapshotPayload,
} from '@proj-airi/stage-shared/godot-stage'
import type { Live2DExpressionSettingsCommand } from '@proj-airi/stage-ui-live2d/stores/expression-store'

import type { DisplayModel } from '../../../../stores/display-models'
import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { errorMessageFrom } from '@moeru/std'
import { Button, Callout, ScrollableArea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import Godot from './godot.vue'
import Live2D from './live2d.vue'
import MMD from './mmd.vue'
import Spine from './spine.vue'
import Tachie from './tachie.vue'
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
  live2dExpressionCommand: [command: Live2DExpressionSettingsCommand]
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
const { activeCard } = storeToRefs(airiCardStore)
const { stageModelRenderer, stageModelSelectedDisplayModel } = storeToRefs(settingsStore)
const isSaving = ref(false)
const saveError = ref('')
const inheritsModel = computed(() => !activeCard.value?.extensions.airi.modules.displayModelId)

const effectiveRenderer = computed(() => resolveModelSettingsPanelRenderer({
  settingsRenderer: stageModelRenderer.value,
  runtimeRenderer: props.runtimeSnapshot.renderer,
}))

async function handleModelPick(selectedModel: DisplayModel | undefined) {
  if (isSaving.value)
    return
  isSaving.value = true
  saveError.value = ''
  try {
    const updated = await airiCardStore.updateActiveCardDisplayModel(selectedModel?.id)
    if (!updated) {
      saveError.value = t('settings.model-select.character-binding.save-failed')
      return
    }
    await settingsStore.updateStageModel()
  }
  catch (error) {
    saveError.value = errorMessageFrom(error) ?? t('settings.model-select.character-binding.save-failed')
  }
  finally {
    isSaving.value = false
  }
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
      <section v-if="activeCard" :class="['rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800']">
        <h2 :class="['text-sm font-semibold']">
          {{ t('settings.model-select.character-binding.title', { name: activeCard.name }) }}
        </h2>
        <p :class="['mt-1 text-sm']">
          {{ stageModelSelectedDisplayModel?.name ?? t('settings.model-select.character-binding.no-model') }}
          <span :class="['text-xs text-neutral-500 dark:text-neutral-400']">
            · {{ t(inheritsModel ? 'settings.model-select.character-binding.inherited' : 'settings.model-select.character-binding.bound') }}
          </span>
        </p>
        <p :class="['mt-2 text-xs text-neutral-500 dark:text-neutral-400']">
          {{ t('settings.model-select.character-binding.shared-scope') }}
        </p>
        <Button v-if="!inheritsModel" :class="['mt-3']" variant="secondary" :loading="isSaving" @click="handleModelPick(undefined)">
          {{ t('settings.model-select.character-binding.use-default') }}
        </Button>
        <p v-if="saveError" role="alert" :class="['mt-2 text-sm text-red-600 dark:text-red-400']">
          {{ saveError }}
        </p>
      </section>
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
          <Button :disabled="isSaving || !activeCard">
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
      <Godot
        v-if="effectiveRenderer === 'godot'"
        :runtime-snapshot="runtimeSnapshot"
        :view-snapshot="godotViewSnapshot"
        :view-error="godotViewError"
        :view-controls-locked="godotViewControlsLocked"
        @patch-view-state="emit('patchGodotViewState', $event)"
      />
    </div>
  </ScrollableArea>
</template>
