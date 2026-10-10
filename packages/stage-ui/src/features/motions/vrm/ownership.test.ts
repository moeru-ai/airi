import { VRMCore, VRMHumanoid } from '@pixiv/three-vrm-core'
import { MotionController } from '@proj-airi/stage-ui-three/motions'
import { AnimationClip, Group, Object3D, VectorKeyframeTrack } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MotionOwnership } from './ownership'

function setup() {
  const scene = new Group()
  const hips = new Object3D()
  hips.name = 'Hips'
  hips.position.y = 1
  scene.add(hips)
  const head = new Object3D()
  head.position.y = 0.7
  hips.add(head)
  function bone() {
    const node = new Object3D()
    hips.add(node)
    return { node }
  }
  const humanoid = new VRMHumanoid({
    hips: { node: hips },
    head: { node: head },
    spine: bone(),
    leftUpperLeg: bone(),
    leftLowerLeg: bone(),
    leftFoot: bone(),
    rightUpperLeg: bone(),
    rightLowerLeg: bone(),
    rightFoot: bone(),
    leftUpperArm: bone(),
    leftLowerArm: bone(),
    leftHand: bone(),
    rightUpperArm: bone(),
    rightLowerArm: bone(),
    rightHand: bone(),
  })
  scene.add(humanoid.normalizedHumanBonesRoot)
  const vrm = new VRMCore({ scene, humanoid, meta: { metaVersion: '1', name: 'Test', authors: ['AIRI'], licenseUrl: 'https://opensource.org/license/mit' } })
  const root = new Group()
  root.add(scene)
  const normalized = humanoid.getNormalizedBoneNode('hips')!
  const rest = normalized.position.toArray()
  const clip = new AnimationClip('idle', 1, [new VectorKeyframeTrack(`${normalized.name}.position`, [0, 1], [...rest, ...rest])])
  const controller = new MotionController(vrm, clip, root)
  // Simple real clips exercise controller cancellation without depending on procedural rig completeness.
  for (const id of ['wave', 'bow', 'nod', 'present', 'celebrate'])
    controller.catalog.register({ id, name: id, duration: 1, category: 'gesture', loop: false, source: 'builtin' }, () => clip.clone())
  const revoked = vi.fn()
  const host = new MotionOwnership('loaded-a', controller, revoked)
  const state = { manipulationActive: false, paused: false, doNotDisturb: false, reducedMotion: false, enabled: true }
  host.setState(state)
  return { controller, host, state, revoked, clip }
}

async function settle() {
  for (let index = 0; index < 12; index++)
    await Promise.resolve()
}
function advance(controller: MotionController, seconds = 6) {
  for (let index = 0; index < seconds * 60; index++)
    controller.update(1 / 60)
}
function intent(id: string) {
  return { eventId: id, intentId: id, createdAt: Date.now(), expiresAt: Date.now() + 5000 }
}

afterEach(() => vi.useRealTimers())

