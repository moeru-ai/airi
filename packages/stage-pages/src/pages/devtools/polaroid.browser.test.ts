import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { defineComponent, h, reactive, ref } from 'vue'

import PolaroidPage from './polaroid.vue'

vi.mock('@proj-airi/stage-ui/stores/settings/stage-model', () => ({
  useSettingsStageModel: () => reactive({
    stageModelSelected: ref('display-model-1'),
    stageModelSelectedUrl: ref('blob:display-model-1'),
  }),
}))

vi.mock('@proj-airi/stage-ui-live2d/components/scenes/live2d', async () => {
  const { useLive2D } = await import('@proj-airi/stage-ui-live2d/contexts/live2d')

  // The real Canvas and Model need WebGL and a Cubism model. These stubs keep
  // the part that this test checks: both components read the nearest Live2D Root.
  const Live2DCanvas = defineComponent({
    setup(_, { slots }) {
      useLive2D()
      return () => h('div', slots.default?.({ app: undefined }))
    },
  })
  const Live2DModel = defineComponent({
    props: { modelSrc: String, modelId: String },
    setup(props, { expose }) {
      useLive2D()
      expose({ listMotionGroups: () => [], setMotion: () => {} })
      return () => h('div', { 'data-testid': 'polaroid-model' }, `${props.modelId} ${props.modelSrc}`)
    },
  })

  return { Live2DCanvas, Live2DModel }
})

afterEach(() => {
  cleanup()
})

describe('polaroid devtools page', () => {
  // ROOT CAUSE:
  //
  // Live2D Canvas and Model read their context from a parent Live2D Root. The
  // Polaroid page rendered them without a Root, so useLive2D() threw in setup.
  //
  // We fixed this by wrapping the canvas in Live2DRoot.
  it('renders the selected model inside a Live2D Root', async () => {
    const screen = render(PolaroidPage)

    await expect.element(screen.getByTestId('polaroid-model')).toHaveTextContent('display-model-1 blob:display-model-1')
  })
})
