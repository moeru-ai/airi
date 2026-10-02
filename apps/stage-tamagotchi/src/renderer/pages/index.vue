<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import { errorMessageFrom } from '@moeru/std'
import { electron } from '@proj-airi/electron-eventa'
import {
  useElectronEventaInvoke,
  useElectronMouseAroundWindowBorder,
  useElectronMouseInElement,
  useElectronMouseInWindow,
  useElectronRelativeMouse,
} from '@proj-airi/electron-vueuse'
import { useExpressionStore } from '@proj-airi/stage-ui-live2d/stores/expression-store'
import { useModelStore, useThreeSceneIsTransparentAtPoint } from '@proj-airi/stage-ui-three'
import { HearingStatus, HoloCoupon } from '@proj-airi/stage-ui/components'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { refDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'
import { toast } from 'vue-sonner'

import AuthStatusIsland from '../components/stage-islands/auth-status-island.vue'
import ControlsIslandRoot from '../components/stage-islands/controls-island/controls-island-root.vue'
import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'

import { electronAppIsWayland, electronOpenInlay, electronOpenOnboarding } from '../../shared/eventa'
import { useModelSettingsRuntimeOwner } from '../composables/model-settings-runtime-owner'
import { useScreenAmbientLight } from '../composables/use-screen-ambient-light'
import { stageOpaqueAttribute } from '../composables/use-stage-painted-mask'
import { useControlsIslandStore } from '../stores/controls-island'
import { useStageWindowLifecycleStore } from '../stores/stage-window-lifecycle'
import { resolveFadeOnHoverInteraction } from '../utils/fade-on-hover'
import { shouldSampleStageTransparency } from '../utils/stage-three-transparency'

const hearingStatusElement = ref<HTMLElement>()
const authStatusElement = ref<HTMLElement>()
const { isOutside: outsideHearingStatus } = useElectronMouseInElement(hearingStatusElement)
const { isOutside: outsideAuthStatus } = useElectronMouseInElement(authStatusElement)
const controlsIslandRef = ref<InstanceType<typeof ControlsIsland>>()
const controlsIslandInteractionActive = shallowRef(false)
const widgetStageRef = ref<InstanceType<typeof WidgetStage>>()
// The stage canvas alpha tells the sampler which pixels of the window AIRI
// paints, so it can read the desktop showing through behind the character.
useScreenAmbientLight({ stageCanvas: () => widgetStageRef.value?.canvasElement() })
const stageCanvas = toRef(() => widgetStageRef.value?.canvasElement())
const componentStateStage = ref<'pending' | 'loading' | 'mounted'>('pending')
const stageMounted = computed(() => componentStateStage.value === 'mounted')
const isLoading = computed(() => !stageMounted.value)

const isIgnoringMouseEvents = ref(false)
const shouldFadeOnCursorWithin = ref(false)

const onboardingStore = useOnboardingStore()
const openOnboarding = useElectronEventaInvoke(electronOpenOnboarding)

const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
// The island already pairs its cursor signal with a DOM one and owns that decision, so
// read its answer rather than mounting a second set of listeners over the same element.
const isOutside = computed(() => controlsIslandRef.value?.isOutside ?? true)
const isOutsideFor250Ms = refDebounced(isOutside, 250)
const { x: relativeMouseX, y: relativeMouseY } = useElectronRelativeMouse()
// NOTICE: In real-world use cases of Fade on Hover feature, the cursor may move around the edge of the
// model rapidly, causing flickering effects when checking pixel transparency strictly.
// Here we use render-target pixel sampling to keep detection aligned with the actual render output.
const isTransparentByPixels = useCanvasPixelIsTransparentAtPoint(
  stageCanvas,
  relativeMouseX,
  relativeMouseY,
  { regionRadius: 25 },
)
const isTransparentByThree = useThreeSceneIsTransparentAtPoint(
  widgetStageRef,
  relativeMouseX,
  relativeMouseY,
  { regionRadius: 25 },
)
const isTransparentByPixelsExact = useCanvasPixelIsTransparentAtPoint(
  stageCanvas,
  relativeMouseX,
  relativeMouseY,
)
const isTransparentByThreeExact = useThreeSceneIsTransparentAtPoint(
  widgetStageRef,
  relativeMouseX,
  relativeMouseY,
)

const settingsStore = useSettings()
const { alwaysOnTop, stageModelRenderer, stageModelSelectedUrl } = storeToRefs(settingsStore)
const modelStore = useModelStore()
const expressionStore = useExpressionStore()
const { sceneMutationLocked, scenePhase } = storeToRefs(modelStore)
const { stagePaused } = storeToRefs(useStageWindowLifecycleStore())
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())
const modelSettingsRuntimeOwnerInstanceId = `tamagotchi-main-stage:${Math.random().toString(36).slice(2, 10)}`
const shouldUseThreeTransparencyHitTest = computed(() => shouldSampleStageTransparency({
  componentState: componentStateStage.value,
  stageModelRenderer: stageModelRenderer.value,
  stagePaused: stagePaused.value,
}))
/**
 * Drives the Auto Hide fade. `true` means "do not fade", so any case without a usable
 * region sampler reports `true` and the stage stays visible.
 */
