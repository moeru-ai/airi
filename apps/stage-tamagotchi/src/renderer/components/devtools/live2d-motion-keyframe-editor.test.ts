// @vitest-environment jsdom

import type { Live2DMotionEditorFrame } from '../../composables/live2d-motion-keyframes'
import type { Live2DMotionRecording, ReadonlyLive2DMotionRecording } from '../../composables/live2d-motion-recording'

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
    recording?: ReadonlyLive2DMotionRecording
    recordingActive?: boolean
    onFrame?: (frame: Live2DMotionEditorFrame) => void
    onRecording?: (recording: Live2DMotionRecording) => void
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
        onFrame: options.onFrame,
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

    expect(mounted.host.querySelectorAll('article')).toHaveLength(13)
    expect(mounted.host.querySelectorAll('svg')).toHaveLength(14)
    expect(mounted.host.querySelectorAll('article[data-active="true"]')).toHaveLength(1)
    expect(rulerRow.classList).toContain('grid-cols-[calc(12rem+0.75rem)_minmax(0,1fr)]')
    expect(rulerRow.classList).toContain('pr-3')
    expect(trackList.classList).toContain('p-3')
    expect(mounted.host.textContent).toContain('.tracks.eyeOpen')
    expect(mounted.host.textContent).toContain('.tracks.mouthForm')
    expect(mounted.host.textContent).toContain('.tracks.mouthOpen')
    expect(mounted.host.textContent).toContain('.tracks.viewTargetX')
    expect(mounted.host.textContent).toContain('.tracks.viewTargetY')

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

  it('creates sparse held view-target keyframes and emits them with the pose', async () => {
    const onFrame = vi.fn<(frame: Live2DMotionEditorFrame) => void>()
    const mounted = mountEditor({ onFrame })

    findButton(mounted.host, 'tamagotchi.settings.devtools.pages.live2d-motion.editor.tracks.viewTargetX').click()
    await nextTick()
    findButton(mounted.host, 'tamagotchi.settings.devtools.pages.live2d-motion.editor.controls.create-keyframes').click()
    await nextTick()

    const activeGraph = mounted.host.querySelector<SVGSVGElement>('article[data-active="true"] svg')!
    vi.spyOn(activeGraph, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 300,
      right: 1000,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
    const heldCurve = activeGraph.querySelector<SVGPathElement>('g path')!
    heldCurve.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 400, clientY: 50 }))
    await nextTick()

    expect(activeGraph.querySelectorAll('.motion-overlay-point')).toHaveLength(3)

    activeGraph.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 500, clientY: 150 }))
    await nextTick()

    expect(onFrame.mock.lastCall?.[0].eyeView?.x).toBeGreaterThan(0)
    expect(onFrame.mock.lastCall?.[0].pose).toEqual(neutralLive2DMotionControlPose)
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
    expect(mounted.host.querySelectorAll('article path')).toHaveLength(26)

    mounted.app.unmount()
  })

  it('crops the visible timeline range and keeps the edit in history', async () => {
    const onRecording = vi.fn()
    const mounted = mountEditor({
      onRecording,
      recording: {
        format: 'airi-live2d-motion/v6',
        durationMs: 1000,
        samples: [
          { atMs: 0, ...neutralLive2DMotionControlPose },
          { atMs: 500, ...neutralLive2DMotionControlPose, headX: 0.5 },
          { atMs: 1000, ...neutralLive2DMotionControlPose, headX: 1 },
        ],
      },
    })
    await nextTick()

    const cropButton = findButton(mounted.host, 'tamagotchi.settings.devtools.pages.live2d-motion.editor.crop-to-view')
    expect(cropButton.disabled).toBe(true)

    const ruler = mounted.host.querySelector<SVGSVGElement>('svg[aria-label="tamagotchi.settings.devtools.pages.live2d-motion.editor.timeline-label"]')!
    ruler.dispatchEvent(new WheelEvent('wheel', { bubbles: true, clientX: 500, deltaY: -500 }))
    await nextTick()

    expect(cropButton.disabled).toBe(false)
    cropButton.click()
    await nextTick()

    expect(onRecording.mock.lastCall?.[0].durationMs).toBeLessThan(1000)
    expect(mounted.host.querySelector<HTMLButtonElement>('[title="tamagotchi.settings.devtools.pages.live2d-motion.editor.undo"]')?.disabled).toBe(false)

    mounted.host.querySelector<HTMLButtonElement>('[title="tamagotchi.settings.devtools.pages.live2d-motion.editor.undo"]')?.click()
    await nextTick()
    await nextTick()
    expect(onRecording.mock.lastCall?.[0].durationMs).toBe(1000)

    mounted.app.unmount()
  })
})
