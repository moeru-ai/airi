import type { StandardGamepadButtonName, StandardGamepadButtonState, StandardGamepadSnapshot } from '@proj-airi/input-gamepad'

import type { Live2DMotionEditableTrackId, Live2DMotionEditorFrame } from '../composables/keyframes'
import type { Live2DMotionRecording, ReadonlyLive2DMotionRecording } from '../composables/recording'

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'
import { timeToX, valueToY } from '@proj-airi/timeline-canvas'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import KeyframeEditor from './keyframe-editor.vue'

import { getLive2DMotionTrackRange, live2dMotionEditableTrackIds } from '../composables/keyframes'
import { fullMotionView, layoutMotionTracks, motionGraphGeometry } from '../composables/timeline-geometry'

import '@proj-airi/ui/main.css'
import 'virtual:uno.css'

const editorKey = 'tamagotchi.settings.devtools.pages.live2d-motion.editor'
/** The default width of the label column of the motion timeline. */
const LABEL_WIDTH = 208

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
  })
}

describe('keyframe editor', () => {
  afterEach(() => cleanup())

  async function mountEditor(options: {
    recording?: ReadonlyLive2DMotionRecording
    recordingActive?: boolean
    onFrame?: (frame: Live2DMotionEditorFrame) => void
    onRecording?: (recording: Live2DMotionRecording) => void
    onRestartRecording?: () => void
    onToggleRecording?: () => void
  } = {}) {
    await page.viewport(1280, 1000)
    const recording = shallowRef(options.recording)
    const recordingActive = shallowRef(options.recordingActive ?? false)
    const gamepad = shallowRef<StandardGamepadSnapshot>()
    const Harness = defineComponent({
      render: () => h(KeyframeEditor, {
        recording: recording.value,
        recordingActive: recordingActive.value,
        gamepad: gamepad.value,
        onFrame: options.onFrame,
        onRecording: options.onRecording,
        onRestartRecording: options.onRestartRecording,
        onToggleRecording: options.onToggleRecording,
      }),
    })
    const screen = await render(Harness, {
      attrs: { style: 'width: 1200px' },
      global: { plugins: [createTestI18n()] },
    })
    // The timeline fits the motion in the view in its first frames, once it knows its width.
    await nextFrames()
    return { screen, gamepad, recording, recordingActive }
  }

  function findButton(text: string) {
    return Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === text)!
  }

  function undoButton() {
    return document.querySelector<HTMLButtonElement>(`[title="${editorKey}.undo"]`)!
  }

  function trackButtons() {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'))
  }

  function keyframeCount() {
    return page.getByRole('button', { name: `${editorKey}.keyframe-item`, exact: true }).elements().length
  }

  /**
   * The client position of a time and a value on the graph of the active track. The timeline shows the whole motion
   * right of the label column, and the lanes are not scrolled.
   */
  function graphPoint(activeTrack: Live2DMotionEditableTrackId, durationMs: number, atMs: number, value: number) {
    const rect = document.querySelector('canvas')!.getBoundingClientRect()
    const row = layoutMotionTracks(live2dMotionEditableTrackIds, activeTrack).rows.find(item => item.trackId === activeTrack)!
    const view = { ...fullMotionView(durationMs, rect.width, LABEL_WIDTH), width: rect.width }
    return {
      clientX: rect.left + timeToX(view, atMs),
      clientY: rect.top + valueToY(getLive2DMotionTrackRange(activeTrack), motionGraphGeometry(row, 0), value),
    }
  }

  function doubleClick(point: { clientX: number, clientY: number }) {
    document.querySelector('canvas')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, ...point }))
  }

  function click(point: { clientX: number, clientY: number }) {
    const canvas = document.querySelector('canvas')!
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, ...point }))
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1, ...point }))
  }

  it('shows all tracks on one shared timeline and expands the active track', async () => {
    await mountEditor()

    expect(trackButtons()).toHaveLength(13)
    expect(trackButtons().filter(button => button.getAttribute('aria-expanded') === 'true')).toHaveLength(1)
    expect(document.querySelectorAll('canvas')).toHaveLength(1)
    await expect.element(page.getByRole('slider', { name: `${editorKey}.playhead` })).toBeInTheDocument()
    expect(document.body.textContent).toContain('.tracks.eyeOpen')
    expect(document.body.textContent).toContain('.tracks.mouthForm')
    expect(document.body.textContent).toContain('.tracks.mouthOpen')
    expect(document.body.textContent).toContain('.tracks.viewTargetX')
    expect(document.body.textContent).toContain('.tracks.viewTargetY')
  })

  it('owns recording and streams captured samples into the source timeline', async () => {
    const onToggleRecording = vi.fn()
    const mounted = await mountEditor({
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

    expect(document.body.textContent).toContain('0.03s / 0.03s')
    findButton('tamagotchi.settings.devtools.pages.live2d-motion.recording.actions.stop-recording').click()
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

    expect(document.body.textContent).toContain('0.10s / 0.10s')

    mounted.recordingActive.value = false
    mounted.recording.value = {
      ...mounted.recording.value,
      durationMs: 110,
    }
    await nextTick()

    expect(undoButton().disabled).toBe(true)
  })

  it('adds a sparse overlay, edits its points, and emits a baked recording', async () => {
    const onRecording = vi.fn()
    await mountEditor({ onRecording })

    findButton(`${editorKey}.controls.add`).click()
    await nextTick()
    expect(keyframeCount()).toBe(2)

    // The new overlay spans 0 to 1333 ms of the 4000 ms motion on the head X track.
    const point = graphPoint('headX', 4000, 600, 0.5)
    doubleClick(point)
    await nextTick()
    expect(keyframeCount()).toBe(3)

    doubleClick(point)
    await nextTick()
    expect(keyframeCount()).toBe(2)
    expect(onRecording).toHaveBeenCalled()
    expect(onRecording.mock.lastCall?.[0]).toMatchObject({ format: 'airi-live2d-motion/v6', durationMs: 4000 })
  })

  it('drags a keyframe and commits the drag once', async () => {
    const onRecording = vi.fn()
    await mountEditor({ onRecording })

    findButton(`${editorKey}.controls.add`).click()
    await nextTick()
    const calls = onRecording.mock.calls.length
    // The new overlay starts with a key at 0 ms and value 0.
    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    const from = graphPoint('headX', 4000, 0, 0)
    const to = graphPoint('headX', 4000, 0, 0.5)
    await userEvent.dragAndDrop(page.elementLocator(canvas), page.elementLocator(canvas), {
      sourcePosition: { x: from.clientX - rect.left, y: from.clientY - rect.top },
      targetPosition: { x: to.clientX - rect.left, y: to.clientY - rect.top },
    })
    await nextTick()

    expect(onRecording.mock.calls.length).toBe(calls + 1)
    expect(onRecording.mock.lastCall?.[0].samples[0].headX).toBeCloseTo(0.5, 1)
  })

  it('ignores a double click outside the span of the selected overlay', async () => {
    await mountEditor()

    findButton(`${editorKey}.controls.add`).click()
    await nextTick()
    doubleClick(graphPoint('headX', 4000, 3000, 0.5))
    await nextTick()

    expect(keyframeCount()).toBe(2)
  })

  it('creates sparse held view-target keyframes and emits them with the pose', async () => {
    const onFrame = vi.fn<(frame: Live2DMotionEditorFrame) => void>()
    await mountEditor({ onFrame })

    findButton(`${editorKey}.tracks.viewTargetX`).click()
    await nextTick()
    findButton(`${editorKey}.controls.create-keyframes`).click()
    await nextTick()

    doubleClick(graphPoint('viewTargetX', 4000, 1600, 0.6))
    await nextTick()
    expect(keyframeCount()).toBe(3)

    // A click on the graph away from the curves moves the playhead past the new key, which holds its value.
    click(graphPoint('viewTargetX', 4000, 2000, -0.8))
    await nextTick()

    expect(onFrame.mock.lastCall?.[0].eyeView?.x).toBeCloseTo(0.6, 1)
    expect(onFrame.mock.lastCall?.[0].pose).toEqual(neutralLive2DMotionControlPose)
  })

  it('keeps a loaded dense recording locked beneath overlays', async () => {
    await mountEditor({
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

    expect(keyframeCount()).toBe(0)
    expect(document.body.textContent).toContain('0.00s / 2.00s')
  })

  it('crops the visible timeline range and keeps the edit in history', async () => {
    const onRecording = vi.fn()
    await mountEditor({
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

    const cropButton = findButton(`${editorKey}.crop-to-view`)
    expect(cropButton.disabled).toBe(true)

    const canvas = document.querySelector('canvas')!
    const rect = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: rect.left + rect.width * 0.6, deltaY: -500 }))

    await expect.poll(() => cropButton.disabled).toBe(false)
    cropButton.click()
    await nextTick()

    expect(onRecording.mock.lastCall?.[0].durationMs).toBeLessThan(1000)
    expect(undoButton().disabled).toBe(false)

    undoButton().click()
    await nextTick()
    await nextTick()
    expect(onRecording.mock.lastCall?.[0].durationMs).toBe(1000)
  })

  it('connects controller track, recording, and clear actions to the editor', async () => {
    const onRestartRecording = vi.fn()
    const mounted = await mountEditor({ onRestartRecording })

    mounted.gamepad.value = createGamepadSnapshot({ rightShoulder: 1, dpadDown: 1 })
    await nextTick()
    expect(trackButtons().find(button => button.getAttribute('aria-expanded') === 'true')?.textContent).toContain('.tracks.headY')

    mounted.gamepad.value = createGamepadSnapshot()
    await nextTick()
    mounted.gamepad.value = createGamepadSnapshot({ leftShoulder: 1, dpadUp: 1 })
    await nextTick()
    expect(onRestartRecording).toHaveBeenCalledOnce()

    findButton(`${editorKey}.controls.add`).click()
    await nextTick()
    expect(keyframeCount()).toBe(2)

    mounted.gamepad.value = createGamepadSnapshot()
    await nextTick()
    mounted.gamepad.value = createGamepadSnapshot({ leftShoulder: 1, dpadDown: 1 })
    await nextTick()
    expect(keyframeCount()).toBe(0)
  })
})

/** Waits for a few animation frames, so the frame loops of the timeline run. */
async function nextFrames(count = 3) {
  for (let index = 0; index < count; index++)
    await new Promise(resolve => requestAnimationFrame(resolve))
}

const standardButtonNames: readonly StandardGamepadButtonName[] = [
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'dpadUp',
  'faceBottom',
  'faceLeft',
  'faceRight',
  'faceTop',
  'leftShoulder',
  'leftStick',
  'leftTrigger',
  'rightShoulder',
  'rightStick',
  'rightTrigger',
  'select',
  'start',
]

function createGamepadSnapshot(pressed: Partial<Record<StandardGamepadButtonName, number>> = {}): StandardGamepadSnapshot {
  const buttons = Object.fromEntries(standardButtonNames.map((name): [StandardGamepadButtonName, StandardGamepadButtonState] => {
    const value = pressed[name] ?? 0
    return [name, { pressed: value > 0, touched: value > 0, value }]
  })) as Record<StandardGamepadButtonName, StandardGamepadButtonState>

  return {
    buttons,
    family: 'playstation',
    id: 'DualSense Wireless Controller',
    index: 0,
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    timestamp: 0,
  }
}
