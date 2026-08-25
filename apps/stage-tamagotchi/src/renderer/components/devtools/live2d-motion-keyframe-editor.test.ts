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
    return { app, host }
  }

  function findButton(host: HTMLElement, text: string) {
    return [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === text)!
  }

  it('shows all tracks on one shared timeline and expands the active track', () => {
    const mounted = mountEditor()

    expect(mounted.host.querySelectorAll('article')).toHaveLength(11)
    expect(mounted.host.querySelectorAll('svg')).toHaveLength(12)
    expect(mounted.host.querySelectorAll('article[data-active="true"]')).toHaveLength(1)
    expect(mounted.host.textContent).toContain('.tracks.eyeOpen')
    expect(mounted.host.textContent).toContain('.tracks.mouthForm')
    expect(mounted.host.textContent).toContain('.tracks.mouthOpen')

    mounted.app.unmount()
  })

  it('adds a sparse overlay, edits its points, and emits a baked recording', async () => {
    const onRecording = vi.fn()
    const mounted = mountEditor({ onRecording })

    findButton(mounted.host, 'tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.add').click()
    await nextTick()
    const activeGraph = mounted.host.querySelector<SVGSVGElement>('article[data-active="true"] svg')!
    vi.spyOn(activeGraph, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 220,
      right: 1000,
      bottom: 220,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    expect(activeGraph.querySelectorAll('.motion-overlay-point')).toHaveLength(2)
    activeGraph.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 200, clientY: 50 }))
    await nextTick()
    expect(activeGraph.querySelectorAll('.motion-overlay-point')).toHaveLength(3)

    activeGraph.querySelector<SVGCircleElement>('.motion-overlay-point')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextTick()
    expect(activeGraph.querySelectorAll('.motion-overlay-point')).toHaveLength(2)
    expect(onRecording).toHaveBeenCalled()
    expect(onRecording.mock.lastCall?.[0]).toMatchObject({ format: 'airi-live2d-motion/v6', durationMs: 4000 })

    mounted.app.unmount()
  })

  it('keeps a loaded dense recording locked beneath overlays', async () => {
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
    })
    await nextTick()

    expect(mounted.host.querySelectorAll('.motion-overlay-point')).toHaveLength(0)
    expect(mounted.host.textContent).toContain('0.00s / 2.00s')
    expect(mounted.host.querySelectorAll('article path')).toHaveLength(22)

    mounted.app.unmount()
  })
})
