import type { Locator, Page } from 'playwright'

/** Input source used to reproduce a swipe in an Electron scenario. */
export type SwipeGestureInput = 'touch' | 'wheel'

/** Physical direction in which the user moves their fingers. */
export type SwipeGestureDirection = 'down' | 'left' | 'right' | 'up'

/** Configuration for one element-centered swipe gesture. */
export interface SwipeGestureOptions {
  /** Selects CDP touch input or two-finger wheel movement. */
  input: SwipeGestureInput
  /** Selects the physical direction of finger travel. */
  direction: SwipeGestureDirection
  /** Sets the total raw travel in pixels. @default 64 */
  distance?: number
  /** Sets the number of input samples. @default 8 */
  steps?: number
}

const gestureFrameIntervalMs = 16
const gestureSettleTimeMs = 350

/**
 * Performs one swipe through the input path used by the AIRI gesture modules.
 *
 * Touch input uses Chromium CDP so the browser produces trusted Pointer Events.
 * Wheel input uses Playwright's native mouse wheel path.
 */
export async function swipe(target: Locator, options: SwipeGestureOptions): Promise<void> {
  const box = await target.boundingBox()
  if (!box)
    throw new Error('Cannot swipe an element without a visible bounding box.')

  const distance = options.distance ?? 64
  if (distance <= 0)
    throw new Error('Swipe distance must be greater than zero.')

  const steps = Math.trunc(options.steps ?? 8)
  if (steps <= 0)
    throw new Error('Swipe steps must be greater than zero.')

  const page = target.page()
  const start = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }
  const pointerVector = pointerDirectionVector(options.direction)

  if (options.input === 'touch') {
    await dispatchTouchSwipe(page, start, pointerVector, distance, steps)
    await page.waitForTimeout(gestureSettleTimeMs)
    return
  }

  const wheelVector = wheelDirectionVector(options.direction)
  await page.mouse.move(start.x, start.y)
  for (let step = 0; step < steps; step += 1) {
    await page.mouse.wheel(
      wheelVector.x * distance / steps,
      wheelVector.y * distance / steps,
    )
    await page.waitForTimeout(gestureFrameIntervalMs)
  }
  await page.waitForTimeout(gestureSettleTimeMs)
}

async function dispatchTouchSwipe(
  page: Page,
  start: { x: number, y: number },
  pointerVector: { x: number, y: number },
  distance: number,
  steps: number,
) {
  const cdpSession = await page.context().newCDPSession(page)
  let touchActive = false

  try {
    await cdpSession.send('Input.dispatchTouchEvent', {
      touchPoints: [{ id: 1, x: start.x, y: start.y }],
      type: 'touchStart',
    })
    touchActive = true

    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps
      await cdpSession.send('Input.dispatchTouchEvent', {
        touchPoints: [{
          id: 1,
          x: start.x + pointerVector.x * distance * progress,
          y: start.y + pointerVector.y * distance * progress,
        }],
        type: 'touchMove',
      })
      await page.waitForTimeout(gestureFrameIntervalMs)
    }

    await cdpSession.send('Input.dispatchTouchEvent', {
      touchPoints: [],
      type: 'touchEnd',
    })
    touchActive = false
  }
  finally {
    try {
      if (touchActive) {
        await cdpSession.send('Input.dispatchTouchEvent', {
          touchPoints: [],
          type: 'touchCancel',
        })
      }
    }
    finally {
      await cdpSession.detach()
    }
  }
}

function pointerDirectionVector(direction: SwipeGestureDirection) {
  switch (direction) {
    case 'left':
      return { x: -1, y: 0 }
    case 'right':
      return { x: 1, y: 0 }
    case 'up':
      return { x: 0, y: -1 }
    case 'down':
      return { x: 0, y: 1 }
  }
}

function wheelDirectionVector(direction: SwipeGestureDirection) {
  switch (direction) {
    // Browser wheel deltas describe content travel, opposite to finger travel.
    case 'left':
      return { x: 1, y: 0 }
    case 'right':
      return { x: -1, y: 0 }
    case 'up':
      return { x: 0, y: 1 }
    case 'down':
      return { x: 0, y: -1 }
  }
}
