import { describe, expect, it, vi } from 'vitest'

import { startVoiceInputVadDetectionSafely } from './voice-input-vad-startup'

describe('voice input VAD startup', () => {
  it('returns false and logs when VAD initialization throws', async () => {
    const init = vi.fn().mockRejectedValue(new Error('vad unavailable'))
    const start = vi.fn()
    const log = vi.fn()

    await expect(startVoiceInputVadDetectionSafely({
      init,
      loaded: () => false,
      start,
      stream: {} as MediaStream,
      log,
    })).resolves.toBe(false)

    expect(start).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      'error',
      'vad-init-failed',
      'VAD initialization failed.',
      expect.objectContaining({
        error: expect.any(Error),
      }),
    )
  })
})
