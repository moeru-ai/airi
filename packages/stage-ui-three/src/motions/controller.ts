import type { VRMCore } from '@pixiv/three-vrm-core'
import type { AnimationAction, Group } from 'three'

import type { MotionCatalog } from './catalog'
import type { MotionControllerSnapshot, MotionMetadata, MotionPlayOptions } from './types'

import { AnimationClip, AnimationMixer, LoopOnce, LoopRepeat, Quaternion, Vector3 } from 'three'

import { createMotionCatalog } from './catalog'
import { createBodyClip, measureRig } from './rig'

interface ClipEntry {
  clip: AnimationClip
  revision: number | undefined
}

interface QueuedMotion {
  id: string
  options: MotionPlayOptions
}

interface WeightFade {
  from: number
  to: number
  start: number
}

interface ActiveMotion {
  id: string
  sourceClip: AnimationClip
  action: AnimationAction
  idleAction?: AnimationAction
  elapsed: number
  deadline: number
  speed: number
  circleRadius: number | undefined
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  const selected = Number.isFinite(value) ? value! : fallback
  return Math.max(minimum, Math.min(maximum, selected))
}

/**
 * Owns one avatar's mixer, clip cache, request queue, and temporary movement group.
 * Replacement, stop, reset, and disposal invalidate pending playback loads. Idle selection has a separate request lifetime.
 * The caller updates this controller before VRM.update, which retains expression, gaze, and physics ownership.
 */
export class MotionController {
  readonly mixer: AnimationMixer
  readonly catalog: MotionCatalog
  private readonly stockClip: AnimationClip
  private readonly clips = new Map<string, ClipEntry>()
  private readonly retiring = new Map<AnimationAction, number>()
  private readonly fades = new Map<AnimationAction, WeightFade>()
  private readonly queued: QueuedMotion[] = []
  private readonly restPosition: Vector3
  private readonly restRotation: Quaternion
  private readonly targetPosition = new Vector3()
  private readonly targetRotation = new Quaternion()
  private readonly yawAxis = new Vector3(0, 1, 0)
  private readonly height: number
  private movementYaw = 0
  private yawVelocity = 0
  private active: ActiveMotion
  private idleId = 'default-idle'
  private idleClip: AnimationClip
  private loadingId: string | undefined
  private playbackRequest: AbortController | undefined
  private idleRequest: AbortController | undefined
  private error: string | undefined
  private disposed = false

  /** The movement group must be a dedicated parent of vrm.scene, below the user's placement group. */
  constructor(
    private readonly vrm: VRMCore,
    idleClip: AnimationClip,
    private readonly movementRoot: Group,
    catalog = createMotionCatalog(),
  ) {
    this.catalog = catalog
    this.stockClip = createBodyClip(idleClip, vrm)
    this.idleClip = this.stockClip
    this.height = measureRig(vrm).height
    this.restPosition = movementRoot.position.clone()
    this.restRotation = movementRoot.quaternion.clone()
    this.mixer = new AnimationMixer(vrm.scene)
    this.catalog.register({
      id: 'default-idle',
      name: 'Original idle',
      category: 'idle',
      duration: this.stockClip.duration,
      loop: true,
      source: 'builtin',
    }, () => {
      // The controller resolves this entry locally. The shared catalog never retains an avatar or its stock clip.
      throw new Error('The original idle belongs to its avatar controller.')
    })
    this.clips.set('default-idle', { clip: this.stockClip, revision: this.catalog.getRevision('default-idle') })
    const action = this.mixer.clipAction(this.stockClip).setLoop(LoopRepeat, Infinity).play()
    this.active = { id: this.idleId, sourceClip: this.stockClip, action, elapsed: 0, deadline: Infinity, speed: 1, circleRadius: undefined }
  }

  /** Returns a fresh snapshot. Callers cannot mutate controller state through its arrays. */
  get snapshot(): MotionControllerSnapshot {
    return {
      activeId: this.active.id,
      idleId: this.idleId,
      loadingId: this.loadingId,
      queuedIds: this.queued.map(request => request.id),
      cachedClipCount: this.clips.size,
      error: this.error,
    }
  }

  /** Resolves true when playback starts or a request enters the queue. Stale or invalid requests resolve false. */
  async play(id: string, options: MotionPlayOptions = {}): Promise<boolean> {
    if (this.disposed)
      return false
    const metadata = this.catalog.get(id)
    if (!metadata) {
      this.error = `Motion "${id}" is not registered.`
      return false
    }
    if (options.mode === 'queue' && (this.loadingId || this.active.deadline !== Infinity)) {
      if (this.queued.length >= 16) {
        this.error = 'The motion queue is full. Stop playback to clear it.'
        return false
      }
      this.queued.push({ id, options: { ...options, mode: 'replace' } })
      return true
    }
    if (options.mode !== 'queue')
      this.queued.length = 0
    return this.start(id, options, metadata)
  }

