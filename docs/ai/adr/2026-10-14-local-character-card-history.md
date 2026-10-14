# Local character card history

Status: accepted

## Context

The client stores the current character cards in `localStorage.airi-cards`.
The server stores field revisions for cloud synchronization. That history needs
an account and a network connection. It does not cover edits that exist only on
one device.

The client also stores the active card id separately. Its cloud sync state is
account-scoped and records the last confirmed server fields. Neither value is a
local card history.

## Decision

- Store card documents and field revisions in a character-card IndexedDB
  database. Keep this database private to the character-card domain.
- Use the browser IndexedDB API. The current key/value adapters do not expose
  one transaction across a card document and its revision records.
- Keep the local `localRevision` counter separate from server field revisions.
  Allocate it from the document head inside a read-write transaction.
- Store the current card snapshot and all changed field records in the same
  transaction. Publish the committed snapshot to Pinia after that transaction
  completes.
- Use `splitCard()` to create revision fields and `joinCard()` to rebuild a
  snapshot. A removed or reset field gets an explicit tombstone.
- Keep `airi-card-active-id` outside the card document and revision history.

## Storage model

The database is named `airi-character-cards` and starts at version 1.

`character-card-documents` uses `cardId` as its key. Each row stores the current
card, `headRevision`, `baseRevision`, `baseFields`, `baseDeleted`, and
`deletedAt`.

`character-card-field-revisions` uses `[cardId, key, localRevision]` as its key.
It has indexes for `[cardId]` and `[cardId, localRevision]`. Each row stores the
field value or a tombstone, the source, and its timestamp. The reserved key
`$document` records a card deletion or restoration.

`metadata` stores the one-time legacy migration marker. A read-write
transaction across these three stores owns every history write.

## Write path

Create, edit, module update, delete, restore, built-in seeding, and remote sync
apply all call the card-history repository. A write that changes no fields and
does not change deletion state creates no revision.

The repository compares the previous and next `splitCard()` values. It writes
only changed fields. A field tombstone means that the field is absent from the
new snapshot. A document tombstone keeps the prior card content available for
history and restore.

Restore writes the selected snapshot as a new revision with source `restore`.
It never moves the head backward. Restore of a deleted card clears its
`deletedAt` value in the same transaction.

The source values are `local`, `remote`, `restore`, and `migration`. A conflict
copy preserves local content, so its source is `local`. Its id is a
deterministic function of the account id, original document id, and remote
document revision. `ConflictCopy` carries that remote revision from
`reconcile()`, so a replayed plan resolves to the same id without colliding
with a copy from another account.

## Cross-window ordering

IndexedDB serializes read-write transactions that overlap the same database.
This prevents two windows from allocating the same card revision.

The card store exposes `withLocalChanges<T>(operation: () => Promise<T>):
Promise<T>`. Every local card mutation uses this queue. `synchronize()` fetches
the remote snapshot first, then calls this hook with one operation that reads
the current cards, reconciles them, applies the plan, and saves the resulting
sync cursor. It checks the account again after acquiring the queue and before
applying or saving. The queue is released in `finally` after the operation
settles. `applyLocal` does not acquire the queue again. A later cursor save
after remote pushes is also serialized with local mutations. This keeps network
requests outside the critical section while ensuring no local edit can enter
between the snapshot read and remote apply.

If a local transaction fails, Pinia keeps its prior snapshot and cloud sync
does not save the planned cursor. Repeating an unchanged remote upsert creates
no revision. A stable conflict-copy id makes replay idempotent.

The debounced card watcher only requests cloud synchronization. It never writes
local history. `documentSyncRepo` remains the account-scoped cloud cursor store.

## Migration

On initialization, the repository reads the existing `airi-cards` Map from
localStorage. One IndexedDB transaction writes every card as revision 1 with
source `migration` and writes the migration marker. The transaction either
imports every card or imports none. An IndexedDB error keeps the source value
intact and exposes a failed initialization state to the card settings UI with
a retry action; card mutations stay unavailable until the import succeeds.
Invalid legacy data keeps the raw value available for export from that error
state so the user can recover or inspect it before clearing the broken entry.
The client never silently replaces unreadable user data with an empty
collection.

The client removes `airi-cards` only after the transaction succeeds. If parsing
or storage fails, initialization reports the error and keeps the legacy value
for a later retry. If removal fails after the transaction, the marker prevents
duplicate revisions on the next start. The active-card id is not migrated.

After migration, IndexedDB is the only source of card content. The client does
not write cards to localStorage. The existing delete-all-data operation also
clears the card-history database, removes the migration marker and any legacy
card key, and resets the in-memory store so a later startup cannot re-import
deleted data.

## Snapshots and retention

The repository keeps the latest 100 revisions for each card. When older rows
expire, it replays them into `baseFields` and `baseDeleted` at the pruning
boundary, then removes those rows in the same transaction. Every retained
revision can be reconstructed from that checkpoint and its later field rows.

Deleted card rows keep their latest 100 revisions until the user clears this
site's browser data. The card settings page exposes a Recently Deleted panel
that lists these rows and restores them through the repository, so retained
history is reachable without knowing a deleted card id. The local panel is
available signed out and offline; the separate cloud panel remains gated by
account and cloud-sync availability.

For the built-in `default` card, revisions store the edits that `splitCard()`
retains, not translated fields equal to a built-in variant. `joinCard()` uses
the current built-in card when it rebuilds history. This preserves device
language defaults while restoring the card's historical edits.

## Interface

The local History tab is available without authentication, cloud sync, or a
network connection. It reads and restores local revisions. When cloud sync is
available, a separate Cloud History tab keeps the existing server history and
restore behavior.

## Alternatives

- Reusing `documentSyncRepo` would mix card content with an account-scoped
  server cursor and would not provide snapshots.
- Keeping `localStorage` as a second writer would create two sources of truth
  and would violate the migration contract.
- Writing history from the card watcher would record cloud replays as local
  edits and could create duplicate revisions.
- Using a key/value adapter would not make the document head and field rows
  atomic.

## Consequences

- Local history works signed out and offline, but it stays on one device.
- IndexedDB transaction errors prevent a card edit from appearing in Pinia.
- The local history has a separate revision counter and retention policy from
  cloud history.
- The browser owns storage removal for deleted cards and expired local data.

## Validation

- Test field commits, no-op writes, snapshots, tombstones, deletion, restore,
  migration, retention, and transaction failures in a browser.
- Test concurrent writes through two IndexedDB connections.
- Test signed-out and offline history in the card detail dialog.
- Test remote provenance, sync replay, and unchanged cloud conflict behavior.
- Run the stage-ui and stage-pages typechecks, their related Vitest projects,
  the root typecheck, and `pnpm lint`.
