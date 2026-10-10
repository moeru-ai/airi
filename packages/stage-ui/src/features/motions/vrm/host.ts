import type { NotificationWaveIntent } from '@proj-airi/stage-ui-three/companion'
import type { MotionController } from '@proj-airi/stage-ui-three/motions'
import type { MaybeRefOrGetter } from 'vue'

import { onScopeDispose, ref, toValue, watch } from 'vue'

import * as v from 'valibot'

import { getMotionBus, motionCommand, motionCommandResult } from './bus'
import { motionCommandSchema, motionCorrelationSchema } from './command'
import { gameMotionRequest, gameMotionRequestSchema, gameMotionResult, gameMotionRevoked } from './game-protocol'
import { loadMotionClip } from './import'
import { defaultMotionPreferences, readMotionBytes, relaxedIdle } from './library'
import { MotionOwnership } from './ownership'
import { useVrmMotionsStore } from './store'

const relaxedIdleUrl = new URL('./relaxed-idle.vrma', import.meta.url).href

/** Binds one mounted avatar controller. Stale imports and commands cannot migrate to another avatar. */
export function useVrmMotionHost(options: {
  modelId: MaybeRefOrGetter<string>
  controller: MaybeRefOrGetter<MotionController | undefined>
  loadedModelId: MaybeRefOrGetter<string | undefined>
  companion?: boolean
  manipulationActive?: MaybeRefOrGetter<boolean>
  paused?: MaybeRefOrGetter<boolean>
  doNotDisturb?: MaybeRefOrGetter<boolean>
  reducedMotion?: MaybeRefOrGetter<boolean>
  notificationsEnabled?: MaybeRefOrGetter<boolean>
}) {
  const store = useVrmMotionsStore()
  const bus = getMotionBus()
  let generation = 0
  let ownership: MotionOwnership | undefined
  const motionRevision = ref(0)
  let revisionOwner: MotionOwnership | undefined
  let lastOwnerRevision = -1
  const registrations = new WeakMap<MotionController, Set<string>>()

  function refreshMotionRevision() {
    const revision = ownership?.motionRevision ?? 0
    if (revisionOwner !== ownership || lastOwnerRevision !== revision) {
      revisionOwner = ownership
      lastOwnerRevision = revision
      // A cached scene root can outlive an ownership instance. Its framing watermark must never move backwards.
      motionRevision.value++
    }
  }

  function currentController() {
    // Selection can change before its URL resolves. Never relabel the previous loaded avatar as the new selection.
    return toValue(options.loadedModelId) === toValue(options.modelId) ? toValue(options.controller) : undefined
  }

  function updateAttention() {
    ownership?.setState({
      manipulationActive: toValue(options.manipulationActive) ?? false,
      paused: toValue(options.paused) ?? false,
      doNotDisturb: toValue(options.doNotDisturb) ?? false,
      reducedMotion: toValue(options.reducedMotion) ?? false,
      enabled: !!options.companion && !!toValue(options.notificationsEnabled),
    })
    refreshMotionRevision()
  }

  watch([() => currentController(), () => toValue(options.modelId)], ([controller, modelId]) => {
    generation++
    ownership?.dispose()
    const instanceId = crypto.randomUUID()
    ownership = controller
      ? new MotionOwnership(instanceId, controller, (reservation) => {
          bus.emit(gameMotionRevoked, { modelId, instanceId, ownerId: reservation.ownerId, sessionId: reservation.sessionId })
        })
      : undefined
    updateAttention()
  }, { immediate: true, flush: 'sync' })
  watch([
    () => toValue(options.manipulationActive),
    () => toValue(options.paused),
    () => toValue(options.doNotDisturb),
    () => toValue(options.reducedMotion),
    () => toValue(options.notificationsEnabled),
  ], updateAttention, { flush: 'sync' })
  const poll = setInterval(() => {
    ownership?.tick()
    refreshMotionRevision()
  }, 100)

  watch(() => toValue(options.modelId), (id) => {
    generation++
    void store.loadPreferences(id).catch(console.error)
  }, { immediate: true })

  watch([() => currentController(), () => store.imported], ([controller, entries]) => {
    if (!controller)
      return
    const previous = registrations.get(controller) ?? new Set<string>()
    const next = new Set(entries.map(entry => entry.id))
    for (const id of previous) {
      if (!next.has(id))
        controller.catalog.unregister(id)
    }
    controller.catalog.register(relaxedIdle, async (vrm, signal) => {
      const response = await fetch(relaxedIdleUrl, { signal })
      if (!response.ok)
        throw new Error('Relaxed idle asset unavailable')
      return loadMotionClip(await response.arrayBuffer(), vrm, signal)
    })
    for (const entry of entries)
      controller.catalog.register(entry, async (vrm, signal) => loadMotionClip(await readMotionBytes(entry.id), vrm, signal))
    registrations.set(controller, next)
  }, { immediate: true })

  watch([
    () => currentController(),
    () => store.preferences[toValue(options.modelId)]?.idleId,
    () => store.imported,
  ], ([controller, idleId]) => {
    if (!controller)
      return
    const id = idleId ?? 'default-idle'
    // Deleted idle entries return to the existing stock idle without changing other avatars' preferences.
    void controller.setIdle(controller.catalog.get(id) ? id : 'default-idle')
  }, { immediate: true })

  const removeListener = bus.on(motionCommand, async ({ body }) => {
    const correlation = v.safeParse(motionCorrelationSchema, body)
    if (!correlation.success || correlation.output.modelId !== toValue(options.modelId))
      return
    const parsed = v.safeParse(motionCommandSchema, body)
    const controller = currentController()
    if (!parsed.success || !controller) {
      bus.emit(motionCommandResult, { ...correlation.output, accepted: false })
      return
    }
    const command = parsed.output
    const requestGeneration = generation
    let accepted = false
    try {
      if (command.type === 'stop') {
        ownership?.stop()
        accepted = true
      }
      else {
        const runtime = ownership
        const started = runtime?.playUser(command.motionId, command.options)
        refreshMotionRevision()
        accepted = await started ?? false
        refreshMotionRevision()
      }
    }
    catch (error) {
      console.error('Motion command failed', error)
    }
    if (requestGeneration === generation && controller === currentController())
      bus.emit(motionCommandResult, { ...correlation.output, accepted })
  })

  const removeGameListener = bus.on(gameMotionRequest, async ({ body }) => {
    const parsed = v.safeParse(gameMotionRequestSchema, body)
    if (!options.companion || !parsed.success || parsed.output.modelId !== toValue(options.modelId))
      return
    const request = parsed.output
    const runtime = ownership
    const instanceId = runtime?.modelId ?? 'unavailable'
    const matches = runtime && (request.type === 'reserve' || request.instanceId === instanceId)
    let accepted = false
    if (matches) {
      switch (request.type) {
        case 'reserve':
          accepted = runtime.reserveGame(request.ownerId, request.sessionId)
          break
        case 'heartbeat':
          accepted = runtime.heartbeatGame(request.ownerId, request.sessionId)
          break
        case 'release-session':
          runtime.releaseGame(request.ownerId, request.sessionId)
          break
        case 'release-lease':
          runtime.releaseGameMotion(request.ownerId, request.sessionId, request.leaseId)
          break
        case 'play': {
          const finished = runtime.playGame(request.ownerId, request.sessionId, request.leaseId, request.intentName)
          refreshMotionRevision()
          accepted = await finished
          break
        }
      }
      refreshMotionRevision()
    }
    if (request.type === 'reserve' || request.type === 'heartbeat' || request.type === 'play') {
      bus.emit(gameMotionResult, {
        type: request.type,
        modelId: request.modelId,
        instanceId: request.type === 'reserve' ? instanceId : request.instanceId,
        ownerId: request.ownerId,
        sessionId: request.sessionId,
        requestId: request.requestId,
        accepted: !!accepted && ownership === runtime,
      })
    }
  })

  onScopeDispose(() => {
    generation++
    removeListener()
    removeGameListener()
    clearInterval(poll)
    ownership?.dispose()
    currentController()?.reset()
  })

  /** AI cues use saved per-avatar eligibility. They cannot load a URL or register a new animation. */
  function act(id: string) {
    const preferences = store.preferences[toValue(options.modelId)] ?? defaultMotionPreferences()
    if (!preferences.aiEnabled)
      return
    if (id === 'stop' || preferences.aiMotionIds.includes(id))
      void ownership?.playConversation(id)
    refreshMotionRevision()
  }
  return {
    act,
    motionRevision,
    acknowledgeNotifications: (ids: readonly string[]) => ownership?.acknowledgeNotifications(ids),
    notify: (intent: Omit<NotificationWaveIntent, 'modelId'>) => {
      const accepted = ownership?.notify(intent)
      refreshMotionRevision()
      return accepted
    },
    interact: (id: string) => {
      const started = ownership?.playUser(id, { loop: false, duration: 3 })
      refreshMotionRevision()
      return started
    },
  }
}