  /** Selects a looping idle without interrupting an active gesture. Failed loads keep the current idle. */
  async setIdle(id: string): Promise<boolean> {
    if (this.disposed)
      return false
    const metadata = this.catalog.get(id)
    if (!metadata || metadata.rootMotion || (metadata.category !== 'idle' && metadata.source !== 'imported')) {
      this.error = `Motion "${id}" is not an idle.`
      return false
    }
    this.idleRequest?.abort()
    const request = new AbortController()
    this.idleRequest = request
    try {
      const clip = await this.loadClip(id, request.signal)
      if (request.signal.aborted || this.disposed)
        return false
      if (id === this.idleId && clip === this.idleClip) {
        this.error = undefined
        return true
      }
      const wasIdle = this.active.deadline === Infinity
      const previousIdleClip = this.idleClip
      this.idleId = id
      this.idleClip = clip
      this.error = undefined
      if (wasIdle) {
        this.returnToIdle()
      }
      else {
        const previousIdle = this.active.idleAction
        if (previousIdle)
          this.retire(previousIdle, false)
        this.active.idleAction = this.createIdleCompanion(this.active.sourceClip, false)
        if (previousIdle)
          this.releaseUnusedClip(previousIdle.getClip())
        this.fade(this.active.action, 1, false)
        this.retimeRetiringActions()
        this.trimRetiringActions()
      }
      this.releaseUnusedClip(previousIdleClip)
      return true
    }
    catch {
      if (!request.signal.aborted && !this.disposed)
        this.error = `Idle "${id}" failed to load.`
      return false
    }
    finally {
      if (this.idleRequest === request)
        this.idleRequest = undefined
    }
  }

  /** Clears queued and pending requests, then blends the body and movement back to the selected idle. */
  stop() {
    if (this.disposed)
      return
    this.cancelRequests()
    this.returnToIdle()
  }

  /** Resets immediately for an invisible, detached avatar. Visible stop operations use stop(). */
  reset() {
    if (this.disposed)
      return
    this.cancelRequests()
    this.mixer.stopAllAction()
    this.fades.clear()
    for (const action of this.retiring.keys()) {
      this.retiring.delete(action)
      this.releaseUnusedClip(action.getClip())
    }
    this.movementRoot.position.copy(this.restPosition)
    this.movementRoot.quaternion.copy(this.restRotation)
    this.movementYaw = 0
    this.yawVelocity = 0
    this.returnToIdle(true)
    this.mixer.update(0)
    this.trimCache()
  }

  /** Advances playback in seconds. Long frame gaps still count toward the finite action deadline. */
  update(delta: number) {
    if (this.disposed || !Number.isFinite(delta) || delta <= 0)
      return
    const step = Math.min(delta, 0.1)
    this.active.elapsed += delta
    this.updateFades(this.mixer.time + step)
    this.mixer.update(step)
    for (const [action, deadline] of this.retiring) {
      if (this.mixer.time >= deadline) {
        action.stop()
        this.fades.delete(action)
        this.retiring.delete(action)
        this.releaseUnusedClip(action.getClip())
      }
    }
    if (this.active.elapsed >= this.active.deadline) {
      // A replacement load owns the next turn. Queued requests wait until that replacement finishes.
      if (this.loadingId)
        this.returnToIdle()
      else
        this.advanceQueue()
    }
    this.updateMovement(step)
    this.trimCache()
  }

  /** Cancels pending work, releases mixer bindings, and restores the movement group's initial transform. */
  dispose() {
    if (this.disposed)
      return
    this.cancelRequests()
    this.disposed = true
    this.mixer.stopAllAction()
    this.fades.clear()
    this.mixer.uncacheRoot(this.vrm.scene)
    this.clips.clear()
    for (const action of this.retiring.keys()) {
      this.retiring.delete(action)
      this.releaseUnusedClip(action.getClip())
    }
    this.movementRoot.position.copy(this.restPosition)
    this.movementRoot.quaternion.copy(this.restRotation)
    this.movementYaw = 0
    this.yawVelocity = 0
  }

  private cancelRequests() {
    this.playbackRequest?.abort()
    this.idleRequest?.abort()
    this.playbackRequest = undefined
    this.idleRequest = undefined
    this.loadingId = undefined
    this.queued.length = 0
    this.error = undefined
  }

