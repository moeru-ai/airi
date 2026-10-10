import type { OwnedSurface, VerifiedNativeMapping } from '../src/enrollment-gate'

import { describe, expect, it, vi } from 'vitest'

import { authorizeSurface } from '../src/enrollment-gate'

function fixture() {
  const surface: OwnedSurface = {
    surfaceId: 'main-stage',
    registrationId: 'registry-generation-1',
    alive: true,
    processCandidates: [{ pid: 100, birthId: 'main-process' }, { pid: 101, birthId: 'native-client-process' }],
  }
  const proof: VerifiedNativeMapping = {
    surfaceId: surface.surfaceId,
    registrationId: surface.registrationId,
    backend: 'native-wayland',
    windowId: 'kwin-uuid',
    resourceClass: 'airi',
    process: { pid: 101, birthId: 'native-client-process' },
    kwinPeer: { uniqueOwner: ':1.10', pid: 200, uid: 1000 },
  }
  const registry = { get: vi.fn(() => surface) }
  const verifier = { verify: vi.fn(async () => proof) }
  return { surface, proof, registry, verifier }
}

describe('main-process native enrollment gate', () => {
  it('keeps native capabilities unavailable without an implemented verifier', async () => {
    const f = fixture()
    expect(await authorizeSurface(f.registry, null, 'main-stage', 'session-1')).toEqual({ status: 'unavailable', reason: 'native-window-mapping-unverified' })
    expect(f.registry.get).not.toHaveBeenCalled()
  })

  it('accepts the verified native connection process without assuming it is Electron main', async () => {
    const f = fixture()
    const result = await authorizeSurface(f.registry, f.verifier, 'main-stage', 'session-1')
    expect(result.status).toBe('verified')
    if (result.status === 'verified')
      expect(result.binding.process.pid).toBe(101)
  })

  it('rejects unknown surfaces before native discovery', async () => {
    const f = fixture()
    expect((await authorizeSurface(f.registry, f.verifier, 'other-app', 'session-1')).status).toBe('unavailable')
    expect(f.verifier.verify).not.toHaveBeenCalled()
  })

  it('rejects a replaced registry entry while verification is pending', async () => {
    const f = fixture()
    f.verifier.verify.mockImplementation(async () => {
      f.surface.registrationId = 'replacement'
      return f.proof
    })
    expect(await authorizeSurface(f.registry, f.verifier, 'main-stage', 'session-1')).toEqual({ status: 'unavailable', reason: 'surface-registration-changed' })
  })

  it('rejects a destroyed window', async () => {
    const f = fixture()
    f.verifier.verify.mockImplementation(async () => {
      f.surface.alive = false
      return f.proof
    })
    expect((await authorizeSurface(f.registry, f.verifier, 'main-stage', 'session-1')).status).toBe('unavailable')
  })

  it('rejects reused PIDs and processes outside the registered AIRI process set', async () => {
    const f = fixture()
    f.proof.process.birthId = 'reused-pid'
    expect((await authorizeSurface(f.registry, f.verifier, 'main-stage', 'session-1')).status).toBe('unavailable')
    f.proof.process = { pid: 999, birthId: 'unrelated-process' }
    expect((await authorizeSurface(f.registry, f.verifier, 'main-stage', 'session-1')).status).toBe('unavailable')
  })

  it('rejects failed native verification without throwing across the main boundary', async () => {
    const f = fixture()
    f.verifier.verify.mockRejectedValue(new Error('native verifier unavailable'))
    expect(await authorizeSurface(f.registry, f.verifier, 'main-stage', 'session-1')).toEqual({ status: 'unavailable', reason: 'native-window-mapping-failed' })
  })
})
