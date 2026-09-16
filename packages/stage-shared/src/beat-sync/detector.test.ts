// @vitest-environment jsdom

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  getBeatSyncInputByteFrequencyData,
  getBeatSyncState,
  inputAnalyserFFTSize,
  isBeatSyncSupported,
  listenBeatSyncBeatSignal,
  listenBeatSyncStateChange,
  toggleBeatSync,
  updateBeatSyncParameters,
} from './detector'

describe('capacitor Beat Sync runtime', () => {
  beforeAll(() => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'capacitor')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('registers and removes inactive listeners without throwing', () => {
    const removeStateListener = listenBeatSyncStateChange(vi.fn())
    const removeBeatListener = listenBeatSyncBeatSignal(vi.fn())

    expect(removeStateListener).toBeTypeOf('function')
    expect(removeBeatListener).toBeTypeOf('function')
    expect(() => removeStateListener()).not.toThrow()
    expect(() => removeBeatListener()).not.toThrow()
  })

  it('returns a deterministic inactive state', async () => {
    expect(isBeatSyncSupported()).toBe(false)
    await expect(getBeatSyncState()).resolves.toEqual({ isActive: false })
  })

  it('allows inactive configuration calls to settle', async () => {
    await expect(toggleBeatSync(false)).resolves.toBeUndefined()
    await expect(updateBeatSyncParameters({})).resolves.toBeUndefined()
  })

  it('rejects attempts to enable unsupported screen capture', async () => {
    await expect(toggleBeatSync(true)).rejects.toThrow('Beat Sync is not available in Stage Pocket')
  })

  it('returns silent frequency data', async () => {
    const data = await getBeatSyncInputByteFrequencyData()

    expect(data).toBeInstanceOf(Uint8Array)
    expect(data).toHaveLength(inputAnalyserFFTSize / 2)
    expect(data.every(value => value === 0)).toBe(true)
  })
})
