import { extend, TresCanvas } from '@tresjs/core'
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three'
import { describe, expect, it } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { createApp, defineComponent, h, shallowRef } from 'vue'

import OrbitControls from '../../../../../packages/stage-ui-three/src/components/Controls/OrbitControls.vue'

import { useThreeCamera } from '../../../../../packages/stage-ui-three/src/stores/camera'

extend({ BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera })

describe('orbit gesture ownership', () => {
  it('keeps rotating while a text selection spans the canvas', async () => {
    // ROOT CAUSE:
    //
    // A retained text selection spans the canvas. Native dragstart cancels the
    // pointer stream after its first move, so OrbitControls loses capture.
    // Cancel only the canvas dragstart while orbit input is enabled.
    const enabled = shallowRef(true)
    const mounted = shallowRef(true)
    let ready = false
    const positions: Array<{ x: number, y: number, z: number }> = []
    const { cameraPosition } = useThreeCamera()
    const previousCameraPosition = cameraPosition.value
    cameraPosition.value = { x: 0, y: 0, z: 3 }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fixture = defineComponent(() => () => h('div', { style: { position: 'relative', width: '600px', height: '400px' } }, [
      h('p', { style: { position: 'absolute', top: '180px', left: '60px', width: '350px' } }, 'Selected reply before the stage. Selected reply after the stage.'),
      h(TresCanvas, { style: { width: '600px', height: '400px', position: 'relative' } }, () => [
        h('TresPerspectiveCamera', { position: [0, 0, 3] }),
        h('TresMesh', {}, [h('TresBoxGeometry'), h('TresMeshBasicMaterial', { color: '#36a' })]),
        mounted.value && h(OrbitControls, {
          controlEnable: enabled.value,
          cameraTarget: { x: 0, y: 0, z: 0 },
          modelSize: { x: 1, y: 1, z: 1 },
          onOrbitControlsReady: () => { ready = true },
          onOrbitControlsCameraChanged: event => positions.push(event.newCameraPosition),
        }),
      ]),
      h('span', 'Selected reply after the stage.'),
    ]))
    const app = createApp(fixture)
    app.mount(container)

    try {
      await expect.poll(() => ready).toBe(true)
      const canvas = container.querySelector('canvas')
      if (!canvas)
        throw new Error('The orbit fixture did not mount its canvas.')
      const selection = document.getSelection()
      const range = document.createRange()
      await expect.poll(() => canvas.getBoundingClientRect().height).toBe(400)
      await userEvent.click(canvas)
      const root = container.firstElementChild
      const lastText = container.querySelector('span')?.firstChild
      if (!root || !(lastText instanceof Text))
        throw new Error('The orbit fixture did not mount its selectable text.')
      // A DIV-to-text range includes the replaced canvas element in the native selection.
      range.setStart(root, 0)
      range.setEnd(lastText, lastText.length)
      selection?.removeAllRanges()
      selection?.addRange(range)
      expect(selection?.type).toBe('Range')

      const events: Array<{ type: string, trusted: boolean }> = []
      const abort = new AbortController()
      for (const type of ['dragstart', 'pointercancel', 'pointerup']) {
        canvas.addEventListener(type, event => events.push({ type, trusted: event.isTrusted }), { signal: abort.signal })
      }
      const bounds = canvas.getBoundingClientRect()
      const frame = window.frameElement?.getBoundingClientRect()
      // CDP uses top-level CSS pixels. Vitest can scale its test iframe to fit the browser window.
      const scale = frame ? frame.width / window.innerWidth : 1
      const x = (bounds.x + 80) * scale + (frame?.x ?? 0)
      const y = (bounds.y + 200) * scale + (frame?.y ?? 0)
      const session = cdp()
      const angles: number[] = []
      await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, x, y })
      try {
        for (const delta of [10, 40, 100, 180, 260]) {
          await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: x + delta * scale, y })
          const position = positions.at(-1)
          angles.push(position ? Math.atan2(position.x, position.z) : 0)
        }
      }
      finally {
        await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', buttons: 0, clickCount: 1, x: x + 260 * scale, y })
        abort.abort()
      }

      expect(events.some(event => event.type === 'dragstart' && event.trusted)).toBe(true)
      expect(events.some(event => event.type === 'pointercancel')).toBe(false)
      expect(events.some(event => event.type === 'pointerup' && event.trusted)).toBe(true)
      expect(angles).toHaveLength(5)
      expect(Math.abs(angles[4] - angles[1])).toBeGreaterThan(1)
      expect(selection?.toString()).toContain('Selected reply')

      const canvasDrag = new DragEvent('dragstart', { bubbles: true, cancelable: true })
      expect(canvas.dispatchEvent(canvasDrag)).toBe(false)
      const outsideDrag = new DragEvent('dragstart', { bubbles: true, cancelable: true })
      expect(container.querySelector('p')?.dispatchEvent(outsideDrag)).toBe(true)
      expect(canvas.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }))).toBe(true)

      enabled.value = false
      await expect.poll(() => canvas.dispatchEvent(new DragEvent('dragstart', { cancelable: true }))).toBe(true)
      enabled.value = true
      await expect.poll(() => canvas.dispatchEvent(new DragEvent('dragstart', { cancelable: true }))).toBe(false)
      mounted.value = false
      await expect.poll(() => canvas.dispatchEvent(new DragEvent('dragstart', { cancelable: true }))).toBe(true)
    }
    finally {
      document.getSelection()?.removeAllRanges()
      app.unmount()
      cameraPosition.value = previousCameraPosition
      container.remove()
    }
  }, 20_000)
})
