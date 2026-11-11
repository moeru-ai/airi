import { describe, expect, it } from 'vitest'

import { pickVideo } from './pick-video'

function video(name: string, width: number, height: number, paused: boolean) {
  return { name, paused, getBoundingClientRect: () => ({ width, height }) as DOMRect }
}

describe('pickVideo', () => {
  it('picks the playing Short over the paused mini player', () => {
    const miniPlayer = video('mini player', 400, 225, true)
    const short = video('short', 315, 560, false)
    const nextShort = video('next short', 0, 0, true)

    expect(pickVideo([miniPlayer, short, nextShort])).toBe(short)
  })

  it('picks the largest video when no video plays', () => {
    const miniPlayer = video('mini player', 400, 225, true)
    const short = video('short', 315, 560, true)

    expect(pickVideo([miniPlayer, short])).toBe(short)
  })

  it('picks a playing small video over a paused large video', () => {
    const large = video('large', 1280, 720, true)
    const small = video('small', 400, 225, false)

    expect(pickVideo([large, small])).toBe(small)
  })

  it('never picks a hidden video', () => {
    expect(pickVideo([video('hidden', 0, 0, false)])).toBeUndefined()
  })

  it('picks the only video of a normal watch page', () => {
    const player = video('player', 1280, 720, false)

    expect(pickVideo([player])).toBe(player)
  })
})