  private async loadClip(id: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const revision = this.catalog.getRevision(id)
    const cached = this.clips.get(id)
    if (cached && cached.revision === revision) {
      this.clips.delete(id)
      this.clips.set(id, cached)
      return cached.clip
    }
    const source = id === 'default-idle' ? this.stockClip : await this.catalog.load(id, this.vrm, signal)
    signal.throwIfAborted()
    if (this.disposed || revision !== this.catalog.getRevision(id))
      throw new Error('The motion changed before its load completed.')
    const clip = id === 'default-idle' ? this.stockClip : createBodyClip(source, this.vrm)
    this.clips.set(id, { clip, revision })
    if (cached && cached.clip !== clip)
      this.releaseUnusedClip(cached.clip)
    this.trimCache(id)
    return clip
  }

  private async start(id: string, options: MotionPlayOptions, metadata: Readonly<MotionMetadata>) {
    this.playbackRequest?.abort()
    const request = new AbortController()
    this.playbackRequest = request
    this.loadingId = id
    this.error = undefined
    try {
      const clip = await this.loadClip(id, request.signal)
      if (request.signal.aborted || this.disposed)
        return false
      const speed = bounded(options.speed, 1, 0.25, 2)
      const loop = options.loop ?? metadata.loop
      const requestedDeadline = bounded(options.duration, loop ? 15 : clip.duration / speed, 0.1, 60)
      const deadline = loop ? requestedDeadline : Math.min(requestedDeadline, clip.duration / speed)
      const circleRadius = metadata.rootMotion === 'circle'
        ? bounded(options.radius, this.height * 0.12, 0, this.height * 0.2)
        : undefined
      this.transition(id, clip, loop, speed, deadline, circleRadius)
      return true
    }
    catch {
      if (!request.signal.aborted && !this.disposed) {
        this.error = `Motion "${id}" failed to load.`
        // A failed queued motion cannot strand later requests or suppress the idle.
        this.advanceQueue()
      }
      return false
    }
    finally {
      if (this.playbackRequest === request) {
        this.playbackRequest = undefined
        this.loadingId = undefined
      }
    }
  }

  private transition(id: string, clip: AnimationClip, loop: boolean, speed: number, deadline: number, circleRadius?: number, immediate = false) {
    let next = this.mixer.clipAction(clip)
    const previous = this.active
    // A live motion keeps its pose while a separate playback instance restarts the same immutable tracks.
    if (deadline !== Infinity && next.isScheduled() && next.getEffectiveWeight() > 0)
      next = this.mixer.clipAction(new AnimationClip(clip.name, clip.duration, clip.tracks))
    const initialWeight = next.isScheduled() ? next.getEffectiveWeight() : 0
    this.retiring.delete(next)
    if (previous.action !== next)
      this.retire(previous.action, immediate)
    if (previous.idleAction)
      this.retire(previous.idleAction, immediate)
    next.reset().setEffectiveTimeScale(speed).setEffectiveWeight(initialWeight).setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
    next.clampWhenFinished = true
    if (deadline === Infinity)
      next.time = this.mixer.time % clip.duration
    next.play()
    this.fade(next, 1, immediate)
    const idleAction = this.createIdleCompanion(clip, immediate)
    this.active = { id, sourceClip: clip, action: next, idleAction, elapsed: 0, deadline, speed, circleRadius }
    if (previous.action !== next)
      this.releaseUnusedClip(previous.action.getClip())
    if (previous.idleAction)
      this.releaseUnusedClip(previous.idleAction.getClip())
    this.retimeRetiringActions()
    this.trimRetiringActions()
  }

  private createIdleCompanion(clip: AnimationClip, immediate: boolean) {
    const ownedTracks = new Set(clip.tracks.map(track => track.name))
    const tracks = this.idleClip.tracks.filter(track => !ownedTracks.has(track.name))
    if (tracks.length === 0)
      return undefined
    // Disjoint track sets preserve idle movement without diluting the motion on its owned bones.
    // Tracks stay immutable. Only this temporary clip and its mixer bindings need separate ownership.
    const mask = new AnimationClip('masked-idle', this.idleClip.duration, tracks)
    const action = this.mixer.clipAction(mask).setLoop(LoopRepeat, Infinity).setEffectiveTimeScale(1).setEffectiveWeight(0)
    action.time = this.mixer.time % this.idleClip.duration
    action.play()
    this.fade(action, 1, immediate)
    return action
  }

  private retire(action: AnimationAction, immediate: boolean) {
    if (immediate || action.getEffectiveWeight() === 0) {
      action.stop()
      this.fades.delete(action)
      this.retiring.delete(action)
      return
    }
    this.fade(action, 0, false)
    this.retiring.set(action, this.mixer.time + 0.3)
  }

  private fade(action: AnimationAction, to: number, immediate: boolean) {
    if (immediate) {
      action.setEffectiveWeight(to)
      this.fades.delete(action)
      return
    }
    this.fades.set(action, { from: action.getEffectiveWeight(), to, start: this.mixer.time })
  }

