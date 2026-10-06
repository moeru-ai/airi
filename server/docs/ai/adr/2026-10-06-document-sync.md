# Document synchronization by field

Status: accepted

## Context

A client keeps its character cards in local storage. A card does not reach the other devices of the user.
Chat synchronization stores the local card id in each chat member.
A second device receives the chats but has no card with that id.
Other client data has the same need, so the conflict rules must be reusable.
A shared table for all features does not fit. Each feature has its own limits, indexes, retention, and validation.

## Decision

The server and the client share an algorithm, not a table.
Each feature owns its tables and its routes. The server provides a store that works on the tables of any feature.

A document is a set of independent fields. The client mints the document id, and the server keeps it.
The client of a feature selects its fields. The store does not read field keys or values.
The feature validates the content before the store writes it.

Each document has a `revision` counter. An accepted write increases it.
A field table only appends rows. Each row is the value that a field had at one revision.
A `null` value means that the revision removed the field. The current value of a field is its row with the highest revision.
A push gives a `baseRevision` for each field. The store accepts the field if the stored revision of the current value is equal.
The store accepts the other fields of the same push. It returns the keys that it did not accept.
Devices that change different fields of one document do not conflict.

Because the field table keeps every past row, the store can also answer "what did this document look like at revision N" and "what changed at each revision". A feature turns this on by passing `history` limits to `createFieldSyncStore`. The store prunes old rows after every accepted write, inside the same transaction, so a feature needs no background job.

The design does not use a CRDT. A value is a selection or a full text, and a merge of two texts gives a result that no user wrote.

## Server modules

| Module | Owner | Responsibility |
| --- | --- | --- |
| `FieldSyncTables` | Shared | A type that lists the columns the store needs. The compiler rejects a table that misses one. |
| `createFieldSyncStore(db, tables, { validate, limits, history })` | Shared | Locks a document, compares revisions, appends the accepted fields, keeps deletion markers, prunes history, answers `history` and `snapshot`, and removes the content of a deleted account. |
| `parseDocumentId`, `parsePushRequest`, `parseDeleteRevision`, `parseHistoryQuery`, `parseRevisionParam` | Shared | Parse the five request shapes. |
| Tables, service, routes, and `validate` of a feature | Feature | Declare the two tables by hand in its own schema file. Choose the route, the extra columns and tables, the limits, the authorization, and every rule about the content. |

A feature composes the store in its own route. The store gives no routes and no hooks other than `validate`.
A feature can add other routes to the same path, for example a signed upload address for a file.

A feature can add columns and indexes to its tables. An added column must accept `null` or have a default.
The store inserts a document row with only the two key columns, and the compiler does not catch a required column.
For a required value, the feature uses a field, or another table with the key `(ownerId, documentId)`.

## Conflict rules

| Case | Result |
| --- | --- |
| One side changed a field | That change applies. |
| Both sides changed a field to the same value | No write. |
| Both sides changed a field to different values | The remote value applies. The client keeps the local document as a new document. |
| One side deleted the document, and the other side edited it | The edit applies, and the document stays. |
| A document that each device creates with the same id | The device sends only the parts that differ from the built-in content, so an unedited document sends nothing. The other devices lay the received parts over their own built-in content. The conflict rules apply to the parts that both sides edited. |

## Character cards

The tables are `character_cards` and `character_cards_fields`. The route is `/api/v1/character-cards`.
A field key is an RFC 6901 JSON Pointer into the card. The service rejects a key that does not start with `/`.
The client makes one field for each first-level key of the card.
It also makes one field for each key of `extensions`, `extensions.airi`, and `extensions.airi.modules`.
The settings of one module stay in one field, so a provider and its voice change together.
A card stores provider ids and no credentials.
The selected card is not synchronized. Each device keeps its own selection.
The `default` card is built in. Each device creates it in its own language, so a part that equals the built-in card never leaves the device. The device lays the received parts over its own built-in card.
The service accepts a field when its key is a JSON Pointer. For the keys that the client reads without a further check, such as `/name`, `/tags`, and `/extensions/airi/wakeWords`, the value must also have the expected type. A value of another type would make the card fail on every device. Other keys accept any JSON, because cards from other applications carry their own extensions.
A device that cannot read a card keeps the cards that it can read and does not delete the server copy of the unreadable card.
An account can store 200 cards and 16 MiB of field values. A deleted card does not count. The limits come from the size of a card, which is a few kilobytes. A card with a large lorebook can reach a few hundred kilobytes.
The card list shows the cloud state of each card: synced, waiting to upload, or refused by the server. A signed-in user also sees one line that tells that the cards sync to the account. A user without an account sees neither.
Cloud sync is a client-owned experiment, off by default. The `character-card-sync` entry in `packages/stage-ui/src/libs/feature-flags.ts` is a `local`-availability flag, so the server has no policy for it and the choice never leaves the device. A signed-in user turns it on in Settings > System > Experimental Features. The card list and card detail pages show their cloud state and history UI only while the flag is on.

