import { describe, expect, it, vi } from 'vitest'

import { startVoiceInputVadDetectionSafely } from './voice-input-vad-startup'

describe('voice input VAD startup', () => {
  // https://github.com/moeru-ai/airi/issues/1832
  it('issue #1832 returns false and logs when VAD initialization throws so callers can fall back to volume detection', async () => {
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

  // https://github.com/moeru-ai/airi/issues/1832
  it('issue #1832 returns false when init resolves but the model never marks itself loaded', async () => {
    const init = vi.fn().mockResolvedValue(undefined)
    const start = vi.fn()
    const log = vi.fn()

    await expect(startVoiceInputVadDetectionSafely({
      init,
      loaded: () => false,
      start,
      stream: {} as MediaStream,
      getError: () => 'HuggingFace download timed out',
      log,
    })).resolves.toBe(false)

    expect(start).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith(
      'error',
      'vad-init-failed',
      'VAD initialization failed.',
      expect.objectContaining({
        error: 'HuggingFace download timed out',
      }),
    )
  })
})
