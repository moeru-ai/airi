import { isEqual } from 'es-toolkit'

export type CardHistorySource = 'local' | 'remote' | 'restore' | 'migration'

export interface CardHistoryEntry {
  revision: number
  at: string
  changed: string[]
  removed: string[]
  deleted: boolean
  source: CardHistorySource
}

interface CardDocument {
  cardId: string
  fields: Record<string, unknown>
  headRevision: number
  baseRevision: number
  baseFields: Record<string, unknown>
  baseDeleted: boolean
  deletedAt: string | null
}

interface FieldRevision {
  cardId: string
  key: string
  localRevision: number
  value?: unknown
  removed?: boolean
  source: CardHistorySource
  at: string
}

const DATABASE = 'airi-character-cards'
const VERSION = 1
const DOCUMENTS = 'character-card-documents'
const REVISIONS = 'character-card-field-revisions'
const METADATA = 'metadata'
const MIGRATED = 'legacy-migration-complete'
const DOCUMENT_KEY = '$document'

function request<T>(value: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result)
    value.onerror = () => reject(value.error)
  })
}

function transactionDone(transaction: IDBTransaction) {
  const completed = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('Character card history transaction aborted'))
  })
  // A preceding request may reject before its caller awaits this completion signal.
  void completed.catch(() => undefined)
  return completed
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, VERSION)
    opening.onupgradeneeded = () => {
      const db = opening.result
      if (!db.objectStoreNames.contains(DOCUMENTS))
        db.createObjectStore(DOCUMENTS, { keyPath: 'cardId' })
      if (!db.objectStoreNames.contains(REVISIONS)) {
        const revisions = db.createObjectStore(REVISIONS, { keyPath: ['cardId', 'key', 'localRevision'] })
        revisions.createIndex('cardId', 'cardId')
        revisions.createIndex('cardRevision', ['cardId', 'localRevision'])
      }
      if (!db.objectStoreNames.contains(METADATA))
        db.createObjectStore(METADATA)
    }
    opening.onsuccess = () => resolve(opening.result)
    opening.onerror = () => reject(opening.error)
  })
}

async function writeInTransaction(
  transaction: IDBTransaction,
  cardId: string,
  fields: Record<string, unknown>,
  deleted: boolean,
  source: CardHistorySource,
) {
  const documents = transaction.objectStore(DOCUMENTS)
  const revisions = transaction.objectStore(REVISIONS)
  const previous = await request(documents.get(cardId)) as CardDocument | undefined
  const before = previous?.fields ?? {}
  const keys = new Set([...Object.keys(before), ...Object.keys(fields)])
  const changed = [...keys].filter(key => !isEqual(before[key], fields[key]) || (key in before) !== (key in fields))
  const deletionChanged = Boolean(previous?.deletedAt) !== deleted
  if (previous && changed.length === 0 && !deletionChanged)
    return previous

  const localRevision = (previous?.headRevision ?? 0) + 1
  const at = new Date().toISOString()
  const document: CardDocument = {
    cardId,
    fields,
    headRevision: localRevision,
    baseRevision: previous?.baseRevision ?? 0,
    baseFields: previous?.baseFields ?? {},
    baseDeleted: previous?.baseDeleted ?? false,
    deletedAt: deleted ? at : null,
  }
  try {
    for (const key of changed) {
      const row: FieldRevision = key in fields
        ? { cardId, key, localRevision, value: fields[key], source, at }
        : { cardId, key, localRevision, removed: true, source, at }
      revisions.put(row)
    }
    if (deletionChanged)
      revisions.put({ cardId, key: DOCUMENT_KEY, localRevision, value: deleted, source, at } satisfies FieldRevision)
    document.fields = structuredClone(fields)
    documents.put(document)
  }
  catch (error) {
    transaction.abort()
    throw error
  }

  const cutoff = localRevision - 100
  if (cutoff > document.baseRevision) {
    const rows = await request(revisions.index('cardId').getAll(cardId)) as FieldRevision[]
    const compacted = structuredClone(document.baseFields)
    let baseDeleted = document.baseDeleted
    for (const row of rows) {
      if (row.localRevision > cutoff)
        continue
      if (row.key === DOCUMENT_KEY) {
        baseDeleted = Boolean(row.value)
      }
      else if (row.removed) {
        delete compacted[row.key]
      }
      else {
        compacted[row.key] = row.value
      }
      revisions.delete([cardId, row.key, row.localRevision])
    }
    document.baseRevision = cutoff
    document.baseFields = compacted
    document.baseDeleted = baseDeleted
    documents.put(document)
  }
  return document
}

