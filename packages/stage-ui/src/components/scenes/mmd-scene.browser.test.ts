import { MMDScene } from '@proj-airi/stage-ui-mmd'
import { createTrianglePmx } from '@proj-airi/stage-ui-mmd/testing/empty-pmx'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

type SceneInstance = InstanceType<typeof MMDScene>

async function waitFor(condition: () => boolean, timeoutMs = 15_000) {
  const start = performance.now()
  while (!condition()) {
    if (performance.now() - start > timeoutMs)
      throw new Error('Timed out waiting for the MMD scene')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

/** Counts the WebGL draw calls of one frame that the scene renders on request. */
async function drawCallsOfOneFrame(scene: SceneInstance) {
  const prototype = WebGL2RenderingContext.prototype
  const drawElements = prototype.drawElements
  let calls = 0
  prototype.drawElements = function (...args: Parameters<typeof drawElements>) {
    calls += 1
    return drawElements.apply(this, args)
  }
  let snapshot: ReturnType<SceneInstance['captureFrame']>
  try {
    // captureFrame() renders synchronously. Stop counting before awaiting the PNG,
    // so frames from the scene's own render loop never enter the measurement.
    snapshot = scene.captureFrame()
  }
  finally {
    prototype.drawElements = drawElements
  }
  await snapshot
  return calls
}

describe('mMDScene model loading', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    while (cleanups.length)
      cleanups.pop()!()
  })

  function mount(initialSource: string) {
    const source = ref(initialSource)
    const state = ref<'pending' | 'loading' | 'mounted'>('pending')
    const errors: unknown[] = []
    const scene = ref<SceneInstance>()
    const host = document.createElement('div')
    host.style.cssText = 'width: 320px; height: 240px'
    document.body.append(host)
    const app = createApp({
      render: () => h(MMDScene, {
        'ref': scene,
        'modelSrc': source.value,
        'state': state.value,
        'onUpdate:state': (value: 'pending' | 'loading' | 'mounted') => { state.value = value },
        'onError': (error: unknown) => errors.push(error),
      }),
    })
    app.use(createPinia())
    app.mount(host)
    cleanups.push(() => {
      app.unmount()
      host.remove()
    })
    return { source, state, errors, scene }
  }

  function modelUrl() {
    const url = URL.createObjectURL(new Blob([createTrianglePmx()]))
    cleanups.push(() => URL.revokeObjectURL(url))
    return url
  }

  it('keeps one model in the scene when the source changes during a load', async () => {
    // ROOT CAUSE:
    //
    // loadModel() disposed the previous model and then awaited the new one without a load identity.
    // Two overlapping loads both reached scene.add(). The component kept only the last model,
    // so the first stayed in the scene in its rest pose, where no animation or transform reached it.
    const single = mount(modelUrl())
    await waitFor(() => single.state.value === 'mounted')
    const oneModel = await drawCallsOfOneFrame(single.scene.value!)
    expect(oneModel).toBeGreaterThan(0)
    cleanups.pop()!()

    const overlapping = mount(modelUrl())
    // Replace the source while the first load is still in flight.
    await nextTick()
    overlapping.source.value = modelUrl()
    await nextTick()
    await waitFor(() => overlapping.state.value === 'mounted')
    // Let the superseded load finish as well.
    await new Promise(resolve => setTimeout(resolve, 500))

    expect(overlapping.errors).toEqual([])
    expect(await drawCallsOfOneFrame(overlapping.scene.value!)).toBe(oneModel)
  })
})
