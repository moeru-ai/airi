import { describe, expect, it, vi } from 'vitest'

import { createLive2DMotionsContext } from './motions'

describe('live2D motions context', () => {
  it('executes only registered and enabled motions', async () => {
    const motions = createLive2DMotionsContext(motion => motion.fileName !== 'hidden.motion3.json')
    const play = vi.fn(async () => true)
    motions.register([
      { fileName: 'wave.motion3.json', group: 'Wave', index: 0 },
      { fileName: 'hidden.motion3.json', group: 'Hidden', index: 0 },
    ])
    motions.setExecutor({ play })

    await expect(motions.execute('wave.motion3.json')).resolves.toBe(true)
    await expect(motions.execute('hidden.motion3.json')).resolves.toBe(false)
    expect(play).toHaveBeenCalledOnce()
  })

  it('drops the model executor when the registry is cleared', async () => {
    const motions = createLive2DMotionsContext(() => true)
    const play = vi.fn(async () => true)
    motions.register([{ fileName: 'wave.motion3.json', group: 'Wave', index: 0 }])
    motions.setExecutor({ play })

    motions.clear()

    await expect(motions.execute('wave.motion3.json')).resolves.toBe(false)
    expect(play).not.toHaveBeenCalled()
  })
})