## History

Cloud sync has no per-card switch, only the one account-wide experiment flag above, so history is still the user's way back from an unwanted overwrite or a conflict once sync is on. `createCharacterCardService` passes a `history` option to the store:

| Setting | Value | Reason |
| --- | --- | --- |
| Revisions kept per field key | 100 | No usage data exists. The number is a round guess, not a measured need. |
| Deleted card retention | 30 days | Gives a user time to notice a deletion and undo it. |
| Account history byte cap | 64 MiB | Bounds one account's total storage, current content and history together. |

After every accepted push or deletion, inside the same transaction, the store:

1. Collapses each field key's rows older than `revision - 100` into one row: the latest one at or below that cutoff, and only if it has a value. A key whose latest row there is a removal keeps nothing, because the key did not exist going forward from that point. This baseline keeps `snapshot` correct for the oldest revision the retention window still promises, even though an exact revision between the window and the baseline is not guaranteed to reconstruct every key.
2. Removes the field rows of a document that has stayed deleted for more than 30 days. The document row itself, the deletion marker, stays.
3. If the account's total field-row bytes exceed the cap, removes the oldest rows first, oldest revision first. The current value of a field never counts as removable, so a push never fails because of this cap, it only loses older history.

`history(ownerId, documentId, { before, limit })` lists past revisions, newest first, each with the keys it changed and the keys it removed.
`snapshot(ownerId, documentId, revision)` returns the content of the document at that revision. It returns `null` when the document does not exist, the revision is newer than the document's current revision, or the retention rules above already removed that revision.

A deleted field never takes part in a conflict check. Its stored revision in a history row has no effect on `baseRevision` comparisons, the same as before this change: a removed field is absent from the current state, so a push against it always starts from revision zero.

## Scope

- The shared store, the table contract, and the request parsers.
- The character card tables, service, and routes.
- Account deletion removes the card content and keeps the deletion markers.
- A client module that compares, merges, and sends documents for any route of this shape.
- The client runs after sign-in, after a card change, and when a window becomes visible. The `airi-card` store owns the runs, as the provider and chat stores own theirs. The synchronization leader executes one run at a time.
- Before each request, a run checks that the account has not changed. A request reads the token when it starts, so an account change would otherwise send the documents of the old account to the new account.

## Known limits

