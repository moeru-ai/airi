import type { Emotion } from '../constants/emotions'
import type { MorphSlot } from '../constants/morphs'

import localforage from 'localforage'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useBroadcastChannel, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { EMOTION_ACTION_NAME } from '../constants/actions'
import { supportedControl, useMMDViewControl } from './view-control'

type BroadcastChannelEvents = BroadcastChannelEventShouldUpdateView

interface BroadcastChannelEventShouldUpdateView {
  type: 'mmd-should-update-view'
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

const MOTION_STORAGE_PREFIX = 'mmd-motion-'

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
  })

  // === Physics & solver toggles ===
  /** Master switch for the Ammo/Bullet rigid-body simulation (hair, skirt, etc.). */
  const physicsEnabled = useLocalStorageManualReset<boolean>('settings/mmd/physics-enabled', true)
  /** CCD IK solving for limbs/standard rigs. */
  const ikEnabled = useLocalStorageManualReset<boolean>('settings/mmd/ik-enabled', true)
  /** Append-bone ("grant") propagation for derived bones. */
  const grantEnabled = useLocalStorageManualReset<boolean>('settings/mmd/grant-enabled', true)

  // === Gaze ===
  const gazeTrackingEnabled = useLocalStorageManualReset<boolean>('settings/mmd/gaze-tracking', true)

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
   * Whether an MMD mesh is currently mounted. Runtime-only: the persisted
   * descriptor lists survive reloads and cannot indicate live mount state.
   */
  const isModelLoaded = ref(false)

  /**
   * Transient one-shot motion request.
   *
   * localStorage-backed (not just an in-memory ref) so a "play" click in the
   * settings window reaches the stage window's scene. The bumped `nonce` makes
   * repeat requests for the same motion re-trigger the watcher.
   */
  const oneShotAction = useLocalStorage<MMDOneShotAction | null>('settings/mmd/one-shot', null)

  /** Queue a one-shot motion; bumps the nonce so repeat calls re-trigger. */
  function playOneShotAction(name: string, loop = false) {
    oneShotAction.value = { name, loop, nonce: (oneShotAction.value?.nonce ?? 0) + 1 }
  }

  const { position, scale, rotationY, reset: resetViewControl } = useMMDViewControl()

  function resetState() {
    supportedControl.forEach(c => resetViewControl(c))
    physicsEnabled.reset()
    ikEnabled.reset()
    grantEnabled.reset()
    gazeTrackingEnabled.reset()
    idleMotionName.reset()
    void clearMotions()
    oneShotAction.value = null
    emotionActionMap.reset()
    morphOverrides.reset()
    availableMorphs.reset()
    shouldUpdateView()
  }

  return {
    position,
    scale,
    rotationY,

    physicsEnabled,
    ikEnabled,
    grantEnabled,
    gazeTrackingEnabled,

    idleMotionName,
    availableMotions,
    addMotion,
    getMotionFile,
    clearMotions,
    emotionActionMap,

    morphOverrides,
    availableMorphs,

    isModelLoaded,
    oneShotAction,
    playOneShotAction,

    onShouldUpdateView,
    shouldUpdateView,
    resetState,
  }
})

export { useMMDViewControl }
