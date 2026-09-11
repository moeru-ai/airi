import type { BrowserContext, CDPSession, Locator, Page } from 'playwright'

import { chromium } from 'playwright'
import { describe, expect, it, vi } from 'vitest'

import { swipe } from './gestures'

function createGestureTarget() {
  const send = vi.fn().mockResolvedValue({})
  const detach = vi.fn().mockResolvedValue(undefined)
  const cdpSession = {
    detach,
    send,
  } as unknown as CDPSession
  const newCDPSession = vi.fn().mockResolvedValue(cdpSession)
  const context = {
    newCDPSession,
  } as unknown as BrowserContext
  const mouse = {
    move: vi.fn().mockResolvedValue(undefined),
    wheel: vi.fn().mockResolvedValue(undefined),
  }
  const page = {
    context: () => context,
    mouse,
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page
  const target = {
    boundingBox: vi.fn().mockResolvedValue({ x: 20, y: 40, width: 200, height: 80 }),
    page: () => page,
  } as unknown as Locator

  return { detach, mouse, newCDPSession, page, send, target }
}

describe('swipe', () => {
  // https://github.com/moeru-ai/airi/pull/2489#discussion_r3967436796
  // ROOT CAUSE:
  //
  // Locator.dispatchEvent creates untrusted Pointer Events. Swipeable ignores
  // those moves for pointer capture, so the scenario skipped native retargeting.
  //
  // The helper now sends a trusted touch stream through Chromium CDP.
  it('sends a trusted touch sequence through Chromium CDP', async () => {
    const { detach, newCDPSession, page, send, target } = createGestureTarget()

    await swipe(target, {
      direction: 'left',
      distance: 64,
      input: 'touch',
      steps: 2,
    })

    expect(newCDPSession).toHaveBeenCalledWith(page)
    expect(send).toHaveBeenNthCalledWith(1, 'Input.dispatchTouchEvent', {
      touchPoints: [{ id: 1, x: 120, y: 80 }],
      type: 'touchStart',
    })
    expect(send).toHaveBeenNthCalledWith(2, 'Input.dispatchTouchEvent', {
      touchPoints: [{ id: 1, x: 88, y: 80 }],
      type: 'touchMove',
    })
    expect(send).toHaveBeenNthCalledWith(3, 'Input.dispatchTouchEvent', {
      touchPoints: [{ id: 1, x: 56, y: 80 }],
      type: 'touchMove',
    })
    expect(send).toHaveBeenNthCalledWith(4, 'Input.dispatchTouchEvent', {
      touchPoints: [],
      type: 'touchEnd',
    })
    expect(detach).toHaveBeenCalledOnce()
  })

  it('cancels an active touch before detaching after an input failure', async () => {
    const { detach, send, target } = createGestureTarget()
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('Touch move failed.'))
      .mockResolvedValueOnce({})

    await expect(swipe(target, {
      direction: 'left',
      input: 'touch',
      steps: 2,
    })).rejects.toThrow('Touch move failed.')

    expect(send).toHaveBeenLastCalledWith('Input.dispatchTouchEvent', {
      touchPoints: [],
      type: 'touchCancel',
    })
    expect(detach).toHaveBeenCalledOnce()
  })

  it('produces trusted pointer capture and native cancellation in Chromium', async () => {
    const browser = await chromium.launch({ headless: true })

    try {
      const page = await browser.newPage()
      await page.setContent(`
        <button id="target" style="position: absolute; left: 250px; top: 20px; width: 100px; height: 80px; touch-action: pan-y">
          Target
        </button>
      `)
      await page.evaluate(() => {
        const target = document.querySelector('#target')
        if (!(target instanceof HTMLElement))
          throw new Error('Expected a gesture target.')

        const events: Array<{ captured: boolean, targetId: string, trusted: boolean, type: string }> = []
        Reflect.set(globalThis, 'observedPointerEvents', events)
        let captureRequested = false

        for (const type of ['gotpointercapture', 'pointercancel', 'pointerdown', 'pointermove', 'pointerup']) {
          target.addEventListener(type, (rawEvent) => {
            const event = rawEvent as PointerEvent
            if (event.type === 'pointermove' && event.isTrusted && !captureRequested) {
              captureRequested = true
              target.setPointerCapture(event.pointerId)
            }
            events.push({
              captured: target.hasPointerCapture(event.pointerId),
              targetId: event.target instanceof HTMLElement ? event.target.id : '',
              trusted: event.isTrusted,
              type: event.type,
            })
          })
        }
      })

      await swipe(page.locator('#target'), {
        direction: 'left',
        distance: 200,
        input: 'touch',
        steps: 2,
      })

      const capturedEvents = await page.evaluate(() => Reflect.get(globalThis, 'observedPointerEvents')) as Array<{
        captured: boolean
        targetId: string
        trusted: boolean
        type: string
      }>
      expect(capturedEvents.map(event => event.type)).toEqual([
        'pointerdown',
        'gotpointercapture',
        'pointermove',
        'pointermove',
        'pointerup',
      ])
      expect(capturedEvents.every(event => event.trusted)).toBe(true)
      expect(capturedEvents
        .filter(event => event.type === 'pointermove' || event.type === 'pointerup')
        .every(event => event.captured && event.targetId === 'target'))
        .toBe(true)

      await page.setContent(`
        <div style="width: 2000px">
          <button id="target" style="width: 100px; height: 80px; touch-action: auto">Target</button>
        </div>
      `)
      await page.evaluate(() => {
        const target = document.querySelector('#target')
        if (!(target instanceof HTMLElement))
          throw new Error('Expected a gesture target.')

        const events: Array<{ trusted: boolean, type: string }> = []
        Reflect.set(globalThis, 'observedPointerEvents', events)
        target.addEventListener('pointercancel', (event) => {
          events.push({ trusted: event.isTrusted, type: event.type })
        })
      })

      await swipe(page.locator('#target'), {
        direction: 'left',
        distance: 64,
        input: 'touch',
        steps: 2,
      })

      expect(await page.evaluate(() => Reflect.get(globalThis, 'observedPointerEvents'))).toEqual([
        { trusted: true, type: 'pointercancel' },
      ])
    }
    finally {
      await browser.close()
    }
  })

  it('sends a left two-finger pan as positive horizontal wheel movement', async () => {
    const { mouse, page, target } = createGestureTarget()

    await swipe(target, {
      direction: 'left',
      distance: 64,
      input: 'wheel',
      steps: 4,
    })

    expect(mouse.move).toHaveBeenCalledWith(120, 80)
    expect(mouse.wheel).toHaveBeenCalledTimes(4)
    for (const call of mouse.wheel.mock.calls)
      expect(call).toEqual([16, 0])
    expect(page.waitForTimeout).toHaveBeenCalledWith(16)
  })

  it('rejects a gesture when the target is not visible', async () => {
    const { target } = createGestureTarget()
    vi.mocked(target.boundingBox).mockResolvedValue(null)

    await expect(swipe(target, {
      direction: 'left',
      input: 'touch',
    })).rejects.toThrow('Cannot swipe an element without a visible bounding box.')
  })
})
