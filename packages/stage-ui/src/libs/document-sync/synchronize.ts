import type { DocumentSyncClient } from './client'
import type { ConflictCopy, DocumentFields, SyncState } from './reconcile'

import { DocumentSyncRequestError } from './client'
import { applyPushResult, reconcile } from './reconcile'

/**
 * A run repeats while it finds conflicts, because a resolved conflict gives
 * new changes to send. The limit stops two devices that write continuously
 * from holding the run open.
 */
const MAX_ROUNDS = 3

/** The local document changes that one round found. */
export interface LocalDocumentChanges {
  /** The complete new parts of each document that takes changes from another device. */
  upserts: Record<string, DocumentFields>
  removals: string[]
  /** The local documents that lost a conflict. Each one becomes a new document. */
  conflictCopies: ConflictCopy[]
}

/** What the caller did with the changes. */
export interface AppliedLocalChanges {
  /**
   * The ids of the documents in `upserts` that the caller could not apply, for
   * example because the content is invalid. The run keeps the sync state of
   * these documents. Without that, the next run reads the missing local
   * document as a deletion and deletes the server copy.
   *
   * A rejected document must keep its local content and get no conflict copy.
   * Its state does not change, so each later round finds the same conflict.
   */
  rejected: string[]
}

export interface SynchronizeResult {
  /** The sync state at the end of the run. It holds what the server accepted. */
  state: SyncState
  /**
   * The documents that the server refused, for example because the account is
   * over its storage limit. Their content stays on this device, and the run
   * goes on with the other documents. The next run sends them again.
   */
  refused: string[]
}

/** A 400 or 413 answer means that the server refuses this content. Other failures can pass, so the run stops and the next run tries again. */
function isRefusal(error: unknown) {
  return error instanceof DocumentSyncRequestError && (error.status === 400 || error.status === 413)
}

export interface SynchronizeOptions {
  client: DocumentSyncClient
  /** The sync state of the account at the start of the run. */
  state: SyncState
  /** Reads the current local documents. */
  readLocal: () => Record<string, DocumentFields>
  /**
   * Writes the changes to the local documents. The run calls it in the same task
   * as `readLocal`, so it must write the documents before it awaits anything.
   */
  applyLocal: (changes: LocalDocumentChanges) => Promise<AppliedLocalChanges>
  /** Stores the sync state. The run calls it after each step that a later run must not repeat. */
  saveState: (state: SyncState) => Promise<void>
  /**
   * Returns `false` after a sign-out or an account change. The run then stops
   * and does not write the content of one account into another.
   */
  isCurrent: () => boolean
}

/**
 * Brings the local documents of one collection and the server to the same content.
 *
 * Each round reads the server, applies the remote changes locally, and sends
 * the local changes. The function throws on a network error. The saved sync
 * state stays valid, so the next run sends the same changes again.
 */
export async function synchronize(options: SynchronizeOptions): Promise<SynchronizeResult> {
  const { client, isCurrent } = options
  let state = options.state
  const refused = new Set<string>()
  const outcome = (): SynchronizeResult => ({ state, refused: [...refused] })

  // A request reads the token when it starts, so every request needs its own
  // check. A sign-out or an account change during an earlier await would
  // otherwise send the documents of the old account to the new account.
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (!isCurrent())
      return outcome()
    const remote = await client.list()
    if (!isCurrent())
      return outcome()

    // No `await` between `readLocal` and the document write in `applyLocal`. A
    // local edit in between would be overwritten by the planned content.
    const plan = reconcile({ local: options.readLocal(), state, remote })
    const applying = options.applyLocal({
      upserts: plan.upserts,
      removals: plan.removals,
      conflictCopies: plan.conflictCopies,
    })
    const previous = state
    state = plan.state
    const { rejected } = await applying
    for (const documentId of rejected) {
      if (previous.documents[documentId])
        state.documents[documentId] = previous.documents[documentId]
      else
        delete state.documents[documentId]
    }
    await options.saveState(state)

    // A conflict copy is a new local document. The next round sends it. The
    // caller makes no copy for a rejected document, and that document keeps
    // its earlier state, so another round only finds the same conflict.
    let needsAnotherRound = plan.conflictCopies.some(copy => !rejected.includes(copy.documentId))

    for (const push of plan.pushes) {
      if (!isCurrent())
        return outcome()
      let result
      try {
        result = await client.push(push.documentId, push.fields)
      }
      catch (error) {
        if (!isRefusal(error))
          throw error
        refused.add(push.documentId)
        continue
      }
      if (!isCurrent())
        return outcome()
      state = applyPushResult(state, push, result)
      // The state keeps an older document revision when the document has a field from another device
      // that this run has not merged. Another round reads that field.
      needsAnotherRound ||= result.conflicts.length > 0
        || result.document.deletedAt !== null
        || state.documents[push.documentId]?.revision !== result.document.revision
    }

    for (const { documentId, revision } of plan.deletions) {
      if (!isCurrent())
        return outcome()
      const deleted = await client.remove(documentId, revision)
      if (!isCurrent())
        return outcome()
      if (deleted) {
        const { [documentId]: _deleted, ...remaining } = state.documents
        state = { documents: remaining }
      }
      // A rejected deletion means that another device edited the document. The next round restores it.
      needsAnotherRound ||= !deleted
    }

    await options.saveState(state)
    if (!needsAnotherRound)
      return outcome()
  }

  return outcome()
}