export const characterCardsRepo = {
  async migrate(cards: Iterable<[string, Record<string, unknown>]>) {
    const db = await openDatabase()
    try {
      const transaction = db.transaction([DOCUMENTS, REVISIONS, METADATA], 'readwrite')
      const done = transactionDone(transaction)
      const metadata = transaction.objectStore(METADATA)
      if (await request(metadata.get(MIGRATED))) {
        await done
        return false
      }
      for (const [cardId, fields] of cards)
        await writeInTransaction(transaction, cardId, fields, false, 'migration')
      metadata.put(true, MIGRATED)
      await done
      return true
    }
    finally {
      db.close()
    }
  },

  async list() {
    const db = await openDatabase()
    try {
      const transaction = db.transaction(DOCUMENTS, 'readonly')
      const rows = await request(transaction.objectStore(DOCUMENTS).getAll()) as CardDocument[]
      await transactionDone(transaction)
      return rows.filter(row => !row.deletedAt).map(row => [row.cardId, row.fields] as const)
    }
    finally {
      db.close()
    }
  },

  async write(cardId: string, fields: Record<string, unknown>, source: CardHistorySource = 'local') {
    const db = await openDatabase()
    try {
      const transaction = db.transaction([DOCUMENTS, REVISIONS], 'readwrite')
      const done = transactionDone(transaction)
      const row = await writeInTransaction(transaction, cardId, fields, false, source)
      await done
      return row.headRevision
    }
    finally {
      db.close()
    }
  },

  async remove(cardId: string, source: CardHistorySource = 'local') {
    const db = await openDatabase()
    try {
      const transaction = db.transaction([DOCUMENTS, REVISIONS], 'readwrite')
      const done = transactionDone(transaction)
      const documents = transaction.objectStore(DOCUMENTS)
      const previous = await request(documents.get(cardId)) as CardDocument | undefined
      if (!previous || previous.deletedAt) {
        await done
        return false
      }
      await writeInTransaction(transaction, cardId, previous.fields, true, source)
      await done
      return true
    }
    finally {
      db.close()
    }
  },

  async forget(cardId: string) {
    const db = await openDatabase()
    try {
      const transaction = db.transaction([DOCUMENTS, REVISIONS], 'readwrite')
      const done = transactionDone(transaction)
      const revisions = transaction.objectStore(REVISIONS)
      const rows = await request(revisions.index('cardId').getAll(cardId)) as FieldRevision[]
      transaction.objectStore(DOCUMENTS).delete(cardId)
      for (const row of rows)
        revisions.delete([row.cardId, row.key, row.localRevision])
      await done
    }
    finally {
      db.close()
    }
  },

  async restore(cardId: string, revision: number, source: CardHistorySource = 'restore') {
    const snapshot = await this.snapshot(cardId, revision)
    if (!snapshot)
      return false
    const db = await openDatabase()
    try {
      const transaction = db.transaction([DOCUMENTS, REVISIONS], 'readwrite')
      const done = transactionDone(transaction)
      await writeInTransaction(transaction, cardId, snapshot.fields, false, source)
      await done
      return snapshot.fields
    }
    finally {
      db.close()
    }
  },

  async snapshot(cardId: string, revision?: number) {
    const db = await openDatabase()
    try {
      const transaction = db.transaction([DOCUMENTS, REVISIONS], 'readonly')
      const documents = transaction.objectStore(DOCUMENTS)
      const document = await request(documents.get(cardId)) as CardDocument | undefined
      if (!document) {
        await transactionDone(transaction)
        return null
      }
      const targetRevision = revision ?? document.headRevision
      if (targetRevision < document.baseRevision || targetRevision > document.headRevision) {
        await transactionDone(transaction)
        return null
      }
      const rows = targetRevision === document.baseRevision
        ? []
        : await request(transaction.objectStore(REVISIONS).index('cardRevision').getAll(IDBKeyRange.bound([cardId, document.baseRevision + 1], [cardId, targetRevision]))) as FieldRevision[]
      const fields = structuredClone(document.baseRevision === 0 ? {} : document.baseFields)
      let deleted = document.baseRevision === 0 ? false : document.baseDeleted
      for (const row of rows) {
        if (row.key === DOCUMENT_KEY)
          deleted = Boolean(row.value)
        else if (row.removed)
          delete fields[row.key]
        else
          fields[row.key] = row.value
      }
      if (targetRevision === document.headRevision) {
        Object.assign(fields, {})
        for (const key of Object.keys(fields)) {
          if (!(key in document.fields))
            delete fields[key]
        }
        Object.assign(fields, document.fields)
        deleted = Boolean(document.deletedAt)
      }
      await transactionDone(transaction)
      return { revision: targetRevision, fields, deleted }
    }
    finally {
      db.close()
    }
  },

  async history(cardId: string, limit = 100) {
    const db = await openDatabase()
    try {
      const transaction = db.transaction([DOCUMENTS, REVISIONS], 'readonly')
      const document = await request(transaction.objectStore(DOCUMENTS).get(cardId)) as CardDocument | undefined
      if (!document) {
        await transactionDone(transaction)
        return [] as CardHistoryEntry[]
      }
      const rows = await request(transaction.objectStore(REVISIONS).index('cardId').getAll(cardId)) as FieldRevision[]
      await transactionDone(transaction)
      const byRevision = new Map<number, CardHistoryEntry>()
      for (const row of rows) {
        let entry = byRevision.get(row.localRevision)
        if (!entry) {
          entry = { revision: row.localRevision, at: row.at, changed: [], removed: [], deleted: false, source: row.source }
          byRevision.set(row.localRevision, entry)
        }
        if (row.key === DOCUMENT_KEY)
          entry.deleted = Boolean(row.value)
        else if (row.removed)
          entry.removed.push(row.key)
        else
          entry.changed.push(row.key)
      }
      return [...byRevision.values()].sort((a, b) => b.revision - a.revision).slice(0, limit)
    }
    finally {
      db.close()
    }
  },

  async deleted() {
    const db = await openDatabase()
    try {
      const transaction = db.transaction(DOCUMENTS, 'readonly')
      const rows = await request(transaction.objectStore(DOCUMENTS).getAll()) as CardDocument[]
      await transactionDone(transaction)
      return rows.filter(row => row.deletedAt).map(row => ({ id: row.cardId, name: String(row.fields['/name'] ?? row.cardId), deletedAt: row.deletedAt! }))
    }
    finally {
      db.close()
    }
  },

  async clear() {
    const db = await openDatabase()
    try {
      const transaction = db.transaction([DOCUMENTS, REVISIONS, METADATA], 'readwrite')
      const done = transactionDone(transaction)
      transaction.objectStore(DOCUMENTS).clear()
      transaction.objectStore(REVISIONS).clear()
      transaction.objectStore(METADATA).clear()
      await done
    }
    finally {
      db.close()
    }
  },
}