const isTransparent = computed(() => {
  if (stagePaused.value || componentStateStage.value !== 'mounted' || !fadeOnHoverEnabled.value)
    return true

  // TresCanvas leaves preserveDrawingBuffer off, so VRM's canvas reads back empty and
  // has to sample an offscreen render target. Every other renderer keeps its last frame
  // readable, and a renderer with no canvas samples nothing and stays visible.
  if (stageModelRenderer.value === 'vrm')
    return shouldUseThreeTransparencyHitTest.value ? isTransparentByThree.value : true

  return isTransparentByPixels.value
})
/**
 * Whether the cursor sits on the stage canvas rather than on interface drawn over it.
 *
 * The pixel test can only answer for the canvas, and the canvas draws nothing beneath a
 * DOM overlay, so a button, a toast or a portaled panel floating over blank canvas
 * would read as empty space and lose its clicks. Ask the document what is really under
 * the cursor instead. This is a hit test, not an event, so it still answers while the
 * window is click-through.
 */
const isPointerOverStageCanvas = computed(() =>
  document.elementFromPoint(relativeMouseX.value, relativeMouseY.value) === stageCanvas.value,
)
/**
 * Drives native click-through, and runs whether or not Auto Hide is on.
 *
 * `true` surrenders the pixel to the app below, the opposite sense of
 * {@link isTransparent}. The samplers report a missing canvas as transparent, so the
 * guards below are what keep the window interactive when nothing can answer. Godot
 * lands there: it draws a DOM panel and exposes no canvas to read.
 */
const isTransparentForMouseEvents = computed(() => {
  if (stagePaused.value || componentStateStage.value !== 'mounted')
    return false

  // Load-bearing, not a convenience. A scene swap unmounts the canvas while the state
  // still reads mounted, and both samplers answer "transparent" without one, which would
  // hand the whole window away, character included, until the next scene reports itself.
  if (!stageCanvas.value)
    return false

  if (!isPointerOverStageCanvas.value)
    return false

  if (stageModelRenderer.value === 'vrm')
    return shouldUseThreeTransparencyHitTest.value ? isTransparentByThreeExact.value : false

  return isTransparentByPixelsExact.value
})

const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 10 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

// The controls Island hides while the cursor is away from the window. The edge
// band counts as the window, because a resize holds the cursor there. On
// Wayland the cursor signal can stick outside (#2521), so the Island stays.
const isWayland = ref(true)
// A failed probe keeps `true`, so the Island stays shown as before this feature.
useElectronEventaInvoke(electronAppIsWayland)()
  .then(value => isWayland.value = value)
  .catch(error => console.warn('[Main Page] Failed to detect Wayland; the controls Island stays shown:', errorMessageFrom(error)))
const cursorAwayFromWindow = computed(() => !isWayland.value && isOutsideWindow.value && !isAroundWindowBorder.value)

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const controlsOverlayActive = computed(() => controlsIslandRef.value?.overlayActive ?? false)

const modelSettingsRuntimeSnapshot = computed<ModelSettingsRuntimeSnapshot>(() => {
  const hasModel = !!stageModelSelectedUrl.value

  if (stageModelRenderer.value === 'live2d') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      modelId: expressionStore.modelId,
      renderer: 'live2d',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      live2dExpressions: expressionStore.settingsSnapshot,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'vrm') {
    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'vrm',
      phase: hasModel ? scenePhase.value : 'no-model',
      controlsLocked: hasModel
        ? (!stageMounted.value || sceneMutationLocked.value)
        : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'spine') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'spine',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'tachie') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'tachie',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'mmd') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'mmd',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'godot') {
    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'godot',
      phase: hasModel ? 'mounted' : 'no-model',
      controlsLocked: false,
      previewAvailable: false,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  return createEmptyModelSettingsRuntimeSnapshot({
    ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
    updatedAt: Date.now(),
  })
})

