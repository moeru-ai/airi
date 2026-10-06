import type { PushField, PushResult, RemoteDocument, RemoteSnapshot } from './client'

import { isEqual } from 'es-toolkit'

/**
 * The independent parts of one document, by key.
 *
 * The owner of a collection selects the parts. Devices synchronize each part
 * separately, so changes to different parts of one document do not conflict.
 */
export type DocumentFields = Record<string, unknown>

interface SyncedField {
  revision: number
  value: unknown
}

interface SyncedDocument {
  /** The document revision of the last remote snapshot that this device merged. */
  revision: number
  fields: Record<string, SyncedField>
}

/**
 * The content that this device and the server last agreed on.
 *
 * A local part that differs from this state has a local change. A remote part
 * whose revision differs from this state has a remote change.
 */
export interface SyncState {
  documents: Record<string, SyncedDocument>
}

export interface ReconcileInput {
  local: Record<string, DocumentFields>
  state: SyncState
  remote: RemoteSnapshot
}

/** The local content that lost a conflict, and the document that it came from. */
export interface ConflictCopy {
  documentId: string
  fields: DocumentFields
}

export interface DocumentPush {
  documentId: string
  fields: PushField[]
}

/** The changes that bring this device and the server to the same content. */
export interface ReconcilePlan {
  /** The complete new content of each local document that takes remote changes. */
  upserts: Record<string, DocumentFields>
  removals: string[]
  /**
   * Local documents whose changes lost against a remote change to the same part.
   * The caller keeps each one as a new document, so no change is lost.
   */
  conflictCopies: ConflictCopy[]
  pushes: DocumentPush[]
  deletions: Array<{ documentId: string, revision: number }>
  /** The sync state after the caller applies the local changes. Pushes and deletions update it later. */
  state: SyncState
}

function toSyncedDocument(remote: RemoteDocument): SyncedDocument {
  return {
    revision: remote.revision,
    fields: Object.fromEntries(remote.fields.map(field => [field.key, { revision: field.revision, value: field.value }])),
  }
}

function valuesOf(document: SyncedDocument): DocumentFields {
  return Object.fromEntries(Object.entries(document.fields).map(([key, field]) => [key, field.value]))
}

function pushAll(documentId: string, local: DocumentFields): DocumentPush {
  return { documentId, fields: Object.entries(local).map(([key, value]) => ({ key, baseRevision: 0, value })) }
}

function reconcileParts(local: DocumentFields, synced: SyncedDocument | undefined, remote: RemoteDocument) {
  const remoteFields = new Map(remote.fields.map(field => [field.key, field]))
  const merged: DocumentFields = { ...local }
  const nextSynced: SyncedDocument = { revision: remote.revision, fields: {} }
  const pushed: PushField[] = []
  let conflicted = false

  const keys = new Set([...Object.keys(local), ...Object.keys(synced?.fields ?? {}), ...remoteFields.keys()])
  for (const key of keys) {
    const localValue = local[key]
    const syncedField = synced?.fields[key]
    const remoteField = remoteFields.get(key)

    const adoptRemote = () => {
      if (!remoteField) {
        delete merged[key]
        return
      }
      merged[key] = remoteField.value
      nextSynced.fields[key] = { revision: remoteField.revision, value: remoteField.value }
    }
    // The sync state of a pushed part stays at its old revision. The push
    // result updates it, so a failed push is sent again on the next run.
    const pushLocal = (baseRevision: number) => {
      pushed.push(localValue === undefined ? { key, baseRevision, removed: true } : { key, baseRevision, value: localValue })
      if (syncedField)
        nextSynced.fields[key] = syncedField
    }

    if (isEqual(localValue, remoteField?.value)) {
      if (remoteField)
        nextSynced.fields[key] = { revision: remoteField.revision, value: remoteField.value }
      continue
    }

    const hasLocalChange = syncedField ? !isEqual(localValue, syncedField.value) : localValue !== undefined
    const hasRemoteChange = (remoteField?.revision ?? 0) !== (syncedField?.revision ?? 0)

    if (!hasLocalChange) {
      adoptRemote()
    }
    else if (!hasRemoteChange) {
      pushLocal(syncedField?.revision ?? 0)
    }
    else {
      // Both sides changed the part after the last sync, or the device has no
      // sync history and both sides have a value. The remote value stays in
      // the document, and the caller keeps the local document as a copy.
      adoptRemote()
      conflicted = true
    }
  }

  return { merged, nextSynced, pushed, conflicted }
}

