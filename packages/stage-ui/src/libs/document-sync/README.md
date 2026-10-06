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
- The documents are small. Each run reads the full collection.
- The server does not need to read the content.

## When not to use it

- Append-only data with a large volume, for example chat messages. Use the chat synchronization.
- Data that the server must validate, bill, or show to other users.
- Secrets. The server stores the values as plain JSON.

## How to add a collection

1. Add the collection name to `CollectionSchema` in `server/apps/api/src/routes/sync/schema.ts`.
2. Write a function that splits a document into fields, and a function that joins the fields. Keep values that must change together in one field.
3. Call `synchronize` with a client for the collection, the stored sync state, and the functions that read and write the local documents.

`stores/character-card-sync.ts` and `libs/character-card-sync/card-fields.ts` are the reference use.

```ts
import { createDocumentSyncClient, synchronize } from '../libs/document-sync'

await synchronize({
  client: createDocumentSyncClient({ serverUrl, collection: 'character-cards', fetch: authedFetch }),
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
- Run one synchronization at a time for each collection and account.
- Give `pristine` only for documents that each device creates with the same id.

The design record is `server/docs/ai/adr/2026-10-06-document-sync.md`.