- A field value is plain JSON. A card from another application can carry any content in `extensions`, and the client uploads it so that an imported card keeps its extensions on every device. The client does not filter it. A user must not put a secret in a card.
- The account deletion removes the content in one transaction. The store has no deletion gate, so a push that is already in flight can write content back before the account is gone. A gate needs a flag that every write checks and that the account deletion sets. That is a separate change.
- A removed field is absent from the current state, so its base revision is zero again. A device with a field revision of zero has never seen the field, and its new value is a new field. A device that has seen the field sends the old revision, and the server reports a conflict. No sequence of requests lets a device overwrite a revision that it has seen.
- The server has no rate limit for these routes, and the list is not paginated.
- A snapshot for a revision below the 100-revision retention window is not guaranteed to reconstruct every key correctly, only the key whose own history happened to collapse to a baseline at or near that point. See [History](#history).
- There is no conflict review dialog. The existing rule in [Conflict rules](#conflict-rules) still decides the winner, and the losing edit survives only as the client's local copy, because it never reached the server.

## Non-goals

- Provider configurations and chat messages. Their current synchronization does not change.
- Encrypted storage. A feature with secrets needs it first.
- Display model files. A card synchronizes its `displayModelId` only. A later feature stores the files in object storage and uses this store for their descriptions.
- Contacts, group chats, and the binding of a chat to a contact.
- A read-only built-in card. When it exists, the built-in card leaves synchronization and its forks synchronize as ordinary cards.
- A per-card switch for cloud sync, a server policy for the sync flag, and a first-time prompt before the first upload. The account-wide switch is a client-owned experiment flag. See [Character cards](#character-cards).
- Branching or merging history. A card's history is one line: older revisions, not alternate ones.
- Line-level diff highlighting for a long text field in the history UI. It needs a diff library, and library choices go through the user first.
- Upload rate limiting and list pagination for these routes. Both stay open follow-up work.
- A push channel. Another device receives a change on its next run.
- Pagination. A run reads all documents of the feature.
- The relational `characters` tables and their routes. They do not change.
- Removal of old deletion markers.

## HTTP contract of a feature

The character card routes are the reference.

| Request | Result |
| --- | --- |
| `GET /` | `{ documents }`. A deleted document has `deletedAt` and no fields. |
| `PUT /:id` with `{ fields }` | `{ document, conflicts }`. A field is `{ key, baseRevision, value }` or `{ key, baseRevision, removed: true }`. |
| `DELETE /:id?revision=N` | `204`. `409` if the document revision is not `N`. |
| `GET /:id/history?before=N&limit=N` | `{ history }`, newest first. `limit` defaults to 50 and stops at 200. `404` if the document does not exist or belongs to another account. |
| `GET /:id/history/:revision` | `{ revision, at, fields }`. `404` if the document does not exist, the revision is newer than current, or history already removed it. |

A push to a deleted document restores the document when the store accepts a field.
A push that changes nothing is valid, so a client can send a push again after a lost response.
A store with limits answers 413 with the code `STORAGE_LIMIT_EXCEEDED` when a push makes the account grow past a limit, and it writes nothing of that push. A push that does not grow the account always passes, so an account over its limit can still delete and shrink. The check runs under a lock for the account, so two requests cannot both take the last free slot.
A client treats 400 and 413 for one document as a refusal of that document. The run goes on with the other documents, and the next run sends the refused document again. Other failures stop the run.
A value must not be `null`. A missing field row represents an absent value.

## Module graph

```mermaid
flowchart LR
  Cards[airi-card store] --> Sync[document-sync: synchronize]
  Cards --> Fields[splitCard and joinCard]
  Cards --> Repo[sync state in IndexedDB]
  Sync --> Reconcile[document-sync: reconcile]
  Sync --> Client[document-sync: REST client]
  Client --> Routes[routes/character-cards]
  Routes --> Service[CharacterCardService]
  Service --> Engine[createFieldSyncStore]
  Service --> Tables[(character_cards and character_cards_fields)]
  Engine --> Tables
  Deletion[UserDeletionService] --> Service
```

## Affected files

```text
server/apps/api
├── drizzle/0031_character_cards.sql
└── src
    ├── app.ts
    ├── schemas/character-cards.ts       # the tables of the feature, declared by hand
    ├── services/domain/field-sync/      # the shared store, the table contract, and request parsers
    ├── services/domain/character-cards.ts
    └── routes/character-cards/index.ts
packages/stage-ui/src
├── libs/document-sync/{client,reconcile,synchronize}.ts
├── libs/character-card-sync/card-fields.ts
├── database/repos/document-sync.repo.ts
└── stores/modules/airi-card.ts         # starts the runs and applies the result
```

## Sequence

```mermaid
sequenceDiagram
  participant A as Device A
  participant S as API
  participant B as Device B
  A->>S: PUT /character-cards/luna { speech, base 1 }
  S-->>A: document revision 2, no conflicts
  B->>S: GET /character-cards
  S-->>B: luna revision 2
  Note over B: B changed the prompt offline. The speech field has no local change.
  B->>B: take speech revision 2
  B->>S: PUT /character-cards/luna { systemPrompt, base 1 }
  S-->>B: document revision 3, no conflicts
  A->>S: GET /character-cards
  S-->>A: luna revision 3
  A->>A: take systemPrompt revision 3
```

## Client state

The client stores the fields and revisions that it last merged, for each feature and account.
A local field that differs from this state has a local change.
A remote field whose revision differs from this state has a remote change.
The local cards belong to the device. A second account on the device starts without sync history and uploads them.

## Test plan

- Store tests on PGlite with tables that no feature owns, and with extra columns: field independence, conflicts, a repeated push, deletion, restoration, validation, account deletion, and the kept extra columns.
- Store history tests: a past revision's content from `snapshot`, a removed field kept out of current content but visible in an old snapshot without taking part in a conflict, the content before a deletion, `null` for another account and a future or removed revision, paging with `before` and `limit`.
- Store cleanup tests: a baseline revision stays correct after older revisions collapse, a deleted document's history clears after its retention window while the deletion marker stays, the current value of a field survives the account history byte cap, history bytes do not count toward the storage limit, and account deletion clears history rows.
- Character card tests: the tables, the key check, and the routes with their status codes.
- Character card route tests: history and snapshot for an owned card, paging, 400 for a bad query or revision, 404 for a missing card or revision, and 404 for another account's card.
- Client unit tests: each conflict rule, the built-in document, the REST client, and the card split.
- Browser test with two profiles of one account: create, edit, and delete a card.
