<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { FullscreenGlideCurve } from '../../shared/eventa'

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
import { computed, nextTick, onMounted, onUnmounted, provide, ref, shallowRef, toRef, watch } from 'vue'
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
/**
 * The area of the fullscreen mode, from the top left of the window. It clips the backdrop, the island, and the surface,
 * which keep their final layout, so they show as the area grows.
 */
const fullscreenArea = shallowRef<{ width: number, height: number }>()
/** The direction that the stage and the area move in now. `false` sets them at once. */
const fullscreenMotion = shallowRef<'open' | 'close' | false>(false)
/** The bounds of the main window before fullscreen mode, the work area, and the stage size in it. */
let fullscreenPlan: { home: StageLayoutBounds, workArea: StageLayoutBounds, stage: { width: number, height: number } } | undefined
type StageLayoutBounds = Awaited<ReturnType<typeof enterFullscreenWindow>>['bounds']

/** A part of the fullscreen transition. The window glide and the CSS transitions use the same curve. */
interface FullscreenMotion { duration: number, curve: FullscreenGlideCurve }
/**
 * The parts of the fullscreen transition. `height` also moves the window and scales the stage, so the bottom edge of
 * the stage and the area stays in place. `width` is slower, so the area fills the height first.
 */
const FULLSCREEN_MOTION = {
  height: { duration: 350, curve: [0.25, 1, 0.5, 1] },
  width: { duration: 500, curve: [0.33, 1, 0.68, 1] },
} satisfies Record<string, FullscreenMotion>
/** The opening runs as long as its slowest part. The closing plays it backwards, so every part ends together. */
const FULLSCREEN_OPENING_MS = Math.max(FULLSCREEN_MOTION.height.duration, FULLSCREEN_MOTION.width.duration)
/** The share of the work area width that the stage takes on the left. The surface takes the rest on the right. */
const FULLSCREEN_STAGE_SHARE = 0.42

function planFor(home: StageLayoutBounds, workArea: StageLayoutBounds) {
  return { home, workArea, stage: { width: Math.round(workArea.width * FULLSCREEN_STAGE_SHARE), height: workArea.height } }
}

/** A part of the transition in a direction. Backwards, a part runs its curve reversed and starts late by the time it ended early. */
function motionPart(part: FullscreenMotion, direction: 'open' | 'close') {
  if (direction === 'open')
    return { duration: part.duration, curve: part.curve, delay: 0 }
  const [x1, y1, x2, y2] = part.curve
  return { duration: part.duration, curve: [1 - x2, 1 - y2, 1 - x1, 1 - y1] satisfies FullscreenGlideCurve, delay: FULLSCREEN_OPENING_MS - part.duration }
}

/** The CSS transitions of `parts` in the current direction, and none while nothing moves. */
function motionTransitions(...parts: [property: string, part: FullscreenMotion][]) {
  const direction = fullscreenMotion.value
  if (!direction)
    return []
  return parts.map(([property, part]) => {
    const { duration, curve, delay } = motionPart(part, direction)
    return `${property} ${duration}ms cubic-bezier(${curve.join(', ')}) ${delay}ms`
  })
}

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
    transition: motionTransitions(['transform', FULLSCREEN_MOTION.height]).join(', ') || 'none',
  }
})

const fullscreenAreaStyle = computed(() => {
  const area = fullscreenArea.value
  if (!area)
    return undefined
  return {
    width: `${area.width}px`,
    height: `${area.height}px`,
    transition: motionTransitions(['width', FULLSCREEN_MOTION.width], ['height', FULLSCREEN_MOTION.height]).join(', ') || 'none',
  }
})

/** The stage at its fullscreen size, drawn as large as it was in the small window, with the character centered as before. */
function homeStageLayout(plan: NonNullable<typeof fullscreenPlan>): StageLayout {
  const scale = plan.home.height / plan.stage.height
  return { ...plan.stage, scale, offsetX: (plan.home.width - plan.stage.width * scale) / 2 }
}

const stageFrameElement = ref<HTMLElement>()
const fullscreenAreaElement = ref<HTMLElement>()

/** Starts the next transition from the layout that the stage and the area have now, by making the browser commit it first. */
function commitFullscreenLayout() {
  stageFrameElement.value?.getBoundingClientRect()
  fullscreenAreaElement.value?.getBoundingClientRect()
}

/** Resolves when every transition that the latest layout change started on the stage and the area has ended. */
async function fullscreenTransitionsEnded() {
  await nextTick()
  const animations = [stageFrameElement.value, fullscreenAreaElement.value].flatMap(element => element?.getAnimations() ?? [])
  await Promise.all(animations.map(animation => animation.finished))
}

