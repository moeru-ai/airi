import { ThreeScene, useModelStore } from '@proj-airi/stage-ui-three'
import { createPinia } from 'pinia'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import 'virtual:uno.css'

/** Parent node, name, and translation of each node of the minimal humanoid. */
const humanoidNodes = [
  [undefined, 'hips', [0, 0.9, 0]],
  [0, 'spine', [0, 0.1, 0]],
  [1, 'head', [0, 0.5, 0]],
  [1, 'leftUpperArm', [0.2, 0.4, 0]],
  [3, 'leftLowerArm', [0.25, 0, 0]],
  [4, 'leftHand', [0.25, 0, 0]],
  [1, 'rightUpperArm', [-0.2, 0.4, 0]],
  [6, 'rightLowerArm', [-0.25, 0, 0]],
  [7, 'rightHand', [-0.25, 0, 0]],
  [0, 'leftUpperLeg', [0.1, -0.05, 0]],
  [9, 'leftLowerLeg', [0, -0.4, 0]],
  [10, 'leftFoot', [0, -0.4, 0]],
  [0, 'rightUpperLeg', [-0.1, -0.05, 0]],
  [12, 'rightLowerLeg', [0, -0.4, 0]],
  [13, 'rightFoot', [0, -0.4, 0]],
] as const

/**
 * Builds a VRM 1.0 file with the required humanoid bones and one triangle.
 *
 * The view settings do not depend on the model content. A small model keeps each of the
 * repeated loads below to a fraction of the time that a preset avatar needs.
 */
function createMinimalVrm(): Blob {
  // The triangle spans a human-sized bounding box, so the camera frames it like an avatar.
  const positions = new Float32Array([-0.2, 0, -0.1, 0.2, 1.6, 0.1, 0.2, 0, 0.1])
  const binary = new Uint8Array(positions.buffer)

  const boneOffset = 1
  const nodes = [
    { name: 'body', mesh: 0 },
    ...humanoidNodes.map(([, name, translation], index) => {
      const children = humanoidNodes.flatMap(([parent], child) => parent === index ? [child + boneOffset] : [])
      return children.length > 0 ? { name, translation, children } : { name, translation }
    }),
  ]

  const json = {
    asset: { version: '2.0', generator: 'AIRI browser test' },
    extensionsUsed: ['VRMC_vrm'],
    scene: 0,
    scenes: [{ nodes: [0, boneOffset] }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ name: 'body' }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.byteLength, target: 34962 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.2, 0, -0.1], max: [0.2, 1.6, 0.1] }],
    extensions: {
      VRMC_vrm: {
        specVersion: '1.0',
        meta: { name: 'Minimal test humanoid', authors: ['Project AIRI'], licenseUrl: 'https://vrm.dev/licenses/1.0/' },
        humanoid: {
          humanBones: Object.fromEntries(humanoidNodes.map(([, name], index) => [name, { node: index + boneOffset }])),
        },
      },
    },
  }

  // A GLB chunk length must be a multiple of 4. JSON pads with spaces and binary data pads with zeros.
  const pad = (length: number) => Math.ceil(length / 4) * 4
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = pad(jsonBytes.byteLength)
  const binaryLength = pad(binary.byteLength)
  const glb = new Uint8Array(12 + 8 + jsonLength + 8 + binaryLength)
  const view = new DataView(glb.buffer)
  view.setUint32(0, 0x46546C67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, glb.byteLength, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4E4F534A, true)
  glb.fill(0x20, 20, 20 + jsonLength)
  glb.set(jsonBytes, 20)
  view.setUint32(20 + jsonLength, binaryLength, true)
  view.setUint32(24 + jsonLength, 0x004E4942, true)
  glb.set(binary, 28 + jsonLength)

  return new Blob([glb], { type: 'model/gltf-binary' })
}

let vrmModel: Blob
let vrmModelUrl: string

beforeAll(() => {
  vrmModel = createMinimalVrm()
  vrmModelUrl = URL.createObjectURL(vrmModel)
})