  private updateFades(time: number) {
    for (const [action, fade] of this.fades) {
      const progress = Math.min(1, Math.max(0, (time - fade.start) / 0.3))
      action.setEffectiveWeight(fade.from + (fade.to - fade.from) * progress)
      if (progress === 1)
        this.fades.delete(action)
    }
  }

  private retimeRetiringActions() {
    // Matching fade deadlines preserve the per-track weight sum when a new transition interrupts an earlier blend.
    for (const action of this.retiring.keys()) {
      this.fade(action, 0, false)
      this.retiring.set(action, this.mixer.time + 0.3)
    }
  }

  private trimRetiringActions() {
    // Each transition can retire a motion and a masked idle. Rapid replacement retains at most four such pairs.
    while (this.retiring.size > 8) {
      const oldest = this.retiring.keys().next().value
      if (!oldest)
        break
      oldest.stop()
      this.fades.delete(oldest)
      this.retiring.delete(oldest)
      this.releaseUnusedClip(oldest.getClip())
    }
  }

  private returnToIdle(immediate = false) {
    this.transition(this.idleId, this.idleClip, true, 1, Infinity, undefined, immediate)
  }

  private advanceQueue() {
    this.returnToIdle()
    const next = this.queued.shift()
    if (!next)
      return
    const metadata = this.catalog.get(next.id)
    if (!metadata) {
      this.error = `Motion "${next.id}" is no longer registered.`
      this.advanceQueue()
      return
    }
    void this.start(next.id, next.options, metadata)
  }

  private updateMovement(delta: number) {
    this.targetPosition.copy(this.restPosition)
    let targetYaw = 0
    if (this.active.circleRadius !== undefined) {
      const elapsed = this.active.elapsed
      const turn = elapsed * this.active.speed * Math.PI / 2
      const entry = Math.min(1, elapsed / 0.6)
      const radius = this.active.circleRadius * entry * entry * (3 - 2 * entry)
      // The circle starts with its tangent along the avatar's rest heading, without an initial quarter-turn target.
      this.targetPosition.set(-Math.cos(turn) * radius, 0, Math.sin(turn) * radius).applyQuaternion(this.restRotation).add(this.restPosition)
      targetYaw = turn
    }
    const blend = 1 - Math.exp(-10 * delta)
    this.movementRoot.position.lerp(this.targetPosition, blend)

    // Signed velocity bounds both turns and direction changes, including a return from the opposite heading.
    const maximumSpeed = Math.PI
    const maximumAcceleration = Math.PI * 3
    const error = Math.atan2(Math.sin(targetYaw - this.movementYaw), Math.cos(targetYaw - this.movementYaw))
    const brakingSpeed = Math.sqrt(2 * maximumAcceleration * Math.abs(error))
    const desiredVelocity = Math.sign(error) * Math.min(maximumSpeed, Math.abs(error) * 10, brakingSpeed)
    const accelerationStep = maximumAcceleration * delta
    this.yawVelocity += Math.max(-accelerationStep, Math.min(accelerationStep, desiredVelocity - this.yawVelocity))
    this.movementYaw += this.yawVelocity * delta
    this.targetRotation.setFromAxisAngle(this.yawAxis, this.movementYaw).premultiply(this.restRotation)
    this.movementRoot.quaternion.copy(this.targetRotation)

    if (this.active.circleRadius === undefined && this.movementRoot.position.distanceToSquared(this.restPosition) < 0.00000001)
      this.movementRoot.position.copy(this.restPosition)
    if (this.active.circleRadius === undefined && Math.abs(error) < 0.0001 && Math.abs(this.yawVelocity) < 0.001) {
      this.movementRoot.quaternion.copy(this.restRotation)
      this.movementYaw = 0
      this.yawVelocity = 0
    }
  }

  private releaseUnusedClip(clip: AnimationClip) {
    if (clip === this.idleClip || clip === this.active.action.getClip() || clip === this.active.idleAction?.getClip())
      return
    if ([...this.retiring.keys()].some(action => action.getClip() === clip))
      return
    if ([...this.clips.values()].some(entry => entry.clip === clip))
      return
    this.mixer.uncacheClip(clip)
  }

  private trimCache(protectedId?: string) {
    for (const [id, entry] of this.clips) {
      if (this.clips.size <= 8)
        break
      if (id === protectedId || entry.clip === this.idleClip || entry.clip === this.active.sourceClip)
        continue
      const action = this.mixer.existingAction(entry.clip)
      if (action) {
        action.stop()
        this.fades.delete(action)
        this.retiring.delete(action)
        this.releaseUnusedClip(action.getClip())
      }
      this.mixer.uncacheClip(entry.clip)
      this.clips.delete(id)
    }
  }
}
