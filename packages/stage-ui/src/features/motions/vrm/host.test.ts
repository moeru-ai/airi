import { VRMCore, VRMHumanoid } from '@pixiv/three-vrm-core'
import { MotionController } from '@proj-airi/stage-ui-three/motions'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { AnimationClip, Group, Object3D, VectorKeyframeTrack } from 'three'
import { expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'

import { getMotionBus, motionCommand, motionCommandResult } from './bus'
import { useVrmMotionHost } from './host'
import { defaultMotionPreferences } from './library'
import { useVrmMotionsStore } from './store'

function createController() {
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
  return controller
}

it('does not relabel the mounted avatar while a selected model URL is still resolving', async () => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const scope = effectScope()
  const first = createController()
  const second = createController()
  const controller = shallowRef(first)
  const modelId = ref('avatar-a')
  const loadedModelId = ref<string | undefined>('avatar-a')
  // Node has no IndexedDB driver. Keep the real store and its caught, expected storage failures.
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  const results: boolean[] = []
  const stopResults = getMotionBus().on(motionCommandResult, ({ body }) => {
    if (body?.requestId === 'selected-before-loaded')
      results.push(body.accepted)
  })
  try {
    const host = scope.run(() => useVrmMotionHost({ modelId, loadedModelId, controller }))!
    const store = useVrmMotionsStore()
    expect(await host.interact('wave')).toBe(true)
    expect(first.snapshot.activeId).toBe('wave')

    await host.interact('bow')
    await host.interact('wave')
    const firstRevision = host.motionRevision.value
    modelId.value = 'avatar-b'
    expect(host.motionRevision.value).toBeGreaterThan(firstRevision)
    store.preferences['avatar-b'] = { ...defaultMotionPreferences(), idleId: 'bow', aiEnabled: true, aiMotionIds: ['nod'] }
    await nextTick()
    expect(first.snapshot.activeId).toBe(first.snapshot.idleId)
    expect(first.snapshot.idleId).toBe('default-idle')
    expect(await host.interact('bow')).toBeUndefined()
    host.act('nod')
    await getMotionBus().emit(motionCommand, { modelId: 'avatar-b', requestId: 'selected-before-loaded', type: 'play', motionId: 'wave', options: {} })
    expect(results).toEqual([false])
    expect(first.snapshot.activeId).toBe(first.snapshot.idleId)

    const pendingRevision = host.motionRevision.value
    modelId.value = 'avatar-a'
    expect(host.motionRevision.value).toBeGreaterThan(pendingRevision)
    const returnedRevision = host.motionRevision.value
    expect(await host.interact('nod')).toBe(true)
    expect(host.motionRevision.value).toBeGreaterThan(returnedRevision)
    modelId.value = 'avatar-b'

    controller.value = second
    loadedModelId.value = 'avatar-b'
    await nextTick()
    expect(await host.interact('nod')).toBe(true)
    expect(second.snapshot.activeId).toBe('nod')
    expect(first.snapshot.activeId).toBe('default-idle')
  }
  finally {
    stopResults()
    scope.stop()
    disposePinia(pinia)
    first.dispose()
    second.dispose()
    errors.mockRestore()
  }
})
