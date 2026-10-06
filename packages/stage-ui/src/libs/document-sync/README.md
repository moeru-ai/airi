# document-sync

Synchronizes small documents of one user between devices. It resolves conflicts for each field, not for each document.

## What it does

- A document is a set of independent fields. You select the fields.
- A field that one device changed takes that change.
- A field that two devices changed takes the server value. The local document becomes a conflict copy, so no change is lost.
- An edit has priority over a deletion from another device.
- The module works offline. It sends the local changes on the next run.

## When to use it

- One user owns the documents and edits them on more than one device.
- The documents are small. Each run reads all documents of the feature.

## When not to use it

- Append-only data with a large volume, for example chat messages. Use the chat synchronization.
- Files. Store the file in object storage and synchronize its description.
- Secrets. The server stores the values as plain JSON.

## How to add a feature

Each feature owns its tables and its routes. The server and the client share only the algorithm.

Server, in `server/apps/api`:

1. Define the tables in a schema file with `defineFieldSyncTables('<feature>')`, and generate the migration.
2. Create the service with `createFieldSyncStore(db, tables, { validate })`. Put every rule about the content in `validate`.
3. Write the routes of the feature. Call `list`, `push`, and `remove`, and parse the requests with `parseDocumentId`, `parsePushRequest`, and `parseDeleteRevision`.

Client, in `packages/stage-ui`:

1. Write a function that splits a document into fields, and a function that joins the fields. Keep values that must change together in one field.
2. Call `synchronize` with a client for the route, the stored sync state, and the functions that read and write the local documents.

`server/apps/api/src/services/domain/character-cards.ts`, `stores/character-card-sync.ts`, and `libs/character-card-sync/card-fields.ts` are the reference use.

```ts
import { createDocumentSyncClient, synchronize } from '../libs/document-sync'

await synchronize({
  client: createDocumentSyncClient({ serverUrl, path: '/api/v1/character-cards', fetch: authedFetch }),
  state: await documentSyncRepo.getState('character-cards', userId) ?? { documents: {} },
  saveState: state => documentSyncRepo.saveState('character-cards', userId, state),
  isCurrent: () => currentUserId() === userId,
  readLocal: () => ({ documents: splitAll(localDocuments), pristine: {} }),
  applyLocal: async changes => writeLocalDocuments(changes),
})
```

## Rules for the caller

- `applyLocal` must write the local documents before it awaits anything. The run compares and writes in one task.
- A field value must not be `null`. Omit the field.
- Run one synchronization at a time for each feature and account.
- Give `pristine` only for documents that each device creates with the same id.

The design record is `server/docs/ai/adr/2026-10-06-document-sync.md`.
