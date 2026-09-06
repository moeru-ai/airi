import type { ProviderReplicaRow } from '../../services/inference-service-providers'
import type { ProviderSyncRow } from './merge'

import { describe, expect, it } from 'vitest'

import { mergeProviderSync } from './merge'

const localLive = {
  id: 'openai-1',
  definitionId: 'openai',
  config: { apiKey: 'sk-local' },
  replicaUpdatedAt: '2026-01-01T00:00:00.000Z',
} satisfies ProviderSyncRow

const remoteLive = {
  id: 'openai-1',
  definitionId: 'openai',
  config: { apiKey: 'sk-remote' },
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
} satisfies ProviderReplicaRow

describe('mergeProviderSync', () => {
  it('keeps a local-only row so it can be uploaded', () => {
    const result = mergeProviderSync(
      { live: { [localLive.id]: localLive }, pendingDeletes: {} },
      [],
    )

    expect(result.live[localLive.id]).toEqual(localLive)
    expect(result.pendingDeletes).toEqual({})
  })

  it('inserts a remote-only live row', () => {
    const result = mergeProviderSync(
      { live: {}, pendingDeletes: {} },
      [remoteLive],
    )

    expect(result.live[remoteLive.id]).toEqual({
      id: remoteLive.id,
      definitionId: remoteLive.definitionId,
      config: remoteLive.config,
      replicaUpdatedAt: remoteLive.updatedAt,
    })
  })

  it('lets the newer replica time win', () => {
    const result = mergeProviderSync(
      { live: { [localLive.id]: localLive }, pendingDeletes: {} },
      [remoteLive],
    )

    expect(result.live[localLive.id]?.config).toEqual({ apiKey: 'sk-remote' })
  })

  it('applies remote when timestamps are equal', () => {
    // ROOT CAUSE:
    //
    // replicaUpdatedAt is the last successful upload. A later local persist
    // copy can keep that stamp after the config was stripped. Equal timestamps
    // then kept the empty local row, so a hard refresh showed no key.
    //
    // A successful GET applies the cloud row at the same stamp.
    const result = mergeProviderSync(
      { live: { [localLive.id]: localLive }, pendingDeletes: {} },
      [{ ...remoteLive, updatedAt: localLive.replicaUpdatedAt! }],
    )

    expect(result.live[localLive.id]?.config).toEqual({ apiKey: 'sk-remote' })
  })

  it('keeps a local live row uploaded after the remote stamp', () => {
    const result = mergeProviderSync(
      {
        live: {
          [localLive.id]: {
            ...localLive,
            replicaUpdatedAt: '2026-01-03T00:00:00.000Z',
          },
        },
        pendingDeletes: {},
      },
      [remoteLive],
    )

    expect(result.live[localLive.id]?.config).toEqual({ apiKey: 'sk-local' })
  })

  it('applies a newer remote tombstone as a local delete', () => {
    const result = mergeProviderSync(
      { live: { [localLive.id]: localLive }, pendingDeletes: {} },
      [{ ...remoteLive, deletedAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' }],
    )

    expect(result.live[localLive.id]).toBeUndefined()
    expect(result.pendingDeletes[localLive.id]).toBeUndefined()
  })

  it('keeps a pending delete that has no remote row', () => {
    const result = mergeProviderSync(
      {
        live: { [localLive.id]: localLive },
        pendingDeletes: { gone: '2026-01-01T00:00:00.000Z' },
      },
      [remoteLive],
    )

    expect(result.pendingDeletes.gone).toBe('2026-01-01T00:00:00.000Z')
  })

  it('keeps a newer local pending delete against an older remote live row', () => {
    const result = mergeProviderSync(
      {
        live: {},
        pendingDeletes: { [localLive.id]: '2026-01-03T00:00:00.000Z' },
      },
      [remoteLive],
    )

    expect(result.live[localLive.id]).toBeUndefined()
    expect(result.pendingDeletes[localLive.id]).toBe('2026-01-03T00:00:00.000Z')
  })

  it('keeps a pending delete when timestamps are equal', () => {
    const result = mergeProviderSync(
      {
        live: {},
        pendingDeletes: { [localLive.id]: localLive.replicaUpdatedAt! },
      },
      [{ ...remoteLive, updatedAt: localLive.replicaUpdatedAt! }],
    )

    expect(result.live[localLive.id]).toBeUndefined()
    expect(result.pendingDeletes[localLive.id]).toBe(localLive.replicaUpdatedAt)
  })

  it('applies a strictly newer remote live row over a pending delete', () => {
    const result = mergeProviderSync(
      {
        live: {},
        pendingDeletes: { [localLive.id]: '2026-01-01T00:00:00.000Z' },
      },
      [remoteLive],
    )

    expect(result.live[localLive.id]?.config).toEqual({ apiKey: 'sk-remote' })
    expect(result.pendingDeletes[localLive.id]).toBeUndefined()
  })
})
