import type { AnimationAction, AnimationClip, AnimationMixer, SkinnedMesh } from 'three'

import { AnimationClip as AnimationClipCtor, LoopOnce, LoopRepeat, Vector3 } from 'three'
import { MMDAnimationHelper } from 'three-stdlib'

import { ensureAmmo } from '../../utils/ammo'

const DEFAULT_CROSSFADE = 0.4

export interface MMDAnimationManagerOptions {
  /** Initial physics enablement. Ammo always loads so it can be toggled later. */
  physicsEnabled?: boolean
}

export interface PlayActionOptions {
  /** Loop the action instead of reverting to idle when it finishes. */
  loop?: boolean
  /** Cross-fade duration in seconds. */
  crossfade?: number
}

/**
 * Owns the per-model {@link MMDAnimationHelper} and the catalog of importable
 * VMD motions, exposing a play/crossfade API and physics/IK/grant toggles.
 *
 * Design:
 * - The helper auto-plays whatever clip it is constructed with, so we hand it
 *   only the idle clip (or an empty placeholder so a mixer always exists for
 *   physics warmup) and layer every other motion on the same mixer ourselves.
 * - Physics is created up front (it cannot be added after the fact) and merely
 *   toggled via `helper.enable('physics', …)`, so Ammo is required before the
 *   mesh is added. Ammo is still lazy at the app level: it only loads once an
 *   MMD model is actually mounted.
 * - One-shot actions register a `finished` listener that fades back to idle,
 *   mirroring how the Spine manager layers emotion clips over the idle track.
 *
 * `update(delta)` must be called once per frame; it drives animation, IK,
 * append-bone (grant) propagation, and the physics simulation in one step.
 */
