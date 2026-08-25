// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import Live2DMotionKeyframeEditor from './live2d-motion-keyframe-editor.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('live2DMotionKeyframeEditor', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  function mountEditor() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(Live2DMotionKeyframeEditor) })
    app.mount(host)
    const graph = host.querySelector('svg')!
    vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 200,
      right: 1000,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    return { app, graph, host }
  }

  it('adds on empty double-click and deletes on point double-click', async () => {
    const mounted = mountEditor()
    expect(mounted.graph.querySelectorAll('circle')).toHaveLength(2)

    mounted.graph.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 500, clientY: 50 }))
    await nextTick()
    expect(mounted.graph.querySelectorAll('circle')).toHaveLength(3)

    mounted.graph.querySelector('circle')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextTick()
    expect(mounted.graph.querySelectorAll('circle')).toHaveLength(2)

    mounted.app.unmount()
  })

  it('moves a point while it is dragged', async () => {
    const mounted = mountEditor()
    const point = mounted.graph.querySelector<SVGCircleElement>('circle')!
    point.setPointerCapture = vi.fn()
    const pointerDown = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 100 })
    Object.defineProperty(pointerDown, 'pointerId', { value: 1 })
    point.dispatchEvent(pointerDown)
    point.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 250, clientY: 25 }))
    await nextTick()

    expect(point.getAttribute('cx')).toBe('250')
    expect(point.getAttribute('cy')).toBe('70')
    mounted.app.unmount()
  })
})
