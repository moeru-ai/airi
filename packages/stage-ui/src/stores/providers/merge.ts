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

function replicaTime(value?: string | null): number {
  if (!value)
    return 0

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

/**
 * The newer server write time wins. A missing remote row is not a delete.
 * A newer remote tombstone removes the local row.
 * Equal timestamps keep the local row.
 */
export function mergeProviderSync(local: ProviderSyncSnapshot, remote: ProviderReplicaRow[]): ProviderSyncSnapshot {
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

    if (!remoteRow) {
      if (localLive)
        live[id] = localLive
      else if (hasLocalDelete)
        pendingDeletes[id] = localDeleteAt!
      continue
    }

    if (remoteTime > localTime) {
      if (!remoteRow.deletedAt) {
        live[id] = {
          id: remoteRow.id,
          definitionId: remoteRow.definitionId,
          config: remoteRow.config,
          replicaUpdatedAt: remoteRow.updatedAt,
        }
      }
      continue
    }

    if (localLive)
      live[id] = localLive
    else if (hasLocalDelete)
      pendingDeletes[id] = localDeleteAt!
  }

  return { live, pendingDeletes }
}