describe('imported VRM view settings', () => {
  // https://github.com/moeru-ai/airi/issues/1806
  it('resets the legacy view once and preserves later reloads for Issue #1806', async () => {
    // ROOT CAUSE:
    //
    // An imported VRM receives a new Blob URL when AIRI reloads the selected model.
    // The scene treats that URL change as a model switch and replaces the saved view settings.
    //
    // The selected display model ID is stable across reloads. The scene must use that ID
    // for model identity and keep the Blob URL only for resource loading.
    // A new model ID can arrive before its URL. The old load must not commit the new ID.
    // Existing installations only have the old runtime URL identity key. AIRI cannot
    // safely map that URL back to a persisted file after restart. The first new-version
    // load must reset once and establish a stable model ID for later reloads.
    // A reload also creates a new VRM group. The saved offset must be applied to that
    // group even when the store value does not change and its watcher does not run.
    // The old group must leave the scene before AIRI commits the replacement group.
    const pinia = createPinia()
    const modelStore = useModelStore(pinia)
    modelStore.resetModelStore()
    localStorage.setItem('settings/stage-ui-three/lastModelSrc', vrmModelUrl)
    modelStore.modelOffset = { x: 0.25, y: 0.25, z: 0 }
    const modelId = shallowRef('display-model-issue-1806')
    const modelSrc = shallowRef(vrmModelUrl)
    const sceneComponent = shallowRef<InstanceType<typeof ThreeScene>>()
    modelStore.resetLegacyModelIdentity()
    const container = document.createElement('div')
    container.style.height = '600px'
    container.style.width = '800px'
    document.body.appendChild(container)

    const TestHarness = defineComponent(() => () => h(ThreeScene, {
      ref: sceneComponent,
      modelId: modelId.value,
      modelSrc: modelSrc.value,
      style: { height: '600px', width: '800px' },
    }))

    function renderedModelOffset() {
      const position = sceneComponent.value?.scene()?.parent?.position
      if (!position)
        return undefined

      return { x: position.x, y: position.y, z: position.z }
    }

    const app = createApp(TestHarness)
    app.use(pinia)
    app.mount(container)

    await expect.poll(() => {
      const bounds = container.firstElementChild?.getBoundingClientRect()
      return { height: bounds?.height, width: bounds?.width }
    }).toEqual({ height: 600, width: 800 })

    // NOTICE:
    // Keep the app mounted until Vitest closes the browser page.
    // Vue DevTools schedules inspector work after app.unmount(), which rejects after teardown.
    // Source/context: the Stage Web Vite configuration used by this browser test.
    // Removal condition: Vue DevTools supports component-test app teardown.

    await expect.poll(() => modelStore.scenePhase, { timeout: 20_000 }).toBe('mounted')
    expect(modelStore.lastCommittedModelId).toBe('display-model-issue-1806')
    expect(localStorage.getItem('settings/stage-ui-three/lastModelId')).toBe('display-model-issue-1806')
    expect(modelStore.modelOffset).toEqual({ x: 0, y: 0, z: 0 })
    expect(localStorage.getItem('settings/stage-ui-three/lastModelSrc')).toBeNull()

    modelStore.modelOffset = { x: 0.35, y: 0.35, z: 0 }
    modelStore.cameraDistance = 1.75
    await expect.poll(renderedModelOffset).toEqual({ x: 0.35, y: 0.35, z: 0 })
    const previousModelGroup = sceneComponent.value?.scene()?.parent
    expect(previousModelGroup).toBeTruthy()
    const previousModelSrc = modelSrc.value
    modelSrc.value = URL.createObjectURL(vrmModel)
    await nextTick()

    await expect.poll(() => modelStore.scenePhase, { timeout: 20_000 }).toBe('loading')
    await expect.poll(() => modelStore.scenePhase, { timeout: 20_000 }).toBe('mounted')

    expect(modelSrc.value).not.toBe(previousModelSrc)
    expect(modelStore.modelOffset).toEqual({ x: 0.35, y: 0.35, z: 0 })
    expect(renderedModelOffset()).toEqual({ x: 0.35, y: 0.35, z: 0 })
    expect(modelStore.cameraDistance).toBe(1.75)
    expect(sceneComponent.value?.scene()?.parent === previousModelGroup).toBe(false)
    expect(previousModelGroup?.parent === null).toBe(true)

    modelId.value = 'display-model-other'
    modelSrc.value = URL.createObjectURL(vrmModel)
    await nextTick()

    await expect.poll(() => modelStore.scenePhase, { timeout: 20_000 }).toBe('loading')
    await expect.poll(() => modelStore.scenePhase, { timeout: 20_000 }).toBe('mounted')

    expect(modelStore.lastCommittedModelId).toBe('display-model-other')
    expect(modelStore.modelOffset).toEqual({ x: 0, y: 0, z: 0 })

    modelStore.modelOffset = { x: 0.45, y: 0.45, z: 0 }
    const outgoingModelId = modelId.value
    modelSrc.value = URL.createObjectURL(vrmModel)
    await nextTick()

    await expect.poll(() => modelStore.scenePhase, { timeout: 20_000 }).toBe('loading')
    modelId.value = 'display-model-incoming'
    await nextTick()

    await expect.poll(() => modelStore.scenePhase, { timeout: 20_000 }).toBe('mounted')
    expect(modelStore.lastCommittedModelId).toBe(outgoingModelId)
    expect(modelStore.modelOffset).toEqual({ x: 0.45, y: 0.45, z: 0 })

    modelSrc.value = URL.createObjectURL(vrmModel)
    await nextTick()

    await expect.poll(() => modelStore.scenePhase, { timeout: 20_000 }).toBe('loading')
    await expect.poll(() => modelStore.scenePhase, { timeout: 20_000 }).toBe('mounted')

    expect(modelStore.lastCommittedModelId).toBe('display-model-incoming')
    expect(modelStore.modelOffset).toEqual({ x: 0, y: 0, z: 0 })
  }, 120_000) // Repeated real VRM loads need a generous timeout.
})
