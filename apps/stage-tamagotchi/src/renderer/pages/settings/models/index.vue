<script setup lang="ts">
import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewSnapshotPayload,
} from '@proj-airi/stage-shared/godot-stage'
import type { DisplayModel } from '@proj-airi/stage-ui/stores/display-models'

import type {
  ElectronGodotStageSceneInputPayload,
  ElectronGodotStageStatus,
} from '../../../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ModelSettingsPanel } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Button, Callout } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import {
  electronGodotStageApplySceneInput,
  electronGodotStageApplyViewPatch,
  electronGodotStageGetStatus,
  electronGodotStageGetViewSnapshot,
  electronGodotStageRequestViewSnapshot,
  electronGodotStageStart,
  electronGodotStageStatusChanged,
  electronGodotStageStop,
  electronGodotStageViewSnapshotChanged,
  electronGodotStageViewStateError,
} from '../../../../shared/eventa'
import { useModelSettingsRuntimeSnapshot } from '../../../composables/model-settings-runtime-snapshot'
import { assertGodotSceneInputSupportedDisplayModel } from './godot-scene-input'
import { createGodotViewPatchQueue } from './godot-view-patch-queue'
import {
  resolveGodotViewSessionTransition,
  shouldAcceptGodotViewSessionEvent,
} from './godot-view-session'

const settingsStore = useSettings()
const { stageModelRenderer, stageModelSelectedDisplayModel } = storeToRefs(settingsStore)
const context = useElectronEventaContext()
const applyGodotStageSceneInput = useElectronEventaInvoke(electronGodotStageApplySceneInput)
const applyGodotStageViewPatch = useElectronEventaInvoke(electronGodotStageApplyViewPatch)
const getGodotStageStatus = useElectronEventaInvoke(electronGodotStageGetStatus)
const getGodotStageViewSnapshot = useElectronEventaInvoke(electronGodotStageGetViewSnapshot)
const requestGodotStageViewSnapshot = useElectronEventaInvoke(electronGodotStageRequestViewSnapshot)
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
const godotViewError = ref<StageViewErrorPayload>()
const godotViewSnapshot = ref<StageViewSnapshotPayload | null>(null)
const { runtimeSnapshot } = useModelSettingsRuntimeSnapshot()

let sceneSyncGeneration = 0
let godotSessionEpoch = 0
let disposeGodotStageStatusListener: (() => void) | undefined
let disposeGodotViewSnapshotListener: (() => void) | undefined
let disposeGodotViewErrorListener: (() => void) | undefined

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
const godotViewControlsLocked = computed(() => {
  return godotStageStatus.value.state !== 'running' || !godotViewSnapshot.value
})

function createStoppedGodotStageStatus(): ElectronGodotStageStatus {
  return {
    state: 'stopped',
    pid: null,
    updatedAt: Date.now(),
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

  return `${model.id}.vrm`
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
    format: 'vrm',
    name: model.name,
    fileName: inferModelFileName(model),
    data: await readSceneInputData(model),
  }
}

function nextGodotSessionEpoch() {
  godotSessionEpoch += 1
  return godotSessionEpoch
}

function isCurrentGodotSession(epoch: number) {
  return epoch === godotSessionEpoch
}

function setGodotViewError(error: unknown, fallbackMessage: string) {
  godotViewError.value = {
    code: 'invalid-payload',
    message: errorMessageFrom(error) ?? fallbackMessage,
  }
}

async function refreshGodotStageStatus() {
  try {
    applyGodotStageStatus(await getGodotStageStatus())
  }
  catch (error) {
    applyGodotStageStatus(createStoppedGodotStageStatus())
    godotStageError.value = errorMessageFrom(error) ?? 'Failed to query Godot stage status.'
  }
}

async function refreshGodotViewSnapshot(epoch = godotSessionEpoch) {
  try {
    const snapshot = await getGodotStageViewSnapshot()
    if (!isCurrentGodotSession(epoch))
      return

    godotViewSnapshot.value = snapshot
    godotViewError.value = undefined
  }
  catch (error) {
    if (!isCurrentGodotSession(epoch))
      return

    setGodotViewError(error, 'Failed to query Godot stage view state.')
  }
}

