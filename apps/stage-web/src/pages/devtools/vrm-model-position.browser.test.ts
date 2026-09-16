import { ThreeScene, useModelStore } from '@proj-airi/stage-ui-three'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { createPinia } from 'pinia'
import { beforeAll, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import 'virtual:uno.css'

let vrmModel: Blob
let vrmModelUrl: string

beforeAll(async () => {
  const pinia = createPinia()
  const displayModels = useDisplayModelsStore(pinia)
  const preset = await displayModels.getDisplayModel('preset-vrm-1')
  if (preset?.type !== 'url')
    throw new Error('The VRM test preset is unavailable.')

  vrmModelUrl = preset.url
  const response = await fetch(preset.url)
  if (!response.ok)
    throw new Error(`Failed to load the VRM test preset: ${response.status}`)

  vrmModel = await response.blob()
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
  }, 45_000)
})
