import type { ProviderReplicaRow } from '../../services/inference-service-providers'

export interface ProviderSyncRow {
  id: string
  definitionId: string
  config: Record<string, unknown>
  replicaUpdatedAt?: string
}

export interface ProviderSyncSnapshot {
  live: Record<string, ProviderSyncRow>
  pendingDeletes: Record<string, string | null>
}

/**
 * Ids that work on this device. Omit a side to treat every live row on that side as working.
 */
export interface ProviderMergeWorkingIds {
  local?: ReadonlySet<string>
  remote?: ReadonlySet<string>
}

function replicaTime(value?: string | null): number {
  if (!value)
    return 0

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function copyRemoteLive(remoteRow: ProviderReplicaRow): ProviderSyncRow {
  return {
    id: remoteRow.id,
    definitionId: remoteRow.definitionId,
    // Clone so later local writes do not mutate the GET payload.
    config: { ...remoteRow.config },
    replicaUpdatedAt: remoteRow.updatedAt,
  }
}

/**
 * replicaUpdatedAt is the last successful upload, not a local edit clock.
 * Equal timestamps keep the cloud row. A working config on this device beats that clock.
 * A remote-only row is copied even when this device cannot use it.
 * A missing local row is not a delete. pendingDeletes is the only delete signal.
 */
export function mergeProviderSync(
  local: ProviderSyncSnapshot,
  remote: ProviderReplicaRow[],
  workingIds: ProviderMergeWorkingIds = {},
): ProviderSyncSnapshot {
  const remoteById = new Map(remote.map(row => [row.id, row]))
  const ids = new Set([
    ...Object.keys(local.live),
    ...Object.keys(local.pendingDeletes),
    ...remoteById.keys(),
  ])

  const live: Record<string, ProviderSyncRow> = {}
  const pendingDeletes: Record<string, string | null> = {}

  for (const id of ids) {
    const localLive = local.live[id]
    const hasLocalDelete = Object.hasOwn(local.pendingDeletes, id)
    const localDeleteAt = local.pendingDeletes[id]
    const remoteRow = remoteById.get(id)
    const localTime = replicaTime(localLive?.replicaUpdatedAt ?? localDeleteAt)
    const remoteTime = replicaTime(remoteRow?.updatedAt)
    const localWorks = !!localLive && (!workingIds.local || workingIds.local.has(id))
    const remoteWorks = !!remoteRow && !remoteRow.deletedAt && (!workingIds.remote || workingIds.remote.has(id))

    if (!remoteRow) {
      if (localLive)
        live[id] = localLive
      else if (hasLocalDelete)
        pendingDeletes[id] = localDeleteAt!
      continue
    }

    if (hasLocalDelete) {
      const remoteIsNewerLive = !remoteRow.deletedAt && remoteTime > localTime
      const remoteTombstoneWins = !!remoteRow.deletedAt && remoteTime >= localTime
      if (remoteIsNewerLive && remoteWorks)
        live[id] = copyRemoteLive(remoteRow)
      else if (!remoteTombstoneWins)
        pendingDeletes[id] = localDeleteAt!
      continue
    }

    if (!remoteRow.deletedAt && localWorks !== remoteWorks) {
      if (localWorks && localLive)
        live[id] = localLive
      else
        live[id] = copyRemoteLive(remoteRow)
      continue
    }

    if (remoteTime >= localTime) {
      if (!remoteRow.deletedAt)
        live[id] = copyRemoteLive(remoteRow)
      continue
    }

    if (localLive)
      live[id] = localLive
  }

  return { live, pendingDeletes }
}
