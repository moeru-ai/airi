<script setup lang="ts">
import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewSnapshotPayload,
  StageViewState,
} from '@proj-airi/stage-shared/godot-stage'

import type { ModelSettingsRuntimeSnapshot } from './runtime'

import { Callout } from '@proj-airi/ui'
import { computed, ref, shallowRef, watch } from 'vue'

import { Container, PropertyNumber } from '../../../data-pane'
import { cloneStageViewStateForDraft, resolveGodotCameraPositionRange } from './runtime'

interface GodotModelSettingsProps {
  runtimeSnapshot: ModelSettingsRuntimeSnapshot
  viewSnapshot: StageViewSnapshotPayload | null
  viewError?: StageViewErrorPayload
  viewControlsLocked: boolean
}

interface GodotModelSettingsEmits {
  patchViewState: [patch: StageViewPatch]
}

const props = defineProps<GodotModelSettingsProps>()
const emit = defineEmits<GodotModelSettingsEmits>()

const statusText = computed(() => {
  if (props.runtimeSnapshot.phase === 'no-model')
    return 'Select a VRM model before adjusting Godot stage view controls.'

  if (!props.viewSnapshot)
    return 'Godot stage view snapshot has not been received. Check the Electron/Godot bridge and Godot view-state payload parsing.'

  return undefined
})
const statusTheme = computed(() => {
  if (props.viewError || (!props.viewSnapshot && props.runtimeSnapshot.phase !== 'no-model'))
    return 'orange'

  return 'primary'
})

const draftState = ref<StageViewState | null>(null)
const cameraPositionRange = shallowRef(4)
const cameraPositionRangeLocked = shallowRef(false)
const controlsLocked = computed(() => props.viewControlsLocked || !draftState.value)
const settingsLockClass = computed(() => {
  return controlsLocked.value ? ['pointer-events-none', 'opacity-60'] : []
})
const snapshotMeta = computed(() => {
  const snapshot = props.viewSnapshot
  if (!snapshot)
    return undefined

  return `Revision ${snapshot.state.revision} · ${snapshot.reason}`
})
const cameraPositionConfig = computed(() => ({
  min: -cameraPositionRange.value,
  max: cameraPositionRange.value,
  step: 0.01,
  formatValue: formatDecimalValue,
  disabled: controlsLocked.value,
}))
const cameraYawConfig = computed(() => ({
  min: -180,
  max: 180,
  step: 1,
  formatValue: formatIntegerValue,
  disabled: controlsLocked.value,
}))
const cameraPitchConfig = computed(() => ({
  min: -80,
  max: 80,
  step: 1,
  formatValue: formatIntegerValue,
  disabled: controlsLocked.value,
}))
const cameraFovConfig = computed(() => ({
  min: 10,
  max: 120,
  step: 1,
  formatValue: formatIntegerValue,
  disabled: controlsLocked.value,
}))

watch(() => props.viewSnapshot, (snapshot) => {
  if (!snapshot) {
    draftState.value = null
    cameraPositionRange.value = 4
    cameraPositionRangeLocked.value = false
    return
  }

  draftState.value = cloneSnapshotForDraft(snapshot)
  lockCameraPositionRangeFromSnapshot(snapshot)
}, { immediate: true })

function formatDecimalValue(value: number) {
  return value.toFixed(2)
}

function formatIntegerValue(value: number) {
  return value.toFixed(0)
}

function cloneSnapshotForDraft(snapshot: StageViewSnapshotPayload) {
  if (snapshot.reason === 'loaded')
    return cloneStageViewStateForDraft(snapshot.state)

  // FOV is settings-owned for now, so local slider edits should not be overwritten by camera snapshots from Godot.
  const fovDeg = draftState.value?.camera.fovDeg
  return cloneStageViewStateForDraft(snapshot.state, { fovDeg })
}

