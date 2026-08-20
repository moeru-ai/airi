import type { Emotion } from '../constants/emotions'
import type { MorphSlot } from '../constants/morphs'

import localforage from 'localforage'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { EMOTION_ACTION_NAME } from '../constants/actions'
import { supportedControl, useMMDViewControl } from './view-control'

type BroadcastChannelEvents
  = | BroadcastChannelEventShouldUpdateView
    | BroadcastChannelEventPlayOneShot

interface BroadcastChannelEventShouldUpdateView {
  type: 'mmd-should-update-view'
}

interface BroadcastChannelEventPlayOneShot {
  type: 'mmd-play-one-shot'
  request: MMDOneShotAction
}

/**
 * A VMD motion imported for use across windows.
 *
 * Holds only an id + display name; the VMD file itself lives in IndexedDB
 * (keyed by `id`) so the list can sync through localStorage and each window
 * can materialize its own object URL. Blob URLs are window-scoped and cannot
 * be shared, which is why the URL is never persisted here.
 */
export interface MMDMotionDescriptor {
  id: string
  name: string
}

/** IndexedDB record for a persisted VMD file. */
interface PersistedMMDMotion {
  id: string
  name: string
  file: File
}

/** A material ("part") of the loaded model, for the materials settings UI. */
export interface MMDMaterialDescriptor {
  /** Raw material name; the key used for opacity overrides. */
  name: string
  /** Human-friendly label (falls back to `Material N` for unnamed parts). */
  label: string
  /** Order index within the model. */
  index: number
}

const MOTION_STORAGE_PREFIX = 'mmd-motion-'

/** Eye/head tracking mode, mirroring the VRM renderer's tracking modes. */
export type MMDGazeMode = 'camera' | 'mouse' | 'none'

/** Transient request to play a one-shot motion, bumped per request. */
export interface MMDOneShotAction {
  name: string
  loop: boolean
  nonce: number
}

