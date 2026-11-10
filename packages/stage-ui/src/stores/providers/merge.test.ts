import type { ProviderReplicaRow } from '../../services/inference-service-providers'
import type { ProviderSyncRow, ProviderSyncSnapshot } from './merge'

import { describe, expect, it } from 'vitest'

import { mergeProviderSync } from './merge'

const ID = 'openai-1'
const OLD = '2026-01-01T00:00:00.000Z'
const NEW = '2026-01-02T00:00:00.000Z'

type Local = 'none' | 'working' | 'broken' | 'delete'
type Remote = 'none' | 'working' | 'broken' | 'tombstone'
type Clock = 'local-newer' | 'equal' | 'remote-newer'
type Winner = 'local' | 'remote' | 'delete' | 'none'

function stamps(clock: Clock) {
  if (clock === 'local-newer')
    return { localAt: NEW, remoteAt: OLD }
  if (clock === 'equal')
    return { localAt: OLD, remoteAt: OLD }
  return { localAt: OLD, remoteAt: NEW }
}

function localSnapshot(kind: Local, at: string): ProviderSyncSnapshot {
  if (kind === 'none')
    return { live: {}, pendingDeletes: {} }
  if (kind === 'delete')
    return { live: {}, pendingDeletes: { [ID]: at } }

  const row = {
    id: ID,
    definitionId: 'openai',
    config: { apiKey: 'sk-local' },
    replicaUpdatedAt: at,
  } satisfies ProviderSyncRow
  return { live: { [ID]: row }, pendingDeletes: {} }
}

function remoteList(kind: Remote, at: string): ProviderReplicaRow[] {
  if (kind === 'none')
    return []

  return [{
    id: ID,
    definitionId: 'openai',
    config: { apiKey: 'sk-remote' },
    updatedAt: at,
    deletedAt: kind === 'tombstone' ? at : null,
  }]
}

const cases: {
  local: Local
  remote: Remote
  clock: Clock
  winner: Winner
}[] = [
  { local: 'working', remote: 'none', clock: 'remote-newer', winner: 'local' },
  { local: 'broken', remote: 'none', clock: 'remote-newer', winner: 'local' },
  { local: 'delete', remote: 'none', clock: 'remote-newer', winner: 'delete' },

  { local: 'none', remote: 'working', clock: 'remote-newer', winner: 'remote' },
  { local: 'working', remote: 'working', clock: 'remote-newer', winner: 'remote' },
  // ROOT CAUSE:
  //
  // replicaUpdatedAt is the last successful upload. A later local persist
  // copy can keep that stamp after the config was stripped. Equal timestamps
  // then kept the empty local row, so a hard refresh showed no key.
  //
  // A successful GET applies the cloud row at the same stamp.
  { local: 'working', remote: 'working', clock: 'equal', winner: 'remote' },
  { local: 'working', remote: 'working', clock: 'local-newer', winner: 'local' },
  { local: 'broken', remote: 'working', clock: 'local-newer', winner: 'remote' },
  { local: 'delete', remote: 'working', clock: 'remote-newer', winner: 'remote' },
  { local: 'delete', remote: 'working', clock: 'equal', winner: 'delete' },
  { local: 'delete', remote: 'working', clock: 'local-newer', winner: 'delete' },

  // ROOT CAUSE:
  //
  // A cloud row this device could not use was skipped. Another computer
  // could not edit it, and a local clear did not bring it back.
  //
  // Copy the remote-only row.
  { local: 'none', remote: 'broken', clock: 'remote-newer', winner: 'remote' },
  { local: 'working', remote: 'broken', clock: 'remote-newer', winner: 'local' },
  { local: 'broken', remote: 'broken', clock: 'remote-newer', winner: 'remote' },
  { local: 'broken', remote: 'broken', clock: 'equal', winner: 'remote' },
  { local: 'broken', remote: 'broken', clock: 'local-newer', winner: 'local' },
  { local: 'delete', remote: 'broken', clock: 'remote-newer', winner: 'delete' },

  { local: 'none', remote: 'tombstone', clock: 'remote-newer', winner: 'none' },
  { local: 'working', remote: 'tombstone', clock: 'remote-newer', winner: 'none' },
  { local: 'working', remote: 'tombstone', clock: 'equal', winner: 'none' },
  { local: 'working', remote: 'tombstone', clock: 'local-newer', winner: 'local' },
  { local: 'broken', remote: 'tombstone', clock: 'remote-newer', winner: 'none' },
  { local: 'broken', remote: 'tombstone', clock: 'equal', winner: 'none' },
  { local: 'broken', remote: 'tombstone', clock: 'local-newer', winner: 'local' },
  { local: 'delete', remote: 'tombstone', clock: 'remote-newer', winner: 'none' },
  { local: 'delete', remote: 'tombstone', clock: 'equal', winner: 'none' },
  { local: 'delete', remote: 'tombstone', clock: 'local-newer', winner: 'delete' },
]

describe('mergeProviderSync', () => {
  it.each(cases)('$local × $remote $clock → $winner', ({ local, remote, clock, winner }) => {
    const { localAt, remoteAt } = stamps(clock)
    const result = mergeProviderSync(
      localSnapshot(local, localAt),
      remoteList(remote, remoteAt),
      {
        local: local === 'working' ? new Set([ID]) : new Set(),
        remote: remote === 'working' ? new Set([ID]) : new Set(),
      },
    )

    if (winner === 'local') {
      expect(result.live[ID]?.config).toEqual({ apiKey: 'sk-local' })
      expect(result.pendingDeletes[ID]).toBeUndefined()
      return
    }

    if (winner === 'remote') {
      expect(result.live[ID]?.config).toEqual({ apiKey: 'sk-remote' })
      expect(result.pendingDeletes[ID]).toBeUndefined()
      return
    }

    if (winner === 'delete') {
      expect(result.live[ID]).toBeUndefined()
      expect(result.pendingDeletes[ID]).toBe(localAt)
      return
    }

    expect(result.live[ID]).toBeUndefined()
    expect(result.pendingDeletes[ID]).toBeUndefined()
  })
})
