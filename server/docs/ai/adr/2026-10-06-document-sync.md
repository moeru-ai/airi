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
A field stores the document revision of its last change.
A push gives a `baseRevision` for each field. The store accepts the field if the stored revision is equal.
The store accepts the other fields of the same push. It returns the keys that it did not accept.
Devices that change different fields of one document do not conflict.

The design does not use a CRDT. A value is a selection or a full text, and a merge of two texts gives a result that no user wrote.

## Server modules

| Module | Owner | Responsibility |
| --- | --- | --- |
| `FieldSyncTables` | Shared | A type that lists the columns the store needs. The compiler rejects a table that misses one. |
| `createFieldSyncStore(db, tables, { validate })` | Shared | Locks a document, compares revisions, writes the accepted fields, keeps deletion markers, and removes the content of a deleted account. |
| `parseDocumentId`, `parsePushRequest`, `parseDeleteRevision` | Shared | Parse the three request shapes. |
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
| First sync of a document that each device creates with the same id | The side that has an edit by the user applies. If both sides have one, the conflict rule applies. |

## Character cards

The tables are `character_cards` and `character_cards_fields`. The route is `/api/v1/character-cards`.
A field key is an RFC 6901 JSON Pointer into the card. The service rejects a key that does not start with `/`.
The client makes one field for each first-level key of the card.
It also makes one field for each key of `extensions`, `extensions.airi`, and `extensions.airi.modules`.
The settings of one module stay in one field, so a provider and its voice change together.
A card stores provider ids and no credentials.
The selected card is not synchronized. Each device keeps its own selection.

## Scope

- The shared store, the table contract, and the request parsers.
- The character card tables, service, and routes.
- Account deletion removes the card content and keeps the deletion markers.
- A client module that compares, merges, and sends documents for any route of this shape.
- The client runs after sign-in, after a card change, and when a window becomes visible.

## Non-goals

- Provider configurations and chat messages. Their current synchronization does not change.
- Encrypted storage. A feature with secrets needs it first.
- Display model files. A card synchronizes its `displayModelId` only. A later feature stores the files in object storage and uses this store for their descriptions.
- Contacts, group chats, and the binding of a chat to a contact.
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

A push to a deleted document restores the document when the store accepts a field.
A push that changes nothing is valid, so a client can send a push again after a lost response.
A value must not be `null`. A missing field row represents an absent value.

## Module graph

```mermaid
flowchart LR
  Store[character-card-sync store] --> Sync[document-sync: synchronize]
  Store --> Fields[splitCard and joinCard]
  Store --> Repo[sync state in IndexedDB]
  Store --> Cards[airi-card store]
  Cards --> Fields
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
├── stores/character-card-sync.ts
└── stores/modules/airi-card.ts
apps/*/src/**/App.vue
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
- Character card tests: the tables, the key check, and the routes with their status codes.
- Client unit tests: each conflict rule, the built-in document, the REST client, and the card split.
- Browser test with two profiles of one account: create, edit, and delete a card.
