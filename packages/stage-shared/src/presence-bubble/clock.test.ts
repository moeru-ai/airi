import { describe, expect, it } from 'vitest'

import { createPresenceFrameClock } from './clock'

describe('presence frame clock', () => {
  it('reports nothing on the first frame', () => {
    expect(createPresenceFrameClock(() => 1000).since()).toBe(0)
  })

  it('hands one stretch of time to one caller', () => {
    // ROOT CAUSE:
    //
    // The ticker asked Pixi for its interval while a resize measured from the
    // last draw:
    //
    //   onTick: drawFrame(app.ticker.deltaMS)
    //   onResize: drawFrame(performance.now() - lastDrawnAt)
    //
    // Both then counted the stretch before the resize.
    let at = 0
    const clock = createPresenceFrameClock(() => at)
    clock.since()

    at = 16
    const resize = clock.since()
    at = 20
    const tick = clock.since()

    expect(resize + tick).toBe(20)
  })

  it('measures from the previous call whoever made it', () => {
    let at = 100
    const clock = createPresenceFrameClock(() => at)
    clock.since()

    at = 133
    expect(clock.since()).toBe(33)
  })
})