/**
 * Compares the local documents with a remote snapshot, part by part.
 *
 * The function is pure. The caller applies the plan to the local documents, sends
 * the pushes and deletions, and gives each push result to {@link applyPushResult}.
 *
 * Rules:
 * - A part that only one side changed takes that change.
 * - A part that both sides changed takes the remote value. The local document
 *   becomes a conflict copy.
 * - An edit has priority over a deletion from the other side.
 */
export function reconcile(input: ReconcileInput): ReconcilePlan {
  const { local, state, remote } = input
  const remoteDocuments = new Map(remote.documents.map(document => [document.id, document]))
  const plan: ReconcilePlan = {
    upserts: {},
    removals: [],
    conflictCopies: [],
    pushes: [],
    deletions: [],
    state: { documents: {} },
  }

  const documentIds = new Set([...Object.keys(local), ...Object.keys(state.documents), ...remoteDocuments.keys()])
  for (const documentId of documentIds) {
    const localDocument = local[documentId]
    const synced = state.documents[documentId]
    const remoteDocument = remoteDocuments.get(documentId)

    if (!remoteDocument || remoteDocument.deletedAt) {
      // Neither side has the document. The sync state of the document is not kept.
      if (!localDocument)
        continue

      const hasLocalChange = !synced || !isEqual(localDocument, valuesOf(synced))
      if (remoteDocument?.deletedAt && !hasLocalChange)
        plan.removals.push(documentId)
      else if (Object.keys(localDocument).length > 0)
        // The server deleted the content, so a new or restored document sends all parts.
        // A document without parts has nothing to send. The server rejects an empty push.
        plan.pushes.push(pushAll(documentId, localDocument))
      continue
    }

    if (!localDocument) {
      // This device deleted the document, and the remote document has no later change.
      // The sync state stays until the deletion reaches the server.
      if (synced && synced.revision === remoteDocument.revision) {
        plan.deletions.push({ documentId, revision: remoteDocument.revision })
        plan.state.documents[documentId] = synced
        continue
      }

      plan.upserts[documentId] = valuesOf(toSyncedDocument(remoteDocument))
      plan.state.documents[documentId] = toSyncedDocument(remoteDocument)
      continue
    }

    const { merged, nextSynced, pushed, conflicted } = reconcileParts(localDocument, synced, remoteDocument)
    plan.state.documents[documentId] = nextSynced
    if (!isEqual(merged, localDocument))
      plan.upserts[documentId] = merged
    if (pushed.length > 0)
      plan.pushes.push({ documentId, fields: pushed })
    if (conflicted)
      plan.conflictCopies.push({ documentId, fields: localDocument })
  }

  return plan
}

/**
 * Records the parts that the server accepted from one push.
 *
 * The sync state of a part with a conflict does not change. The next
 * {@link reconcile} run finds a change on both sides and resolves it.
 */
export function applyPushResult(state: SyncState, push: DocumentPush, result: PushResult): SyncState {
  // The server accepted no part of a document that another device deleted. The
  // next run restores the document with all parts.
  if (result.document.deletedAt)
    return state

  const previous = state.documents[push.documentId]
  const accepted = new Set(push.fields.map(field => field.key).filter(key => !result.conflicts.includes(key)))
  const returned = new Map(result.document.fields.map(field => [field.key, field]))
  const fields = { ...previous?.fields }

  for (const key of accepted) {
    const field = returned.get(key)
    if (field)
      fields[key] = { revision: field.revision, value: field.value }
    else
      delete fields[key]
  }

  // The document revision advances only when this device knows every part of
  // the returned document. A deletion compares this revision, and a deletion must not
  // discard a change from another device that this device has not merged.
  const knowsEveryPart = result.document.fields.every(field => fields[field.key]?.revision === field.revision)
    && Object.keys(fields).every(key => returned.has(key))

  return {
    documents: {
      ...state.documents,
      [push.documentId]: { revision: knowsEveryPart ? result.document.revision : previous?.revision ?? 0, fields },
    },
  }
}