/**
 * Opens the fullscreen mode. A resize keeps the window's top left corner, and a glide keeps its size, so the content
 * never shifts against the window and the stage never blinks. The islands hide as soon as the mode starts.
 *
 * 1. The stage takes its fullscreen size, scaled to look unchanged, and the window grows from its top left to the size
 *    of the work area. The area starts with no width, so nothing on screen changes.
 * 2. The window glides to the top left of the work area while the stage and the area grow along the same curve. The
 *    area opens to the right along a slower curve and shows the island and the surface.
 *
 * The mode ends fully open or fully closed: any failed step rolls everything back through {@link leaveFullscreen}.
 */
async function expandToFullscreen() {
  try {
    const { bounds, workArea } = await enterFullscreenWindow()
    const plan = planFor(bounds, workArea)
    fullscreenPlan = plan
    const { height } = FULLSCREEN_MOTION

    fullscreenMotion.value = false
    stageLayout.value = homeStageLayout(plan)
    fullscreenArea.value = { width: 0, height: bounds.height }
    await setFullscreenWindowBounds({ bounds: { x: bounds.x, y: bounds.y, width: workArea.width, height: workArea.height } })

    commitFullscreenLayout()
    fullscreenMotion.value = 'open'
    stageLayout.value = { ...plan.stage, scale: 1, offsetX: 0 }
    fullscreenArea.value = { width: workArea.width, height: workArea.height }
    await Promise.all([
      setFullscreenWindowBounds({ bounds: workArea, duration: height.duration, curve: height.curve }),
      fullscreenTransitionsEnded(),
    ])
    fullscreen.settle('open')
  }
  catch (error) {
    console.error('[Main window fullscreen] Failed to open:', errorMessageFrom(error))
    await leaveFullscreen(`opening failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
}

/**
 * Closes the fullscreen mode with the opening played backwards. The area closes to the left while the window glides
 * back and the stage shrinks, then the window shrinks from its top left. The stage returns
 * to its normal layout only after that, because its scaled layout fits both window sizes.
 */
async function collapseFromFullscreen() {
  try {
    const plan = fullscreenPlan
    if (plan) {
      const height = motionPart(FULLSCREEN_MOTION.height, 'close')
      commitFullscreenLayout()
      fullscreenMotion.value = 'close'
      stageLayout.value = homeStageLayout(plan)
      fullscreenArea.value = { width: 0, height: plan.home.height }
      await Promise.all([
        setFullscreenWindowBounds({ bounds: { ...plan.workArea, x: plan.home.x, y: plan.home.y }, ...height }),
        fullscreenTransitionsEnded(),
      ])

      await setFullscreenWindowBounds({ bounds: plan.home })
    }
    await exitFullscreenWindow({ reason: 'the user closed it' })
    clearFullscreenLayout()
    fullscreen.settle('closed')
  }
  catch (error) {
    console.error('[Main window fullscreen] Failed to close:', errorMessageFrom(error))
    await leaveFullscreen(`closing failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
}

/** Returns the stage to its normal layout and unmounts the area. */
function clearFullscreenLayout() {
  fullscreenMotion.value = false
  stageLayout.value = undefined
  fullscreenArea.value = undefined
  fullscreenPlan = undefined
}

/**
 * The way out after any failed step: the window and the stage return to their state before the mode, and it closes.
 * The main process restores its bounds and always on top, and does nothing when it was never in fullscreen mode.
 */
async function leaveFullscreen(reason: string) {
  clearFullscreenLayout()
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
    fullscreenMotion.value = false
    stageLayout.value = { ...plan.stage, scale: 1, offsetX: 0 }
    fullscreenArea.value = { width: plan.workArea.width, height: plan.workArea.height }
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
  <!--
    The fullscreen mode of the main window. Nothing of it mounts until it opens. Two layers share the size of the area:
    the backdrop under the stage, and the island and the surface over it. Their content keeps its final layout from
    the bottom left, so it shows from left to right as the area grows.
  -->
  <div
    v-if="fullscreenAreaStyle"
    ref="fullscreenAreaElement"
    :style="fullscreenAreaStyle"
    :class="['fixed left-0 top-0 z-1 overflow-hidden']"
  >
    <div :class="['absolute bottom-0 left-0 h-screen w-screen', 'bg-neutral-100 dark:bg-neutral-900']" />
  </div>
  <div
    v-if="fullscreenAreaStyle"
    :style="fullscreenAreaStyle"
    :class="['pointer-events-none fixed left-0 top-0 z-3 overflow-hidden']"
  >
    <div :class="['absolute bottom-0 left-0 h-screen w-screen']">
      <FullscreenIsland :class="['pointer-events-auto absolute left-6 top-1/2 -translate-y-1/2']" />
      <div
        :class="[
          'pointer-events-auto absolute',
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
    </div>
  </div>
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