/**
 * Keeps the rendered fade state and Electron click-through state synchronized.
 *
 * Triggering workflow:
 *
 * {@link watch}
 *   -> `fade-on-hover reactive state change`
 *     -> {@link handleFadeOnHoverInteractionChange}
 *
 * Upstream:
 * - {@link isOutsideFor250Ms} and {@link isAroundWindowBorderFor250Ms}
 * - {@link isOutsideWindow}, {@link isTransparent}, and {@link isTransparentForMouseEvents}
 * - {@link controlsOverlayActive}, {@link fadeOnHoverEnabled}, {@link alwaysOnTop}, and {@link stagePaused}
 *
 * Downstream:
 * - {@link resolveFadeOnHoverInteraction}
 * - {@link setIgnoreMouseEvents}
 */
function handleFadeOnHoverInteractionChange() {
  if (stagePaused.value) {
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    return
  }

  if (controlsOverlayActive.value || !outsideHearingStatus.value || !outsideAuthStatus.value) {
    // Portaled controls must receive clicks even outside the Island's bounds.
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    return
  }

  // Entering counts at once and leaving keeps the region for the debounce window.
  // Waiting for the debounce on the way in would leave the button click-through for
  // 250ms, which the pixel hit test reads as blank canvas and passes to the app below.
  const insideControls = !isOutside.value || !isOutsideFor250Ms.value
  const nearBorder = isAroundWindowBorder.value || isAroundWindowBorderFor250Ms.value

  if (insideControls || nearBorder) {
    // Inside interactive controls or near resize border: do NOT ignore events
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
  }
  else {
    const interaction = resolveFadeOnHoverInteraction({
      alwaysOnTop: alwaysOnTop.value,
      cursorInsideWindow: !isOutsideWindow.value,
      // NOTICE:
      // On native Wayland the polled cursor position can stick stale (#2521),
      // and Electron's setIgnoreMouseEvents `forward` flag is unsupported on
      // Linux. A click-through window there never gets pointer events back,
      // so the controls menu can never open. Keep the window interactive.
      // Removal: reliable Wayland cursor reporting or Linux `forward` support.
      clickThroughAvailable: !isWayland.value,
      enabled: fadeOnHoverEnabled.value,
      transparentForFade: isTransparent.value,
      transparentForPointer: isTransparentForMouseEvents.value,
    })

    isIgnoringMouseEvents.value = interaction.ignoreMouseEvents
    shouldFadeOnCursorWithin.value = interaction.fadeStage
    setIgnoreMouseEvents([interaction.ignoreMouseEvents, { forward: true }])
  }
}

watch(
  [outsideHearingStatus, outsideAuthStatus, isOutside, isOutsideFor250Ms, isPointerOverStageCanvas, isAroundWindowBorder, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, isTransparentForMouseEvents, controlsOverlayActive, fadeOnHoverEnabled, alwaysOnTop, stagePaused, isWayland],
  handleFadeOnHoverInteractionChange,
  { immediate: true },
)

useModelSettingsRuntimeOwner({
  ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
  renderer: () => stageModelRenderer.value,
  runtimeSnapshot: modelSettingsRuntimeSnapshot,
  applyLive2DExpressionCommand: (command) => {
    expressionStore.applySettingsCommand(command)
  },
})

const voice = useVoiceStore()
const openInlay = useElectronEventaInvoke(electronOpenInlay)
const { enabled } = storeToRefs(useSettingsAudioDevice())
watch(enabled, (value) => {
  if (value)
    voice.startListening()
  else
    void voice.stopListening()
}, { immediate: true })
watch(() => voice.error, (error) => {
  if (error)
    toast.error(error)
})
watch(
  () => voice.drafts.map(draft => `${draft.id}:${draft.rawText}`).join('\0'),
  (speechDrafts) => {
    if (speechDrafts)
      void openInlay()
  },
)
onMounted(() => {
  if (onboardingStore.needsOnboarding)
    openOnboarding()
})
onUnmounted(() => {
  void voice.stopListening()
})

const cursorPosition = computed(() => ({
  x: relativeMouseX.value,
  y: relativeMouseY.value,
}))
</script>