export function createMMDAnimationManager(mesh: SkinnedMesh, options: MMDAnimationManagerOptions = {}) {
  // NOTICE:
  // resetPhysicsOnLoop must stay false. When true, MMDAnimationHelper calls
  // physics.reset() every time the mixer's clip loops, which snaps every rigid
  // body back to its bone pose and re-seeds the sim — a visible periodic
  // "fling" of hair/skirt. Continuous simulation looks correct for an idle
  // character and avoids the jolt.
  const helper = new MMDAnimationHelper({ afterglow: 2.0, resetPhysicsOnLoop: false })
  const registry = new Map<string, AnimationClip>()

  let mixer: AnimationMixer | undefined
  let idleClip: AnimationClip | undefined
  let idleAction: AnimationAction | undefined
  let currentAction: AnimationAction | undefined
  let initialized = false

  function getMixer(): AnimationMixer | undefined {
    if (!mixer)
      mixer = helper.objects.get(mesh)?.mixer
    return mixer
  }

  function revertToIdleOnFinish(action: AnimationAction) {
    const m = getMixer()
    if (!m)
      return
    const onFinished = (event: { action: AnimationAction }) => {
      if (event.action !== action)
        return
      m.removeEventListener('finished', onFinished)
      playIdle()
    }
    m.addEventListener('finished', onFinished)
  }

  /**
   * Builds the helper, physics, IK, and grant solvers for the mesh.
   *
   * `idle` is the persistent looping motion (optional). Ammo is initialized
   * before the mesh is added so the physics world can be constructed.
   */
  async function init(idle?: AnimationClip): Promise<void> {
    if (initialized)
      return

    await ensureAmmo()

    // The helper needs at least one clip to create a mixer (required for action
    // playback). When there is no real idle motion we use a long, track-less
    // placeholder: a zero-length clip would fire the mixer's "loop" event every
    // frame, so the large duration keeps it from ever looping.
    idleClip = idle ?? new AnimationClipCtor('__mmd_empty__', Number.MAX_SAFE_INTEGER, [])

    helper.add(mesh, {
      animation: idleClip,
      physics: true,
    })

    helper.enable('physics', options.physicsEnabled ?? true)

    mixer = helper.objects.get(mesh)?.mixer
    if (mixer && idle)
      idleAction = mixer.existingAction(idleClip) ?? undefined
    currentAction = idleAction
    initialized = true
  }

  /** Registers a VMD-derived clip under a name for later playback. */
  function registerClip(name: string, clip: AnimationClip): void {
    registry.set(name, clip)
  }

  /** Names of all registered motions, for settings UIs and action mapping. */
  function availableClips(): string[] {
    return Array.from(registry.keys())
  }

  /** Cross-fades back to the persistent idle loop. */
  function playIdle(crossfade = DEFAULT_CROSSFADE): void {
    const m = getMixer()
    if (!m)
      return

    // No idle clip registered (e.g. empty placeholder): just fade the current
    // motion out so bones relax to rest instead of clamping on the last frame.
    if (!idleAction) {
      if (currentAction)
        currentAction.fadeOut(crossfade)
      currentAction = undefined
      return
    }

    if (currentAction && currentAction !== idleAction)
      currentAction.fadeOut(crossfade)
    // Restore LoopRepeat: a one-shot may have reused this same action with
    // LoopOnce, which would otherwise leave the idle no longer looping.
    idleAction.reset().setLoop(LoopRepeat, Number.POSITIVE_INFINITY).setEffectiveWeight(1).fadeIn(crossfade).play()
    currentAction = idleAction
  }

  /**
   * Plays a registered motion, cross-fading from the current one. One-shots
   * revert to idle on completion; looping motions stay until replaced.
   *
   * Returns `false` when the name is not registered so callers can fall back.
   */
  function playAction(name: string, opts: PlayActionOptions = {}): boolean {
    const m = getMixer()
    const clip = registry.get(name)
    if (!m || !clip) {
      console.warn(`[mmd] playAction skipped: "${name}" is ${clip ? 'present' : 'not registered'}, mixer ${m ? 'ready' : 'missing'}`)
      return false
    }

    const loop = opts.loop ?? false
    const crossfade = opts.crossfade ?? DEFAULT_CROSSFADE

    const action = m.clipAction(clip)
    action.reset()
    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Number.POSITIVE_INFINITY : 1)
    action.clampWhenFinished = !loop
    action.setEffectiveWeight(1)
    action.fadeIn(crossfade).play()

    if (currentAction && currentAction !== action)
      currentAction.fadeOut(crossfade)
    currentAction = action

    if (!loop)
      revertToIdleOnFinish(action)

    return true
  }

  /**
   * Makes a registered motion the persistent looping base (the idle the
   * character returns to). Cross-fades from whatever is currently playing.
   *
   * Returns `false` when the name is not registered.
   */
  function setIdleMotion(name: string, crossfade = DEFAULT_CROSSFADE): boolean {
    const m = getMixer()
    const clip = registry.get(name)
    if (!m || !clip) {
      console.warn(`[mmd] setIdleMotion skipped: "${name}" is ${clip ? 'present' : 'not registered'}, mixer ${m ? 'ready' : 'missing'}`)
      return false
    }

    const action = m.clipAction(clip)
    action.reset()
    action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
    action.clampWhenFinished = false
    action.setEffectiveWeight(1)
    action.fadeIn(crossfade).play()

    const previous = idleAction
    idleClip = clip
    idleAction = action
    if (currentAction && currentAction !== action)
      currentAction.fadeOut(crossfade)
    else if (previous && previous !== action)
      previous.fadeOut(crossfade)
    currentAction = action
    return true
  }

  function setPhysicsEnabled(enabled: boolean): void {
    helper.enable('physics', enabled)
  }

  /** Sets the physics world gravity strength, applied as (0, -magnitude, 0). */
  function setGravity(magnitude: number): void {
    helper.objects.get(mesh)?.physics?.setGravity(new Vector3(0, -magnitude, 0))
  }

  function setIKEnabled(enabled: boolean): void {
    helper.enable('ik', enabled)
  }

  function setGrantEnabled(enabled: boolean): void {
    helper.enable('grant', enabled)
  }

  function update(delta: number): void {
    if (!initialized)
      return
    helper.update(delta)
  }

  function dispose(): void {
    const m = getMixer()
    m?.stopAllAction()
    if (initialized) {
      try {
        helper.remove(mesh)
      }
      catch {}
    }
    registry.clear()
    mixer = undefined
    idleAction = undefined
    currentAction = undefined
    initialized = false
  }

  return {
    helper,
    init,
    registerClip,
    availableClips,
    playIdle,
    playAction,
    setIdleMotion,
    setPhysicsEnabled,
    setGravity,
    setIKEnabled,
    setGrantEnabled,
    update,
    dispose,
  }
}

export type MMDAnimationManager = ReturnType<typeof createMMDAnimationManager>
