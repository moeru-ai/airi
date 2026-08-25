// @vitest-environment jsdom

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'

import Live2DMotionKeyframeEditor from './live2d-motion-keyframe-editor.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

describe('live2DMotionKeyframeEditor', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  function mountEditor(options: {
    recording?: object
    recordingActive?: boolean
    onRecording?: (recording: object) => void
    onToggleRecording?: () => void
  } = {}) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const recording = shallowRef(options.recording)
    const recordingActive = shallowRef(options.recordingActive ?? false)
    const app = createApp({
      render: () => h(Live2DMotionKeyframeEditor, {
        recording: recording.value,
        recordingActive: recordingActive.value,
        onRecording: options.onRecording,
        onToggleRecording: options.onToggleRecording,
      }),
    })
    app.mount(host)
    return { app, host, recording, recordingActive }
  }

  function findButton(host: HTMLElement, text: string) {
    return [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === text)!
  }

  it('shows all tracks on one shared timeline and expands the active track', () => {
    const mounted = mountEditor()
    const rulerRow = mounted.host.querySelector<HTMLElement>('[data-testid="motion-timeline-ruler-row"]')!
    const trackList = mounted.host.querySelector<HTMLElement>('[data-testid="motion-timeline-track-list"]')!

    expect(mounted.host.querySelectorAll('article')).toHaveLength(11)
    expect(mounted.host.querySelectorAll('svg')).toHaveLength(12)
    expect(mounted.host.querySelectorAll('article[data-active="true"]')).toHaveLength(1)
    expect(rulerRow.classList).toContain('grid-cols-[calc(12rem+0.75rem)_minmax(0,1fr)]')
    expect(rulerRow.classList).toContain('pr-3')
    expect(trackList.classList).toContain('p-3')
    expect(mounted.host.textContent).toContain('.tracks.eyeOpen')
    expect(mounted.host.textContent).toContain('.tracks.mouthForm')
    expect(mounted.host.textContent).toContain('.tracks.mouthOpen')

    mounted.app.unmount()
  })

  it('owns recording and streams captured samples into the source timeline', async () => {
    const onToggleRecording = vi.fn()
    const mounted = mountEditor({
      recordingActive: true,
      onToggleRecording,
      recording: {
        format: 'airi-live2d-motion/v6',
        durationMs: 25,
        samples: [
          { atMs: 0, ...neutralLive2DMotionControlPose },
          { atMs: 25, ...neutralLive2DMotionControlPose, headX: 0.25 },
        ],
      },
    })

    expect(mounted.host.textContent).toContain('0.03s / 0.03s')
    findButton(mounted.host, 'tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.stop-recording').click()
    expect(onToggleRecording).toHaveBeenCalledOnce()

    mounted.recording.value = {
      format: 'airi-live2d-motion/v6',
      durationMs: 100,
      samples: [
        { atMs: 0, ...neutralLive2DMotionControlPose },
        { atMs: 25, ...neutralLive2DMotionControlPose, headX: 0.25 },
        { atMs: 100, ...neutralLive2DMotionControlPose, headX: 0.75 },
      ],
    }
    await nextTick()

    expect(mounted.host.textContent).toContain('0.10s / 0.10s')

    mounted.recordingActive.value = false
    mounted.recording.value = {
      ...mounted.recording.value,
      durationMs: 110,
    }
    await nextTick()

    expect(mounted.host.querySelector<HTMLButtonElement>('[title="tamagotchi.settings.devtools.pages.live2d-motion.editor.undo"]')?.disabled).toBe(true)
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