export const useMMD = defineStore('mmd', () => {
  const { post, data } = useBroadcastChannel<BroadcastChannelEvents, BroadcastChannelEvents>({
    name: 'airi-stores-stage-ui-mmd',
  })
  const shouldUpdateViewHooks = ref(new Set<() => void>())

  /**
   * Transient one-shot motion request (fire-and-forget; not persisted).
   *
   * Declared before the broadcast handler that writes to it. Delivered across
   * Electron windows via the BroadcastChannel below — NOT localStorage, whose
   * storage events do not fire reliably between BrowserWindows.
   */
  const oneShotAction = ref<MMDOneShotAction>()

  const onShouldUpdateView = (hook: () => void) => {
    shouldUpdateViewHooks.value.add(hook)
    return () => {
      shouldUpdateViewHooks.value.delete(hook)
    }
  }

  function shouldUpdateView() {
    post({ type: 'mmd-should-update-view' })
    shouldUpdateViewHooks.value.forEach(hook => hook())
  }

  watch(data, (event) => {
    if (event?.type === 'mmd-should-update-view')
      shouldUpdateViewHooks.value.forEach(hook => hook())
    else if (event?.type === 'mmd-play-one-shot')
      oneShotAction.value = event.request
  })

  // === Physics & solver toggles ===
  /** Master switch for the Ammo/Bullet rigid-body simulation (hair, skirt, etc.). */
  const physicsEnabled = useLocalStorageManualReset<boolean>('settings/mmd/physics-enabled', true)
  /** CCD IK solving for limbs/standard rigs. */
  const ikEnabled = useLocalStorageManualReset<boolean>('settings/mmd/ik-enabled', true)
  /** Append-bone ("grant") propagation for derived bones. */
  const grantEnabled = useLocalStorageManualReset<boolean>('settings/mmd/grant-enabled', true)
  /**
   * Physics gravity strength (magnitude). Applied as world gravity (0, -g, 0).
   * MMD's default is 98 (9.8 × 10 for MMD's scale). Lower = floatier hair and
   * cloth, higher = heavier/droopier.
   */
  const physicsGravity = useLocalStorageManualReset<number>('settings/mmd/physics-gravity', 98)

  // === Gaze ===
  /**
   * Eye/head tracking mode, mirroring the VRM renderer:
   * - `mouse`  — follow the cursor
   * - `camera` — look toward the camera (forward)
   * - `none`   — no tracking; idle saccades only
   */
  const gazeMode = useLocalStorageManualReset<MMDGazeMode>('settings/mmd/gaze-mode', 'mouse')

  // === Scene: camera ===
  /** Vertical field of view in degrees. */
  const cameraFov = useLocalStorageManualReset<number>('settings/mmd/camera-fov', 30)

  // === Scene: lighting ===
  const ambientColor = useLocalStorageManualReset<string>('settings/mmd/ambient-color', '#FFFFFF')
  const ambientIntensity = useLocalStorageManualReset<number>('settings/mmd/ambient-intensity', 0.6)
  const directionalColor = useLocalStorageManualReset<string>('settings/mmd/directional-color', '#FFFBF5')
  const directionalIntensity = useLocalStorageManualReset<number>('settings/mmd/directional-intensity', 0.75)
  const directionalPosition = useLocalStorageManualReset<{ x: number, y: number, z: number }>(
    'settings/mmd/directional-position',
    () => ({ x: 1, y: 2, z: 2 }),
  )

  // === Scene: rendering ===
  /**
   * Albedo self-illumination, 0–1. Drives `emissiveIntensity` on every
   * material so the model reads as the flat, luminous MMD/anime look. 0 = lit
   * only by scene lights, 1 = nearly self-lit.
   */
  const albedoGlow = useLocalStorageManualReset<number>('settings/mmd/albedo-glow', 0.45)
  /** Device-pixel-ratio multiplier for render resolution. */
  const renderScale = useLocalStorageManualReset<number>('settings/mmd/render-scale', 1)

  // === Animation ===
  /** Name of the persistent idle motion; empty means none/static. */
  const idleMotionName = useLocalStorageManualReset<string>('settings/mmd/idle-motion', '')
  /**
   * Motions imported for use across windows.
   *
   * localStorage-backed so the list syncs between the settings window and the
   * stage window (the desktop app runs them as separate renderer processes
   * with independent Pinia stores). Only id + name are stored here; the VMD
   * files live in IndexedDB.
   */
  const availableMotions = useLocalStorageManualReset<MMDMotionDescriptor[]>('settings/mmd/motions', () => [])

  /**
   * Persists a VMD file to IndexedDB and adds it to the synced list.
   *
   * Re-importing the same name overwrites the stored file (same id) so the
   * list stays stable.
   */
  async function addMotion(file: File): Promise<MMDMotionDescriptor> {
    const name = file.name.replace(/\.vmd$/i, '')
    const existing = availableMotions.value.find(motion => motion.name === name)
    const id = existing?.id ?? `${MOTION_STORAGE_PREFIX}${crypto.randomUUID()}`

    await localforage.setItem<PersistedMMDMotion>(id, { id, name, file })
    if (!existing)
      availableMotions.value = [...availableMotions.value, { id, name }]

    return { id, name }
  }

  /** Loads a persisted VMD file by id so a window can build its own object URL. */
  async function getMotionFile(id: string): Promise<File | undefined> {
    const persisted = await localforage.getItem<PersistedMMDMotion>(id)
    return persisted?.file
  }

  /** Removes every persisted motion file and clears the synced list. */
  async function clearMotions(): Promise<void> {
    const motions = availableMotions.value
    availableMotions.value = []
    await Promise.all(motions.map(motion => localforage.removeItem(motion.id)))
  }

  /** Removes a single imported motion (from the synced list and IndexedDB). */
  async function removeMotion(id: string): Promise<void> {
    const motion = availableMotions.value.find(m => m.id === id)
    availableMotions.value = availableMotions.value.filter(m => m.id !== id)
    // Drop the idle selection if it pointed at the removed motion.
    if (motion && idleMotionName.value === motion.name)
      idleMotionName.value = ''
    await localforage.removeItem(id)
  }
  /** Per-emotion gesture motion overrides; falls back to EMOTION_ACTION_NAME. */
  const emotionActionMap = useLocalStorageManualReset<Record<Emotion, string>>(
    'settings/mmd/emotion-action-map',
    () => ({ ...EMOTION_ACTION_NAME }),
  )

  // === Morphs ===
  /** Manual morph-slot → morph-name overrides for non-standard models. */
  const morphOverrides = useLocalStorageManualReset<Partial<Record<MorphSlot, string>>>(
    'settings/mmd/morph-overrides',
    () => ({}),
  )
  /** All morph names exposed by the active model (runtime). */
  const availableMorphs = useLocalStorageManualReset<string[]>('settings/mmd/available-morphs', () => [])

  /**
   * Materials (parts) of the active model, published by the scene so the
   * settings window can render a control per part.
   */
  const availableMaterials = useLocalStorageManualReset<MMDMaterialDescriptor[]>(
    'settings/mmd/available-materials',
    () => [],
  )
  /**
   * Per-material opacity overrides, keyed by material name. Missing entries
   * render at full opacity. Lets the user fade or hide individual parts.
   */
  const materialOpacity = useLocalStorageManualReset<Record<string, number>>(
    'settings/mmd/material-opacity',
    () => ({}),
  )

  /**
   * Whether an MMD mesh is currently mounted. Runtime-only: the persisted
   * descriptor lists survive reloads and cannot indicate live mount state.
   */
  const isModelLoaded = ref(false)

  /**
   * Queues a one-shot motion. Applies it in this window and broadcasts it to
   * the others. The bumped `nonce` makes repeat requests for the same motion
   * re-trigger the scene's watcher.
   *
   * Uses the BroadcastChannel rather than localStorage because this is a
   * transient trigger that must reach the stage window's animation manager,
   * and localStorage storage events do not fire reliably across Electron
   * BrowserWindows (the live stage and settings run as separate processes).
   */
  function playOneShotAction(name: string, loop = false) {
    const request: MMDOneShotAction = { name, loop, nonce: (oneShotAction.value?.nonce ?? 0) + 1 }
    oneShotAction.value = request
    post({ type: 'mmd-play-one-shot', request })
  }

  const { position, scale, rotationY, reset: resetViewControl } = useMMDViewControl()

  function resetState() {
    supportedControl.forEach(c => resetViewControl(c))
    physicsEnabled.reset()
    ikEnabled.reset()
    grantEnabled.reset()
    physicsGravity.reset()
    gazeMode.reset()
    cameraFov.reset()
    ambientColor.reset()
    ambientIntensity.reset()
    directionalColor.reset()
    directionalIntensity.reset()
    directionalPosition.reset()
    albedoGlow.reset()
    renderScale.reset()
    idleMotionName.reset()
    void clearMotions()
    oneShotAction.value = undefined
    emotionActionMap.reset()
    morphOverrides.reset()
    availableMorphs.reset()
    availableMaterials.reset()
    materialOpacity.reset()
    shouldUpdateView()
  }

  return {
    position,
    scale,
    rotationY,

    physicsEnabled,
    ikEnabled,
    grantEnabled,
    physicsGravity,
    gazeMode,

    cameraFov,
    ambientColor,
    ambientIntensity,
    directionalColor,
    directionalIntensity,
    directionalPosition,
    albedoGlow,
    renderScale,

    idleMotionName,
    availableMotions,
    addMotion,
    getMotionFile,
    clearMotions,
    removeMotion,
    emotionActionMap,

    morphOverrides,
    availableMorphs,
    availableMaterials,
    materialOpacity,

    isModelLoaded,
    oneShotAction,
    playOneShotAction,

    onShouldUpdateView,
    shouldUpdateView,
    resetState,
  }
})

export { useMMDViewControl }