async function applyGodotViewPatchNow(patch: StageViewPatch) {
  const epoch = godotSessionEpoch

  try {
    await applyGodotStageViewPatch(patch)
    if (!isCurrentGodotSession(epoch))
      return

    godotViewError.value = undefined
  }
  catch (error) {
    if (!isCurrentGodotSession(epoch))
      return

    setGodotViewError(error, 'Failed to apply Godot stage view patch.')
  }
}

const godotViewPatchQueue = createGodotViewPatchQueue({
  applyPatch: applyGodotViewPatchNow,
  intervalMs: 50,
})

function endGodotViewSession() {
  nextGodotSessionEpoch()
  sceneSyncGeneration += 1
  godotViewSnapshot.value = null
  godotViewError.value = undefined
  godotViewPatchQueue.reset()
}

function beginGodotViewSession() {
  const epoch = nextGodotSessionEpoch()
  godotViewSnapshot.value = null
  godotViewError.value = undefined
  godotViewPatchQueue.reset()
  void refreshGodotViewSnapshot(epoch)
  void handleGodotViewSnapshotRequest(epoch)
}

function applyGodotStageStatus(next: ElectronGodotStageStatus) {
  const previousState = godotStageStatus.value.state
  godotStageStatus.value = next

  const transition = resolveGodotViewSessionTransition(previousState, next.state)
  if (transition.end) {
    endGodotViewSession()
    return
  }

  if (transition.begin)
    beginGodotViewSession()
}

function handleGodotViewPatch(patch: StageViewPatch) {
  godotViewPatchQueue.enqueue(patch)
}

async function handleGodotViewSnapshotRequest(epoch = godotSessionEpoch) {
  try {
    await requestGodotStageViewSnapshot()
    if (!isCurrentGodotSession(epoch))
      return

    godotViewError.value = undefined
  }
  catch (error) {
    if (!isCurrentGodotSession(epoch))
      return

    setGodotViewError(error, 'Failed to request Godot stage view snapshot.')
  }
}

async function syncGodotSceneInput(model: DisplayModel) {
  const syncGeneration = ++sceneSyncGeneration
  const epoch = godotSessionEpoch

  try {
    const payload = await createSceneInputPayload(model)
    if (syncGeneration !== sceneSyncGeneration || !isCurrentGodotSession(epoch))
      return

    await applyGodotStageSceneInput(payload)
    if (syncGeneration !== sceneSyncGeneration || !isCurrentGodotSession(epoch))
      return

    void handleGodotViewSnapshotRequest(epoch)
    godotStageError.value = undefined
  }
  catch (error) {
    if (syncGeneration !== sceneSyncGeneration || !isCurrentGodotSession(epoch))
      return

    godotStageError.value = errorMessageFrom(error) ?? 'Failed to apply model input to Godot stage.'
  }
}

async function handleGodotStageToggle() {
  switchingGodotStage.value = true
  godotStageError.value = undefined

  try {
    if (usesGodotStage.value) {
      applyGodotStageStatus(await stopGodotStage())
      settingsStore.restoreBuiltInStageModelRenderer()
      return
    }

    applyGodotStageStatus(await startGodotStage())
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
  disposeGodotStageStatusListener = context.value.on(electronGodotStageStatusChanged, (event) => {
    if (!event.body)
      return

    applyGodotStageStatus(event.body)
  })

  disposeGodotViewSnapshotListener = context.value.on(electronGodotStageViewSnapshotChanged, (event) => {
    if (!event.body)
      return

    if (!shouldAcceptGodotViewSessionEvent(godotStageStatus.value.state))
      return

    godotViewSnapshot.value = event.body
    godotViewError.value = undefined
  })

  disposeGodotViewErrorListener = context.value.on(electronGodotStageViewStateError, (event) => {
    if (!event.body)
      return

    if (!shouldAcceptGodotViewSessionEvent(godotStageStatus.value.state))
      return

    godotViewError.value = event.body
  })

  await refreshGodotStageStatus()
})

onUnmounted(() => {
  disposeGodotStageStatusListener?.()
  disposeGodotStageStatusListener = undefined
  disposeGodotViewSnapshotListener?.()
  disposeGodotViewSnapshotListener = undefined
  disposeGodotViewErrorListener?.()
  disposeGodotViewErrorListener = undefined
  godotViewPatchQueue.dispose()
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
        :godot-view-error="godotViewError"
        :godot-view-controls-locked="godotViewControlsLocked"
        :godot-view-snapshot="godotViewSnapshot"
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
        @patch-godot-view-state="handleGodotViewPatch"
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
