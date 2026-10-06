import type { DocumentSyncClient } from './client'
import type { DocumentFields, SyncState } from './reconcile'

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
  /** The parts of local documents that lost a conflict. Each one becomes a new document. */
  conflictCopies: DocumentFields[]
}

export interface SynchronizeOptions {
  client: DocumentSyncClient
  /** The sync state of the account at the start of the run. */
  state: SyncState
  /** Reads the current local documents and the unedited content of the built-in documents. */
  readLocal: () => { documents: Record<string, DocumentFields>, pristine: Record<string, DocumentFields> }
  /**
   * Writes the changes to the local documents. The run calls it in the same task
   * as `readLocal`, so it must write the documents before it awaits anything.
   */
  applyLocal: (changes: LocalDocumentChanges) => Promise<void>
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
export async function synchronize(options: SynchronizeOptions) {
  const { client, isCurrent } = options
  let state = options.state

  // A request reads the token when it starts, so every request needs its own
  // check. A sign-out or an account change during an earlier await would
  // otherwise send the documents of the old account to the new account.
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    if (!isCurrent())
      return
    const remote = await client.list()
    if (!isCurrent())
      return

    // No `await` between `readLocal` and the document write in `applyLocal`. A
    // local edit in between would be overwritten by the planned content.
    const local = options.readLocal()
    const plan = reconcile({ local: local.documents, state, remote, pristine: local.pristine })
    const applied = options.applyLocal({
      upserts: plan.upserts,
      removals: plan.removals,
      conflictCopies: plan.conflictCopies,
    })
    state = plan.state
    await applied
    await options.saveState(state)

    // A conflict copy is a new local document. The next round sends it.
    let needsAnotherRound = plan.conflictCopies.length > 0

    for (const push of plan.pushes) {
      if (!isCurrent())
        return
      const result = await client.push(push.documentId, push.fields)
      if (!isCurrent())
        return
      state = applyPushResult(state, push, result)
      needsAnotherRound ||= result.conflicts.length > 0 || result.document.deletedAt !== null
    }

    for (const { documentId, revision } of plan.deletions) {
      if (!isCurrent())
        return
      const deleted = await client.remove(documentId, revision)
      if (!isCurrent())
        return
      if (deleted) {
        const { [documentId]: _deleted, ...remaining } = state.documents
        state = { documents: remaining }
      }
      // A rejected deletion means that another device edited the document. The next round restores it.
      needsAnotherRound ||= !deleted
    }

    await options.saveState(state)
    if (!needsAnotherRound)
      return
  }
}