describe('loaded avatar ownership', () => {
  it('waits through user motion and starts a fresh notification at idle', async () => {
    const { host, controller } = setup()
    await host.playUser('bow')
    host.notify(intent('one'))
    expect(controller.snapshot.activeId).toBe('bow')
    advance(controller)
    host.tick()
    await settle()
    expect(controller.snapshot.activeId).toBe('wave')
    host.dispose()
  })

  it('cancels only its notification when a user replaces it with the same wave ID', async () => {
    const { host, controller, state } = setup()
    host.notify(intent('one'))
    await settle()
    expect(controller.snapshot.activeId).toBe('wave')
    await host.playUser('wave', { duration: 3 })
    host.setState({ ...state, doNotDisturb: true })
    expect(controller.snapshot.activeId).toBe('wave')
    host.dispose()
  })

  it('stops an active notification on DND and never replays it', async () => {
    const { host, controller, state } = setup()
    host.notify(intent('one'))
    await settle()
    host.setState({ ...state, doNotDisturb: true })
    expect(controller.snapshot.activeId).toBe(controller.snapshot.idleId)
    host.setState(state)
    host.tick()
    await settle()
    expect(controller.snapshot.activeId).toBe(controller.snapshot.idleId)
    host.dispose()
  })

  it('reserves notification priority between game gestures and permits user stop', async () => {
    const { host, controller, revoked } = setup()
    expect(host.reserveGame('room', 1)).toBe(true)
    host.notify(intent('one'))
    host.tick()
    expect(controller.snapshot.activeId).toBe(controller.snapshot.idleId)
    const played = host.playGame('room', 1, 'gesture', 'wave')
    await settle()
    expect(controller.snapshot.activeId).toBe('wave')
    expect(await host.playConversation('bow')).toBe(false)
    expect(await host.playConversation('stop')).toBe(false)
    host.stop()
    expect(await played).toBe(false)
    expect(host.gameActive).toBe(false)
    expect(revoked).toHaveBeenCalledOnce()
    expect(controller.snapshot.activeId).toBe(controller.snapshot.idleId)
    host.dispose()
  })

  it('resolves game playback only after completion and ignores stale lease release', async () => {
    const { host, controller } = setup()
    host.reserveGame('room', 1)
    let complete = false
    const played = host.playGame('room', 1, 'gesture', 'wave').then((value) => {
      complete = true
      return value
    })
    await settle()
    expect(complete).toBe(false)
    host.releaseGameMotion('room', 1, 'wrong-lease')
    expect(controller.snapshot.activeId).toBe('wave')
    advance(controller)
    host.tick()
    expect(await played).toBe(true)
    expect(host.gameActive).toBe(true)
    host.dispose()
  })

  it('preempts a game during manipulation and rejects late heartbeat resurrection', async () => {
    const { host, controller, state } = setup()
    host.reserveGame('room', 1)
    const played = host.playGame('room', 1, 'gesture', 'wave')
    await settle()
    host.setState({ ...state, manipulationActive: true })
    expect(await played).toBe(false)
    expect(host.heartbeatGame('room', 1)).toBe(false)
    expect(await host.playUser('bow')).toBe(false)
    expect(controller.snapshot.activeId).toBe(controller.snapshot.idleId)
    host.dispose()
  })

  it('clears a lost renderer reservation after four seconds', () => {
    vi.useFakeTimers()
    const { host } = setup()
    host.reserveGame('room', 1)
    vi.advanceTimersByTime(4001)
    host.tick()
    expect(host.gameActive).toBe(false)
    expect(host.heartbeatGame('room', 1)).toBe(false)
    host.dispose()
  })

  it('rejects a heartbeat after expiry even before the next poll', () => {
    vi.useFakeTimers()
    const { host } = setup()
    host.reserveGame('room', 1)
    vi.advanceTimersByTime(4001)
    expect(host.heartbeatGame('room', 1)).toBe(false)
    expect(host.gameActive).toBe(false)
    host.dispose()
  })

  it('rejects a game gesture after expiry before the next poll', async () => {
    vi.useFakeTimers()
    const { host, controller } = setup()
    host.reserveGame('room', 1)
    vi.advanceTimersByTime(4001)
    expect(await host.playGame('room', 1, 'gesture', 'wave')).toBe(false)
    expect(controller.snapshot.activeId).toBe(controller.snapshot.idleId)
    expect(host.gameActive).toBe(false)
    host.dispose()
  })

  it('invalidates a pending import before starting a newer request', async () => {
    const { host, controller, clip } = setup()
    let load!: (clip: AnimationClip) => void
    controller.catalog.register({ id: 'delayed', name: 'Delayed', duration: 1, loop: false, category: 'gesture', source: 'imported' }, () => new Promise<AnimationClip>((resolve) => {
      load = resolve
    }))
    const previous = host.playUser('delayed')
    await host.playUser('wave')
    load(clip)
    expect(await previous).toBe(false)
    expect(controller.snapshot.activeId).toBe('wave')
    host.dispose()
  })

  it('lets priority attention preempt a conversation cue', async () => {
    const { host, controller } = setup()
    await host.playConversation('bow')
    host.notify(intent('one'))
    await settle()
    expect(controller.snapshot.activeId).toBe('wave')
    host.dispose()
  })

  it('retains replay protection after emergency stop', async () => {
    const { host, controller } = setup()
    const event = intent('one')
    host.notify(event)
    await settle()
    host.stop()
    expect(host.notify(event)).toBe('duplicate')
    expect(controller.snapshot.activeId).toBe(controller.snapshot.idleId)
    host.dispose()
  })

  it('does not invent unsupported hand shapes or restart disposed models', async () => {
    const { host, controller } = setup()
    host.reserveGame('room', 1)
    expect(await host.playGame('room', 1, 'gesture', 'rock')).toBe(false)
    host.dispose()
    expect(await host.playUser('wave')).toBe(false)
    expect(host.notify(intent('one'))).toBe('suppressed')
    expect(controller.snapshot.activeId).toBe(controller.snapshot.idleId)
  })
})

it('does not stop conversation for attention that DND suppresses', async () => {
  vi.useFakeTimers()
  const { host, controller, state } = setup()
  host.notify(intent('one'))
  await settle()
  advance(controller)
  host.tick()
  host.notify(intent('two'))
  await host.playConversation('bow')
  expect(controller.snapshot.activeId).toBe('bow')
  host.setState({ ...state, doNotDisturb: true })
  expect(controller.snapshot.activeId).toBe('bow')
  host.dispose()
})
it('does not stop conversation for an expired pending attention', async () => {
  vi.useFakeTimers()
  const { host, controller } = setup()
  host.notify(intent('one'))
  await settle()
  advance(controller)
  host.tick()
  host.notify(intent('two'))
  vi.advanceTimersByTime(5001)
  await host.playConversation('bow')
  expect(controller.snapshot.activeId).toBe('bow')
  host.tick()
  expect(controller.snapshot.activeId).toBe('bow')
  host.dispose()
})

it('withdraws read pending groups without canceling the active wave', async () => {
  const { host, controller } = setup()
  await host.playUser('bow')
  host.notify({ ...intent('one'), coalesceKey: 'read-group' })
  host.acknowledgeNotifications(['read-group'])
  advance(controller)
  host.tick()
  await settle()
  expect(controller.snapshot.activeId).toBe(controller.snapshot.idleId)
  host.notify({ ...intent('two'), coalesceKey: 'active-group' })
  await settle()
  expect(controller.snapshot.activeId).toBe('wave')
  host.acknowledgeNotifications(['active-group'])
  expect(controller.snapshot.activeId).toBe('wave')
  host.dispose()
})
