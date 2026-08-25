// @vitest-environment jsdom

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
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

  function mountEditor(options: { recording?: object, onRecording?: (recording: object) => void } = {}) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(Live2DMotionKeyframeEditor, {
        recording: options.recording,
        onRecording: options.onRecording,
      }),
    })
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

  it('loads recorded samples and exposes the new facial tracks', async () => {
    const onRecording = vi.fn()
    const mounted = mountEditor({
      recording: {
        format: 'airi-live2d-motion/v6',
        durationMs: 2000,
        samples: [
          { atMs: 0, ...neutralLive2DMotionControlPose },
          { atMs: 1000, ...neutralLive2DMotionControlPose, headX: 0.5 },
          { atMs: 2000, ...neutralLive2DMotionControlPose },
        ],
      },
      onRecording,
    })

    expect(mounted.graph.querySelectorAll('circle')).toHaveLength(3)
    expect(mounted.host.textContent).toContain('.tracks.eyeOpen')
    expect(mounted.host.textContent).toContain('.tracks.mouthForm')
    expect(mounted.host.textContent).toContain('.tracks.mouthOpen')
    expect(mounted.host.textContent).toContain('2.00s')

    mounted.graph.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 500, clientY: 50 }))
    await nextTick()
    expect(onRecording).toHaveBeenCalledOnce()
    expect(onRecording.mock.lastCall?.[0]).toMatchObject({ format: 'airi-live2d-motion/v6', durationMs: 2000 })
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
