import * as v from 'valibot'

const RemoteDocumentSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  revision: v.number(),
  deletedAt: v.nullable(v.string()),
  fields: v.array(v.object({
    key: v.string(),
    revision: v.number(),
    value: v.unknown(),
  })),
})

const RemoteSnapshotSchema = v.object({
  documents: v.array(RemoteDocumentSchema),
})

const PushResultSchema = v.object({
  document: RemoteDocumentSchema,
  conflicts: v.array(v.string()),
})

/** A document as the list route of a feature returns it. A deleted document has no fields. */
export type RemoteDocument = v.InferOutput<typeof RemoteDocumentSchema>
export type RemoteSnapshot = v.InferOutput<typeof RemoteSnapshotSchema>
export type PushResult = v.InferOutput<typeof PushResultSchema>

/** One changed part of a document. `baseRevision` is the revision that this device last merged, or zero. */
export type PushField
  = | { key: string, baseRevision: number, value: unknown }
    | { key: string, baseRevision: number, removed: true }

/** The server answered with a status that the client does not accept for the request. */
export class DocumentSyncRequestError extends Error {
  constructor(readonly status: number, statusText: string) {
    super(`HTTP ${status}: ${statusText}`)
    this.name = 'DocumentSyncRequestError'
  }
}

export interface CreateDocumentSyncClientOptions {
  /** Base server URL, for example `https://api.airi.build`. */
  serverUrl: string
  /** The route that the feature mounts on the server, for example `/api/v1/character-cards`. */
  path: string
  /**
   * Production callers must pass `authedFetch`, which refreshes the token
   * after a 401 response.
   *
   * @default globalThis.fetch
   */
  fetch?: typeof fetch
  /**
   * Timeout of each request in milliseconds. A request without a response
   * must not block all later synchronization runs.
   *
   * @default 10_000
   */
  requestTimeoutMs?: number
}

export interface DocumentSyncClient {
  list: () => Promise<RemoteSnapshot>
  push: (documentId: string, fields: PushField[]) => Promise<PushResult>
  /** @returns `false` when another device changed the document after `revision`. The document is not deleted. */
  remove: (documentId: string, revision: number) => Promise<boolean>
}

/** Builds the REST client for the routes of one feature. All methods throw on an unexpected status. */
export function createDocumentSyncClient(options: CreateDocumentSyncClientOptions): DocumentSyncClient {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000

  async function request(path: string, init: RequestInit, expectedStatuses: number[], query?: Record<string, string>) {
    const url = new URL(options.serverUrl)
    url.pathname = `${url.pathname.replace(/\/+$/, '')}${options.path}${path}`
    url.search = new URLSearchParams(query).toString()

    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) })
    if (!response.ok && !expectedStatuses.includes(response.status))
      throw new DocumentSyncRequestError(response.status, response.statusText)
    return response
  }

  return {
    async list() {
      const response = await request('', { method: 'GET' }, [])
      return v.parse(RemoteSnapshotSchema, await response.json())
    },

    async push(documentId, fields) {
      const response = await request(`/${encodeURIComponent(documentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      }, [])
      return v.parse(PushResultSchema, await response.json())
    },

    async remove(documentId, revision) {
      const response = await request(`/${encodeURIComponent(documentId)}`, { method: 'DELETE' }, [409], { revision: String(revision) })
      return response.ok
    },
  }
}
