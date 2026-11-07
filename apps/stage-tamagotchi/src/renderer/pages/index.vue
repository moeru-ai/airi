<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { FullscreenGlideCurve, FullscreenMode } from '../../shared/eventa'

import { errorMessageFrom } from '@moeru/std'
import { electron } from '@proj-airi/electron-eventa'
import {
  useElectronEventaInvoke,
  useElectronMouseAroundWindowBorder,
  useElectronMouseInElement,
  useElectronMouseInWindow,
  useElectronRelativeMouse,
} from '@proj-airi/electron-vueuse'
import { useModelStore, useThreeSceneIsTransparentAtPoint } from '@proj-airi/stage-ui-three'
import { HoloCoupon } from '@proj-airi/stage-ui/components'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useVoiceListening } from '@proj-airi/stage-ui/composables/voice-input-mode'
import { FULLSCREEN_WORKSPACE_FLAG } from '@proj-airi/stage-ui/libs/feature-flags'
import { useFeatureFlagsStore } from '@proj-airi/stage-ui/stores/feature-flags'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { refDebounced, until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, onScopeDispose, ref, shallowRef, toRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import FullscreenBackdrop from '../components/fullscreen/fullscreen-backdrop.vue'
import FullscreenOverlay from '../components/fullscreen/fullscreen-overlay.vue'
import AuthStatusIsland from '../components/stage-islands/auth-status-island.vue'
import ControlsIslandRoot from '../components/stage-islands/controls-island/controls-island-root.vue'
import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'
import WindowResizeBorder from '../components/window-resize-border.vue'

import { defaultFullscreenSurface, electronAppIsWayland, electronFullscreenExit, electronFullscreenSetMode, electronMainPageMounted, electronMainWindowEnterFullscreen, electronMainWindowGetFullscreenState, electronMainWindowSetFullscreenBounds, electronOpenInlay, electronOpenOnboarding, electronOpenSettings } from '../../shared/eventa'
import { fullscreenHostPages, fullscreenSurfaceOf } from '../components/fullscreen/surfaces'
import { useModelSettingsRuntimeOwner } from '../composables/model-settings-runtime-owner'
import { useFullscreenHost } from '../composables/use-fullscreen-host'
import { provideFullscreenLayout } from '../composables/use-fullscreen-layout'
import { usePushToTalkShortcut } from '../composables/use-push-to-talk-shortcut'
import { useScreenAmbientLight } from '../composables/use-screen-ambient-light'
import { stageOpaqueAttribute } from '../composables/use-stage-painted-mask'
import { useControlsIslandStore } from '../stores/controls-island'
import { useFullscreenStore } from '../stores/fullscreen'
import { useStageWindowLifecycleStore } from '../stores/stage-window-lifecycle'
import { useToolSelectionStore } from '../stores/tools'
import { resolveFadeOnHoverInteraction } from '../utils/fade-on-hover'
import { shouldSampleStageTransparency } from '../utils/stage-three-transparency'

const authStatusElement = ref<HTMLElement>()
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
// A stage that fails to render never reaches `mounted`, so the loading overlay would
// keep covering the error surface. The error event ends the wait instead.
const stageError = shallowRef<Error>()
const isLoading = computed(() => !stageMounted.value && !stageError.value)

const isIgnoringMouseEvents = ref(false)
const shouldFadeOnCursorWithin = ref(false)

const onboardingStore = useOnboardingStore()
const openOnboarding = useElectronEventaInvoke(electronOpenOnboarding)
const openSettings = useElectronEventaInvoke(electronOpenSettings)

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
function handleStageRenderError(error: Error) {
  stageError.value = error
}
// The stage reports every reset, including a retry that changes no setting, so the
// overlay returns during the new load instead of hiding behind a stale error.
function handleStageReset() {
  stageError.value = undefined
}
const modelStore = useModelStore()
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

// The update launcher keeps a new bundle only when it reports healthy, and rolls it back otherwise. This page reports
// when the stage stops loading, with the model or with the error surface. A page stuck on loading never reports.
const reportPageMounted = useElectronEventaInvoke(electronMainPageMounted)
until(isLoading).toBe(false).then(() => reportPageMounted())

const cursorAwayFromWindow = computed(() => !isWayland.value && isOutsideWindow.value && !isAroundWindowBorder.value)

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const controlsOverlayActive = computed(() => controlsIslandRef.value?.overlayActive ?? false)

const modelSettingsRuntimeSnapshot = computed<ModelSettingsRuntimeSnapshot>(() => {
  const hasModel = !!stageModelSelectedUrl.value

  if (stageModelRenderer.value === 'live2d') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'live2d',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
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

const fullscreen = useFullscreenStore()
const { phase: fullscreenPhase, active: fullscreenActive } = storeToRefs(fullscreen)
const router = useRouter()
useFullscreenHost()
const enterFullscreenWindow = useElectronEventaInvoke(electronMainWindowEnterFullscreen)
const setFullscreenWindowBounds = useElectronEventaInvoke(electronMainWindowSetFullscreenBounds)
const exitFullscreenWindow = useElectronEventaInvoke(electronFullscreenExit)
const getFullscreenWindowState = useElectronEventaInvoke(electronMainWindowGetFullscreenState)
const setFullscreenMode = useElectronEventaInvoke(electronFullscreenSetMode)
const featureFlags = useFeatureFlagsStore()

/** The mode that the user chose: the experiment turns it on, and its variant names the window. */
const fullscreenMode = computed<FullscreenMode>(() => {
  if (!featureFlags.isEnabled(FULLSCREEN_WORKSPACE_FLAG.key))
    return 'off'
  return featureFlags.variantOf(FULLSCREEN_WORKSPACE_FLAG.key) === 'multi-window' ? 'multi-window' : 'single-window'
})

// The choice lives in page storage, so the page reports it. The main process moves what the mode shows to the window
// that the new mode names.
watch(fullscreenMode, async (mode) => {
  try {
    await setFullscreenMode({ mode })
  }
  catch (error) {
    console.error('[Main window fullscreen] Failed to report the mode:', errorMessageFrom(error))
  }
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
type StageLayoutBounds = Awaited<ReturnType<typeof enterFullscreenWindow>>['bounds']

/** A part of the fullscreen transition. The window glide and the CSS transitions use the same curve. */
interface FullscreenMotion { duration: number, curve: FullscreenGlideCurve }
/**
 * The parts of the fullscreen transition. `height` also moves the window and scales the stage, so the bottom edge of
 * the stage and the area stays in place. `width` is slower, so the area fills the height first. Closing runs every part
 * along `close`, an ease-out curve that overshoots a little, so the character lands with a slight spring.
 */
const FULLSCREEN_MOTION = {
  height: { duration: 350, curve: [0.25, 1, 0.5, 1] },
  width: { duration: 500, curve: [0.33, 1, 0.68, 1] },
  close: { duration: 400, curve: [0.34, 1.1, 0.64, 1] },
} satisfies Record<string, FullscreenMotion>
/** The surface width, its drag, and the place of the stage beside the surface. The overlay reads the same layout. */
const fullscreenLayout = provideFullscreenLayout()

// The canvas keeps its size while the surface width changes, and the open stage follows by moving at once. A change
// during a transition waits, because it would cut the transition that the mode waits for.
watch(fullscreenLayout.stageOffset, (offsetX) => {
  if (fullscreenPhase.value === 'open' && !fullscreenMotion.value && stageLayout.value)
    stageLayout.value = { ...stageLayout.value, offsetX }
})

/** The bounds of the main window outside fullscreen mode, the work area, and the stage size in it. */
function planFor(home: StageLayoutBounds, workArea: StageLayoutBounds) {
  return { home, workArea, stage: fullscreenLayout.stageSizeIn(workArea) }
}

/** The CSS transitions of `parts` in the current direction, and none while nothing moves. */
function motionTransitions(...parts: [property: string, part: FullscreenMotion][]) {
  const direction = fullscreenMotion.value
  if (!direction)
    return []
  return parts.map(([property, part]) => {
    const { duration, curve } = direction === 'open' ? part : FULLSCREEN_MOTION.close
    return `${property} ${duration}ms cubic-bezier(${curve.join(', ')})`
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
function homeStageLayout(plan: ReturnType<typeof planFor>): StageLayout {
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
    const { height } = FULLSCREEN_MOTION

    fullscreenMotion.value = false
    stageLayout.value = homeStageLayout(plan)
    fullscreenArea.value = { width: 0, height: bounds.height }
    await setFullscreenWindowBounds({ bounds: { x: bounds.x, y: bounds.y, width: workArea.width, height: workArea.height } })

    commitFullscreenLayout()
    // The island mounted with the area. Its place limits the surface width, so the stage reads it before it moves.
    fullscreenLayout.measureIsland()
    fullscreenMotion.value = 'open'
    stageLayout.value = { ...plan.stage, scale: 1, offsetX: fullscreenLayout.stageOffsetIn(workArea.width) }
    fullscreenArea.value = { width: workArea.width, height: workArea.height }
    await Promise.all([
      setFullscreenWindowBounds({ bounds: workArea, duration: height.duration, curve: height.curve }),
      fullscreenTransitionsEnded(),
    ])
    // Nothing moves now, so the stage follows a drag of the surface edge at once. It also takes the width of a drag
    // that ended during the transition.
    fullscreenMotion.value = false
    stageLayout.value = { ...plan.stage, scale: 1, offsetX: fullscreenLayout.stageOffsetIn(workArea.width) }
    fullscreen.settle('open')
  }
  catch (error) {
    console.error('[Main window fullscreen] Failed to open:', errorMessageFrom(error))
    await leaveFullscreen(`opening failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
  }
}

/**
 * Closes the fullscreen mode. The area closes to the left while the window glides back and the stage shrinks, all
 * along the closing curve, then the window shrinks from its top left. The stage returns to its normal layout only
 * after that, because its scaled layout fits both window sizes.
 */
async function collapseFromFullscreen() {
  try {
    // The main process keeps the bounds that the window returns to, and they can change while the mode is open.
    const state = await getFullscreenWindowState()
    if (state) {
      const plan = planFor(state.home, state.workArea)
      const { close } = FULLSCREEN_MOTION
      commitFullscreenLayout()
      fullscreenMotion.value = 'close'
      stageLayout.value = homeStageLayout(plan)
      fullscreenArea.value = { width: 0, height: plan.home.height }
      await Promise.all([
        setFullscreenWindowBounds({ bounds: { ...plan.workArea, x: plan.home.x, y: plan.home.y }, ...close }),
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
        await router.replace(fullscreenHostPages['main-window'])
      return
    }
    const plan = planFor(state.home, state.workArea)
    fullscreenMotion.value = false
    stageLayout.value = { ...plan.stage, scale: 1, offsetX: fullscreenLayout.stageOffsetIn(plan.workArea.width) }
    fullscreenArea.value = { width: plan.workArea.width, height: plan.workArea.height }
    await setFullscreenWindowBounds({ bounds: plan.workArea })
    await fullscreen.resume(state.surface ?? defaultFullscreenSurface)
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

  if (controlsOverlayActive.value || !outsideAuthStatus.value) {
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
  [outsideAuthStatus, isOutside, isOutsideFor250Ms, isPointerOverStageCanvas, isAroundWindowBorder, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, isTransparentForMouseEvents, controlsOverlayActive, fadeOnHoverEnabled, alwaysOnTop, stagePaused, isWayland, fullscreenActive],
  handleFadeOnHoverInteractionChange,
  { immediate: true },
)

useModelSettingsRuntimeOwner({
  ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
  renderer: () => stageModelRenderer.value,
  runtimeSnapshot: modelSettingsRuntimeSnapshot,
})

const voice = useVoiceStore()
const toolSelection = useToolSelectionStore()
// Spoken turns start in this window. They use the tools that the chat window composer grants.
onScopeDispose(voice.connectTools(() => toolSelection.requestTools))
const openInlay = useElectronEventaInvoke(electronOpenInlay)
useVoiceListening()
usePushToTalkShortcut()
// The inlay stays shown from startup and draws a capsule when any capture starts.
// This call shows it again after the user hid it. A failed begin never reaches `capturing`.
watch(
  () => voice.state?.phase === 'capturing',
  (capturing) => {
    if (capturing)
      void openInlay()
  },
)
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
onMounted(() => {
  if (onboardingStore.needsOnboarding)
    openOnboarding()
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
          @error="handleStageRenderError"
          @reset="handleStageReset"
          @select-avatar-model="openSettings({ route: '/settings/models' })"
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
  <WindowResizeBorder
    :shown="(isAroundWindowBorder || isAroundWindowBorderFor250Ms) && !isLoading && !fullscreenActive"
    :class="['rounded-2xl']"
  />
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
    <FullscreenBackdrop />
  </div>
  <div
    v-if="fullscreenAreaStyle"
    :style="fullscreenAreaStyle"
    :class="['pointer-events-none fixed left-0 top-0 z-3 overflow-hidden']"
  >
    <FullscreenOverlay />
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
