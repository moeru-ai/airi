<script setup lang="ts">
import type { DisplayModel } from '@proj-airi/stage-ui/stores/display-models'

import type {
  ElectronGodotStageSceneInputPayload,
  ElectronGodotStageStatus,
} from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ModelSettingsPanel } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings'
import { DisplayModelFormat } from '@proj-airi/stage-ui/stores/display-models'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

import {
  electronGodotStageApplySceneInput,
  electronGodotStageGetStatus,
  electronGodotStageStart,
  electronGodotStageStop,
} from '../../../../shared/eventa'
import { useModelSettingsRuntimeSnapshot } from '../../../composables/model-settings-runtime-snapshot'
import { assertGodotSceneInputSupportedDisplayModel } from './godot-scene-input'

const settingsStore = useSettings()
const { stageModelRenderer, stageModelSelectedDisplayModel } = storeToRefs(settingsStore)
const applyGodotStageSceneInput = useElectronEventaInvoke(electronGodotStageApplySceneInput)
const getGodotStageStatus = useElectronEventaInvoke(electronGodotStageGetStatus)
const startGodotStage = useElectronEventaInvoke(electronGodotStageStart)
const stopGodotStage = useElectronEventaInvoke(electronGodotStageStop)

const palette = ref<string[]>([])
const godotStageError = ref<string>()
const godotStageStatus = ref<ElectronGodotStageStatus>({
  state: 'stopped',
  pid: null,
  updatedAt: 0,
})
const switchingGodotStage = ref(false)
const { runtimeSnapshot } = useModelSettingsRuntimeSnapshot()

let latestSceneSyncRequest = 0

const usesGodotStage = computed(() => stageModelRenderer.value === 'godot')
const godotToggleLabel = computed(() => usesGodotStage.value
  ? 'Back to Built-in Stage'
  : 'Switch to Godot Stage (Experimental)')
const godotStatusMessage = computed(() => {
  if (godotStageError.value)
    return godotStageError.value

  if (godotStageStatus.value.state === 'error')
    return godotStageStatus.value.lastError

  return undefined
})

function createEmptyGodotStageStatus(): ElectronGodotStageStatus {
  return {
    state: 'stopped',
    pid: null,
    updatedAt: Date.now(),
  }
}

function inferModelFileExtension(format: DisplayModelFormat) {
  switch (format) {
    case DisplayModelFormat.Live2dZip:
      return '.zip'
    case DisplayModelFormat.Live2dDirectory:
      return '.live2d'
    case DisplayModelFormat.VRM:
      return '.vrm'
    case DisplayModelFormat.PMXZip:
      return '.zip'
    case DisplayModelFormat.PMXDirectory:
      return '.pmxdir'
    case DisplayModelFormat.PMD:
      return '.pmd'
    default:
      return '.bin'
  }
}

function inferModelFileName(model: DisplayModel) {
  if (model.type === 'file')
    return model.file.name

  try {
    const url = new URL(model.url)
    const parsedName = url.pathname.split('/').pop()
    if (parsedName)
      return parsedName
  }
  catch {}

  return `${model.id}${inferModelFileExtension(model.format)}`
}

async function readSceneInputData(model: DisplayModel) {
  if (model.type === 'file')
    return new Uint8Array(await model.file.arrayBuffer())

  const response = await fetch(model.url)
  if (!response.ok)
    throw new Error(`Failed to fetch model asset (${response.status} ${response.statusText})`)

  return new Uint8Array(await response.arrayBuffer())
}

async function createSceneInputPayload(model: DisplayModel): Promise<ElectronGodotStageSceneInputPayload> {
  assertGodotSceneInputSupportedDisplayModel(model)

  return {
    modelId: model.id,
    format: DisplayModelFormat.VRM,
    name: model.name,
    fileName: inferModelFileName(model),
    data: await readSceneInputData(model),
  }
}

async function refreshGodotStageStatus() {
  try {
    godotStageStatus.value = await getGodotStageStatus()
  }
  catch (error) {
    godotStageStatus.value = createEmptyGodotStageStatus()
    godotStageError.value = errorMessageFrom(error) ?? 'Failed to query Godot stage status.'
  }
}

async function syncGodotSceneInput(model: DisplayModel) {
  const requestId = ++latestSceneSyncRequest

  try {
    const payload = await createSceneInputPayload(model)
    if (requestId !== latestSceneSyncRequest)
      return

    await applyGodotStageSceneInput(payload)
    if (requestId !== latestSceneSyncRequest)
      return

    godotStageError.value = undefined
  }
  catch (error) {
    if (requestId !== latestSceneSyncRequest)
      return

    godotStageError.value = errorMessageFrom(error) ?? 'Failed to apply model input to Godot stage.'
  }
}

async function handleGodotStageToggle() {
  switchingGodotStage.value = true
  godotStageError.value = undefined

  try {
    if (usesGodotStage.value) {
      godotStageStatus.value = await stopGodotStage()
      settingsStore.restoreBuiltInStageModelRenderer()
      return
    }

    godotStageStatus.value = await startGodotStage()
    settingsStore.setStageModelRenderer('godot')
  }
  catch (error) {
    godotStageError.value = errorMessageFrom(error) ?? 'Failed to switch Godot stage mode.'
    await refreshGodotStageStatus()
  }
  finally {
    switchingGodotStage.value = false
  }
}

watch(
  [stageModelRenderer, stageModelSelectedDisplayModel, () => godotStageStatus.value.state],
  ([renderer, model, stageState]) => {
    if (renderer !== 'godot' || stageState !== 'running' || !model)
      return

    void syncGodotSceneInput(model)
  },
  { immediate: true },
)

onMounted(async () => {
  await refreshGodotStageStatus()
})
</script>

<template>
  <div :class="['relative', 'h-full', 'flex flex-col items-center gap-3']">
    <Callout
      v-if="godotStatusMessage"
      :class="['w-full max-w-6xl']"
      label="Godot Stage"
      theme="orange"
    >
      <p>{{ godotStatusMessage }}</p>
    </Callout>

    <div :class="['relative', 'h-full', 'flex justify-center', 'w-full']">
      <ModelSettingsPanel
        :allow-extract-colors="false"
        :palette="palette"
        :runtime-snapshot="runtimeSnapshot"
        :settings-class="[
          'w-full',
          'max-w-6xl',
          'h-fit',
          'sm:max-h-[80dvh]',
          'overflow-y-scroll',
          'relative',
        ]"
      >
        <template #actions>
          <Button
            variant="secondary"
            :loading="switchingGodotStage"
            :toggled="usesGodotStage"
            @click="handleGodotStageToggle"
          >
            {{ godotToggleLabel }}
          </Button>
        </template>
      </ModelSettingsPanel>
    </div>
  </div>

  <div
    v-motion
    :class="[
      'fixed',
      'right--5 top-[calc(100dvh-15rem)] bottom-0 z--1',
      'pointer-events-none flex size-60 items-center justify-center',
      'text-neutral-200/50 dark:text-neutral-600/20',
    ]"
    :initial="{ scale: 0.9, opacity: 0, y: 15 }"
    :enter="{ scale: 1, opacity: 1, y: 0 }"
    :duration="500"
  >
    <div class="i-solar:people-nearby-bold-duotone text-60" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.models.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.models.description
  icon: i-solar:people-nearby-bold-duotone
  settingsEntry: true
  order: 4
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