function lockCameraPositionRangeFromSnapshot(snapshot: StageViewSnapshotPayload) {
  if (!snapshot.avatarBounds)
    return

  if (snapshot.reason !== 'loaded' && cameraPositionRangeLocked.value)
    return

  // NOTICE:
  // The position slider range is a load-time affordance. It includes the
  // bootstrap camera position so bad bounds cannot make the initial camera
  // unreachable, but later camera movement must not keep expanding the range.
  cameraPositionRange.value = resolveGodotCameraPositionRange({
    loadTimeState: snapshot.state,
    avatarBounds: snapshot.avatarBounds,
  })
  cameraPositionRangeLocked.value = true
}

function createNumberModel(
  getter: (state: StageViewState) => number,
  applyDraft: (state: StageViewState, value: number) => void,
  patcher: (value: number) => StageViewPatch,
) {
  return computed({
    get: () => {
      if (!draftState.value)
        return 0

      return getter(draftState.value)
    },
    set: (value) => {
      if (!Number.isFinite(value) || !draftState.value)
        return

      applyDraft(draftState.value, value)
      emit('patchViewState', patcher(value))
    },
  })
}

const cameraPositionX = createNumberModel(
  state => state.camera.position.x,
  (state, value) => {
    state.camera.position.x = value
  },
  value => ({ camera: { position: { x: value } } }),
)
const cameraPositionY = createNumberModel(
  state => state.camera.position.y,
  (state, value) => {
    state.camera.position.y = value
  },
  value => ({ camera: { position: { y: value } } }),
)
const cameraPositionZ = createNumberModel(
  state => state.camera.position.z,
  (state, value) => {
    state.camera.position.z = value
  },
  value => ({ camera: { position: { z: value } } }),
)
const cameraYaw = createNumberModel(
  state => state.camera.yawDeg,
  (state, value) => {
    state.camera.yawDeg = value
  },
  value => ({ camera: { yawDeg: value } }),
)
const cameraPitch = createNumberModel(
  state => state.camera.pitchDeg,
  (state, value) => {
    state.camera.pitchDeg = value
  },
  value => ({ camera: { pitchDeg: value } }),
)
const cameraFov = createNumberModel(
  state => state.camera.fovDeg,
  (state, value) => {
    state.camera.fovDeg = value
  },
  value => ({ camera: { fovDeg: value } }),
)
</script>

<template>
  <Callout
    v-if="statusText || viewError"
    label="Godot Stage (Experimental)"
    :theme="statusTheme"
  >
    <p v-if="viewError">
      {{ viewError.message }}
    </p>
    <p v-if="statusText">
      {{ statusText }}
    </p>
  </Callout>

  <Container
    title="Godot View"
    icon="i-solar:camera-bold-duotone"
    :class="[
      'rounded-xl',
      'bg-white/80 dark:bg-black/75',
      'backdrop-blur-lg',
    ]"
  >
    <div :class="['flex items-center justify-between gap-2 px-2 pb-2']">
      <div :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        {{ snapshotMeta ?? 'No Godot stage view snapshot received' }}
      </div>
    </div>

    <div
      :class="[
        'grid grid-cols-5',
        'gap-1 p-2',
        ...settingsLockClass,
      ]"
    >
      <PropertyNumber
        v-model="cameraPositionX"
        :config="cameraPositionConfig"
        label="Camera X"
      />
      <PropertyNumber
        v-model="cameraPositionY"
        :config="cameraPositionConfig"
        label="Camera Y"
      />
      <PropertyNumber
        v-model="cameraPositionZ"
        :config="cameraPositionConfig"
        label="Camera Z"
      />
      <PropertyNumber
        v-model="cameraYaw"
        :config="cameraYawConfig"
        label="Camera Yaw"
      />
      <PropertyNumber
        v-model="cameraPitch"
        :config="cameraPitchConfig"
        label="Camera Pitch"
      />
      <PropertyNumber
        v-model="cameraFov"
        :config="cameraFovConfig"
        label="Camera FOV"
      />
    </div>
  </Container>
</template>
