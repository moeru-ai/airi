<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import { errorMessageFrom } from '@moeru/std'
import { electron } from '@proj-airi/electron-eventa'
import {
  useElectronEventaContext,
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
import { MAIN_WINDOW_FULLSCREEN_FLAG } from '@proj-airi/stage-ui/libs/feature-flags'
import { useFeatureFlagsStore } from '@proj-airi/stage-ui/stores/feature-flags'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { refDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, provide, ref, shallowRef, toRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import FullscreenIsland from '../components/fullscreen/fullscreen-island.vue'
import AuthStatusIsland from '../components/stage-islands/auth-status-island.vue'
import ControlsIslandRoot from '../components/stage-islands/controls-island/controls-island-root.vue'
import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'

import { electronAppIsWayland, electronMainWindowCloseFullscreen, electronMainWindowEnterFullscreen, electronMainWindowExitFullscreen, electronMainWindowGetFullscreenState, electronMainWindowOpenFullscreen, electronMainWindowSetFullscreenBounds, electronMainWindowSetFullscreenEnabled, electronOpenInlay, electronOpenOnboarding, electronOpenSettings } from '../../shared/eventa'
import { fullscreenPanelKey } from '../components/fullscreen/panel'
import { fullscreenSurfaceOf, fullscreenSurfaces } from '../components/fullscreen/surfaces'
import { useModelSettingsRuntimeOwner } from '../composables/model-settings-runtime-owner'
import { useScreenAmbientLight } from '../composables/use-screen-ambient-light'
import { stageOpaqueAttribute } from '../composables/use-stage-painted-mask'
import { useControlsIslandStore } from '../stores/controls-island'
import { useMainWindowFullscreenStore } from '../stores/main-window-fullscreen'
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

const fullscreen = useMainWindowFullscreenStore()
const { phase: fullscreenPhase, active: fullscreenActive, surface: fullscreenSurface, mounted: mountedSurfaces } = storeToRefs(fullscreen)
const router = useRouter()
// The settings layout draws the panel content instead of the settings window frame when it shows here.
provide(fullscreenPanelKey, true)
const eventaContext = useElectronEventaContext()
// Every settings entry point and the fullscreen chat mode ask the main process, which forwards the request here.
const stopOpenFullscreenListener = eventaContext.value.on(electronMainWindowOpenFullscreen, (event) => {
  if (event?.body)
    void fullscreen.open(event.body.surface, event.body.route)
})
// A chat mode switch away from the fullscreen chat removes it once the new chat window holds the draft.
const stopCloseFullscreenListener = eventaContext.value.on(electronMainWindowCloseFullscreen, (event) => {
  if (event?.body)
    void fullscreen.dismiss(event.body.surface)
})
onUnmounted(() => {
  stopOpenFullscreenListener()
  stopCloseFullscreenListener()
})
// A settings page that returns to the main page on its own, such as its back button on the first page, ends the mode.
watch(() => fullscreenSurfaceOf(router.currentRoute.value.path), (current, previous) => {
  if (previous && !current)
    void fullscreen.close()
})
const enterFullscreenWindow = useElectronEventaInvoke(electronMainWindowEnterFullscreen)
const setFullscreenWindowBounds = useElectronEventaInvoke(electronMainWindowSetFullscreenBounds)
const exitFullscreenWindow = useElectronEventaInvoke(electronMainWindowExitFullscreen)
const getFullscreenWindowState = useElectronEventaInvoke(electronMainWindowGetFullscreenState)
const setFullscreenEnabled = useElectronEventaInvoke(electronMainWindowSetFullscreenEnabled)
const openSettingsWindow = useElectronEventaInvoke(electronOpenSettings)
const featureFlags = useFeatureFlagsStore()

// The choice lives in page storage, so the page reports it. Turning it off closes the mode after the main process
// moves a fullscreen chat out, and the settings page that showed opens in the settings window. A blocked leave keeps
// the mode.
watch(() => featureFlags.isEnabled(MAIN_WINDOW_FULLSCREEN_FLAG.key), async (enabled) => {
  const route = router.currentRoute.value
  const settingsPage = !enabled && fullscreenSurfaceOf(route.path) === 'settings' ? route.fullPath : undefined
  try {
    await setFullscreenEnabled({ enabled })
  }
  catch (error) {
    console.error('[Main window fullscreen] Failed to report the experiment:', errorMessageFrom(error))
  }
  if (enabled)
    return
  await fullscreen.close()
  if (settingsPage && fullscreenPhase.value !== 'open')
    await openSettingsWindow({ route: settingsPage })
}, { immediate: true })

/**
 * The stage in fullscreen mode. It keeps one size in window pixels, so the canvas resizes only when the mode starts
 * and ends. A transform anchored at the top left scales it down to the size it had in the small window.
 */
interface StageLayout { width: number, height: number, offsetX: number, scale: number }
const stageLayout = shallowRef<StageLayout>()
const stageLayoutAnimated = shallowRef(false)
/** The bounds of the main window before fullscreen mode, and the stage size in it. */
let fullscreenPlan: { home: { x: number, y: number, width: number, height: number }, workArea: { x: number, y: number, width: number, height: number }, stage: { width: number, height: number } } | undefined
const FULLSCREEN_GLIDE_MS = 650
// The CSS curve of the `outCubic` ease that the main process uses for the window glide, so the scale and the glide move together.
const FULLSCREEN_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)'
/** The share of the work area width that the stage takes on the left. The surface takes the rest on the right. */
const FULLSCREEN_STAGE_SHARE = 0.42

function planFor(home: StageLayoutBounds, workArea: StageLayoutBounds) {
  return { home, workArea, stage: { width: Math.round(workArea.width * FULLSCREEN_STAGE_SHARE), height: workArea.height } }
}
type StageLayoutBounds = NonNullable<typeof fullscreenPlan>['home']

const stageFrameStyle = computed(() => {
  const layout = stageLayout.value
  if (!layout)
    return undefined
  return {
    position: 'fixed' as const,
    left: '0px',
    top: '0px',
    width: `${layout.width}px`,
    height: `${layout.height}px`,
    transformOrigin: '0 0',
    transform: `translateX(${layout.offsetX}px) scale(${layout.scale})`,
    transition: stageLayoutAnimated.value ? `transform ${FULLSCREEN_GLIDE_MS}ms ${FULLSCREEN_EASING}` : 'none',
  }
})

/** The stage at its fullscreen size, drawn as large as it was in the small window, with the character centered as before. */
function homeStageLayout(plan: NonNullable<typeof fullscreenPlan>): StageLayout {
  const scale = plan.home.height / plan.stage.height
  return { ...plan.stage, scale, offsetX: (plan.home.width - plan.stage.width * scale) / 2 }
}

const stageFrameElement = ref<HTMLElement>()

/** Starts the next stage transition from the layout that the stage has now, by making the browser commit that layout first. */
function commitStageLayout() {
  stageFrameElement.value?.getBoundingClientRect()
}

/** Resolves when every transition running on the stage has ended. A stage with none resolves at once. */
async function stageTransitionsEnded() {
  await Promise.all(stageFrameElement.value?.getAnimations().map(animation => animation.finished) ?? [])
}

/**
 * Opens the fullscreen mode in three steps. A resize keeps the window's top left corner, and a glide keeps its size,
 * so the content never shifts against the window and the stage never blinks.
 *
 * 1. The stage takes its fullscreen size, scaled to look unchanged, and then the window grows from its top left
 *    to that size. The scaled stage looks the same at both window sizes, so the step does not wait for the resize.
 * 2. The window glides to the top left of the work area while the stage scales up to full size.
 * 3. The window grows over the whole work area, and the backdrop, the island, and the surface fade in.
 *
 * The mode ends fully open or fully closed: any failed step rolls everything back through {@link leaveFullscreen}.
 */
async function expandToFullscreen() {
  try {
    const { bounds, workArea } = await enterFullscreenWindow()
    const plan = planFor(bounds, workArea)
    fullscreenPlan = plan

    stageLayoutAnimated.value = false
    stageLayout.value = homeStageLayout(plan)
    await setFullscreenWindowBounds({ bounds: { x: bounds.x, y: bounds.y, ...plan.stage } })

    commitStageLayout()
    stageLayoutAnimated.value = true
    stageLayout.value = { ...plan.stage, scale: 1, offsetX: 0 }
    await setFullscreenWindowBounds({ bounds: { x: workArea.x, y: workArea.y, ...plan.stage }, duration: FULLSCREEN_GLIDE_MS })
    await stageTransitionsEnded()

    await setFullscreenWindowBounds({ bounds: workArea })
    fullscreen.settle('open')
  }
  catch (error) {
    console.error('[Main window fullscreen] Failed to open:', errorMessageFrom(error))
    await leaveFullscreen(`opening failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
}

/** Resolves when the backdrop finishes fading out. Vue reports the end of the leave transition through `after-leave`. */
let resolveBackdropLeft: (() => void) | undefined
function backdropLeft() {
  return new Promise<void>((resolve) => {
    resolveBackdropLeft = resolve
  })
}

/**
 * Closes the fullscreen mode with the same three steps in reverse, after the surface and backdrop fade out.
 * The stage returns to its normal layout only after the window has shrunk, because its scaled layout fits both sizes.
 */
async function collapseFromFullscreen() {
  try {
    const plan = fullscreenPlan
    await backdropLeft()
    if (plan) {
      await setFullscreenWindowBounds({ bounds: { x: plan.workArea.x, y: plan.workArea.y, ...plan.stage } })
      commitStageLayout()
      stageLayoutAnimated.value = true
      stageLayout.value = homeStageLayout(plan)
      await setFullscreenWindowBounds({ bounds: { x: plan.home.x, y: plan.home.y, ...plan.stage }, duration: FULLSCREEN_GLIDE_MS })
      await stageTransitionsEnded()
    }
    await exitFullscreenWindow({ reason: 'the user closed it' })
    stageLayoutAnimated.value = false
    stageLayout.value = undefined
    fullscreenPlan = undefined
    fullscreen.settle('closed')
  }
  catch (error) {
    console.error('[Main window fullscreen] Failed to close:', errorMessageFrom(error))
    await leaveFullscreen(`closing failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
}

/**
 * The way out after any failed step: the window and the stage return to their state before the mode, and it closes.
 * The main process restores its bounds and always on top, and does nothing when it was never in fullscreen mode.
 */
async function leaveFullscreen(reason: string) {
  stageLayoutAnimated.value = false
  stageLayout.value = undefined
  fullscreenPlan = undefined
  try {
    await exitFullscreenWindow({ reason })
  }
  catch (error) {
    console.error('[Main window fullscreen] Failed to restore the window:', errorMessageFrom(error))
  }
  finally {
    fullscreen.settle('closed')
  }
}

/**
 * Shows the fullscreen mode again when the page loads while the main window is still in it, after a reload for example.
 * The window covers the work area again, because a reload can stop it in the middle of a glide.
 */
async function resumeFullscreen() {
  try {
    const state = await getFullscreenWindowState()
    // The window decides. A route that names a surface while the window is not in the mode goes back to the main page.
    if (!state) {
      if (fullscreenSurfaceOf(router.currentRoute.value.path))
        await router.replace('/')
      return
    }
    const plan = planFor(state.home, state.workArea)
    fullscreenPlan = plan
    stageLayoutAnimated.value = false
    stageLayout.value = { ...plan.stage, scale: 1, offsetX: 0 }
    await setFullscreenWindowBounds({ bounds: plan.workArea })
    await fullscreen.resume(state.surface ?? 'settings')
  }
  catch (error) {
    console.error('[Main window fullscreen] Failed to show the mode again:', errorMessageFrom(error))
    await leaveFullscreen(`showing the mode again after a reload failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
}
onMounted(() => void resumeFullscreen())

watch(fullscreenPhase, (phase) => {
  if (phase === 'expanding')
    void expandToFullscreen()
  else if (phase === 'closing')
    void collapseFromFullscreen()
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
  // Settings cover the work area, so the whole window takes the pointer and the stage never fades.
  if (stagePaused.value || fullscreenActive.value) {
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
  [outsideHearingStatus, outsideAuthStatus, isOutside, isOutsideFor250Ms, isPointerOverStageCanvas, isAroundWindowBorder, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, isTransparentForMouseEvents, controlsOverlayActive, fadeOnHoverEnabled, alwaysOnTop, stagePaused, isWayland, fullscreenActive],
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
// A draft that the host is sending needs no inlay. A failed send clears `sending`, so the draft opens the inlay again.
watch(
  () => voice.drafts.filter(draft => !draft.sending).map(draft => `${draft.id}:${draft.rawText}`).join('\0'),
  (speechDrafts) => {
    if (speechDrafts)
      void openInlay()
  },
)
// The inlay shows live transcription in both send modes. It hides itself after the speech is sent.
watch(
  () => voice.state?.phase === 'capturing' && !!voice.transcript?.transcript.text.trim(),
  (speaking) => {
    if (speaking)
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
    <div v-show="!settingsStore.streamerMode && !fullscreenActive" ref="hearingStatusElement" :class="['absolute bottom-3 left-1/2 z-30 w-fit -translate-x-1/2']">
      <HearingStatus align="center" />
    </div>
    <div v-show="!settingsStore.streamerMode && !fullscreenActive" ref="authStatusElement" :class="['absolute left-1/2 top-3 z-40 w-fit -translate-x-1/2']">
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
        ref="stageFrameElement"
        :style="stageFrameStyle"
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
        <!-- These islands have no single root element for v-show, so a wrapper hides them while settings show. -->
        <div v-show="!fullscreenActive">
          <ResourceStatusIsland />
        </div>
        <WidgetStage
          ref="widgetStageRef"
          v-model:state="componentStateStage"
          h-full w-full
          flex-1
          :cursor-position="cursorPosition"
          :paused="stagePaused"
        />
        <HoloCoupon />
        <div v-show="!fullscreenActive">
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
    <div v-if="(isAroundWindowBorder || isAroundWindowBorderFor250Ms) && !isLoading && !fullscreenActive" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
      <div
        :class="[
          'b-primary/50',
          'h-full w-full animate-flash animate-duration-3s animate-count-infinite b-4 rounded-2xl',
        ]"
      />
    </div>
  </Transition>
  <!-- The fullscreen mode of the main window. Nothing of it mounts until it opens. -->
  <Transition
    enter-active-class="transition-opacity duration-500 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-500 ease-in"
    leave-to-class="opacity-0"
    @after-leave="resolveBackdropLeft?.()"
  >
    <div v-if="fullscreenPhase === 'open'" :class="['fixed inset-0 z-1', 'bg-neutral-100 dark:bg-neutral-900']" />
  </Transition>
  <Transition
    enter-active-class="transition-all duration-500 delay-150 ease-out"
    enter-from-class="opacity-0 -translate-x-4"
    leave-active-class="transition-all duration-300 ease-in"
    leave-to-class="opacity-0 -translate-x-4"
  >
    <FullscreenIsland v-if="fullscreenPhase === 'open'" :class="['fixed left-6 top-1/2 z-3 -translate-y-1/2']" />
  </Transition>
  <Transition
    enter-active-class="transition-all duration-500 delay-150 ease-out"
    enter-from-class="opacity-0 translate-x-8"
    leave-active-class="transition-all duration-300 ease-in"
    leave-to-class="opacity-0 translate-x-8"
  >
    <div
      v-if="fullscreenPhase === 'open'"
      :class="[
        'fixed z-3',
        'bottom-6 right-6 top-6',
        'w-[54%]',
        'rounded-3xl',
        'bg-$bg-color',
        'shadow-2xl shadow-neutral-900/10',
        'overflow-hidden',
      ]"
    >
      <!-- Each surface that showed stays mounted until the mode closes, so switching back finds it as it was. -->
      <div v-for="id in mountedSurfaces" v-show="id === fullscreenSurface" :key="id" :class="['h-full w-full']">
        <component :is="fullscreenSurfaces[id].panel" />
      </div>
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
