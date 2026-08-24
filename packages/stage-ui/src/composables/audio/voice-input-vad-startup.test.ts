import { describe, expect, it, vi } from 'vitest'

import { startVoiceInputVadDetectionSafely } from './voice-input-vad-startup'

describe('voice input VAD startup', () => {
  it('reports readiness after VAD connects to the microphone stream', async () => {
    const log = vi.fn()
    const start = vi.fn().mockResolvedValue(undefined)

    await expect(startVoiceInputVadDetectionSafely({
      init: vi.fn().mockResolvedValue(undefined),
      loaded: () => true,
      start,
      stream: {} as MediaStream,
      log,
    })).resolves.toBe(true)

    expect(start).toHaveBeenCalledOnce()
    expect(log).toHaveBeenLastCalledWith(
      'info',
      'vad-ready',
      'VAD is connected to the microphone stream.',
    )
  })

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