<template>
  <div
    max-h="[100vh]"
    max-w="[100vw]"
    flex="~ col"
    relative z-2 h-full overflow-hidden rounded-xl
    transition="opacity duration-500 ease-in-out"
  >
    <div v-show="!settingsStore.streamerMode" ref="hearingStatusElement" :class="['absolute bottom-3 left-1/2 z-30 w-fit -translate-x-1/2']">
      <HearingStatus align="center" />
    </div>
    <div v-show="!settingsStore.streamerMode" ref="authStatusElement" :class="['absolute left-1/2 top-3 z-40 w-fit -translate-x-1/2']">
      <AuthStatusIsland />
    </div>
    <!-- Stage is always in DOM so TresCanvas can measure dimensions -->
    <div
      :class="[
        'relative h-full w-full items-end gap-2',
        'transition-opacity duration-250 ease-in-out',
      ]"
    >
      <div
        :class="[
          shouldFadeOnCursorWithin ? 'op-0' : 'op-100',
          'absolute',
          'top-0 left-0 w-full h-full',
          'overflow-hidden',
          'rounded-2xl',
          'transition-opacity duration-250 ease-in-out',
        ]"
      >
        <!--
          Every element that paints over the stage carries the opaque marker,
          so that the screen sampler does not read AIRI's own colors as desktop
          light. ResourceStatusIsland marks its pill itself, because its root
          spans the whole stage width. Tooltips and dialogs need none: reka-ui
          portals them to the body and the mask finds them there. HoloCoupon
          never renders (v-if="false").
        -->
        <ResourceStatusIsland />
        <WidgetStage
          ref="widgetStageRef"
          v-model:state="componentStateStage"
          h-full w-full
          flex-1
          :cursor-position="cursorPosition"
          :paused="stagePaused"
        />
        <HoloCoupon />
        <ControlsIslandRoot :frozen="controlsIslandInteractionActive">
          <ControlsIsland
            ref="controlsIslandRef"
            :cursor-away="cursorAwayFromWindow"
            :[stageOpaqueAttribute]="true"
            @interaction-change="controlsIslandInteractionActive = $event"
          />
        </ControlsIslandRoot>
      </div>
    </div>
    <!-- Loading overlay sits on top, does not hide the stage -->
    <div v-show="isLoading" class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden">
      <div
        :class="[
          'absolute h-24 w-full overflow-hidden rounded-xl',
          'flex items-center justify-center',
          'bg-white/80 dark:bg-neutral-950/80',
          'backdrop-blur-md',
        ]"
      >
        <div
          :class="[
            'drag-region',
            'absolute left-0 top-0',
            'h-full w-full flex items-center justify-center',
            'text-1.5rem text-primary-600 dark:text-primary-400 font-normal',
            'select-none',
            'animate-flash animate-duration-5s animate-count-infinite',
          ]"
        >
          Loading...
        </div>
      </div>
    </div>
  </div>
  <Transition
    enter-active-class="transition-opacity duration-250"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="false"
      class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden drag-region"
    >
      <div
        class="absolute h-32 w-full flex items-center justify-center overflow-hidden rounded-xl"
        bg="white/80 dark:neutral-950/80" backdrop-blur="md"
      >
        <div class="wall absolute top-0 h-8" />
        <div
          :class="[
            'absolute left-0 top-0 h-full w-full',
            'flex items-center justify-center',
            'animate-flash animate-duration-5s animate-count-infinite',
            'select-none text-1.5rem text-primary-400 font-normal drag-region',
          ]"
        >
          DRAG HERE TO MOVE
        </div>
        <div class="wall absolute bottom-0 h-8 drag-region" />
      </div>
    </div>
  </Transition>
  <Transition
    enter-active-class="transition-opacity duration-250 ease-in-out"
    enter-from-class="opacity-50"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250 ease-in-out"
    leave-from-class="opacity-100"
    leave-to-class="opacity-50"
  >
    <div v-if="(isAroundWindowBorder || isAroundWindowBorderFor250Ms) && !isLoading" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
      <div
        :class="[
          'b-primary/50',
          'h-full w-full animate-flash animate-duration-3s animate-count-infinite b-4 rounded-2xl',
        ]"
      />
    </div>
  </Transition>
</template>

<style scoped>
@keyframes wall-move {
  0% {
    transform: translateX(calc(var(--wall-width) * -2));
  }
  100% {
    transform: translateX(calc(var(--wall-width) * 1));
  }
}

.wall {
  --at-apply: text-primary-300;

  --wall-width: 8px;
  animation: wall-move 1s linear infinite;
  background-image: repeating-linear-gradient(
    45deg,
    currentColor,
    currentColor var(--wall-width),
    #ff00 var(--wall-width),
    #ff00 calc(var(--wall-width) * 2)
  );
  width: calc(100% + 4 * var(--wall-width));
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>
