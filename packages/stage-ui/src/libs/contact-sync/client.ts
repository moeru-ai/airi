import type { PutCharacterDocument } from '@proj-airi/server-sdk-shared/contacts'
import type { GenericSchema, InferOutput } from 'valibot'

import { ContactDeletionSchema, ContactListSchema, ContactSnapshotSchema } from '@proj-airi/server-sdk-shared/contacts'
import { parse } from 'valibot'

/** HTTP failures remain distinguishable from transport failures so revision conflicts are not retried as edits. */
export class ContactSyncError extends Error {
  constructor(public readonly status: number) {
    super(`Contact synchronization failed: HTTP ${status}`)
  }
}

/** The caller supplies an account-scoped authenticated fetch; responses never bypass contract validation. */
export function createContactClient(options: { serverUrl: string, fetch: typeof fetch }) {
  async function request<Schema extends GenericSchema>(path: string, method: string, schema: Schema, body?: unknown): Promise<InferOutput<Schema>> {
    const url = new URL(options.serverUrl)
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/v1/contacts${path}`
    const response = await options.fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok)
      throw new ContactSyncError(response.status)
    return parse(schema, await response.json())
  }
  return {
    async list() {
      const result = await request('', 'GET', ContactListSchema)
      return result.contacts
    },
    put(localId: string, command: PutCharacterDocument) {
      return request(`/characters/${encodeURIComponent(localId)}`, 'PUT', ContactSnapshotSchema, command)
    },
    delete(localId: string) {
      return request(`/characters/${encodeURIComponent(localId)}/delete`, 'POST', ContactDeletionSchema, { deleteDirectConversations: true })
    },
  }
}

export type ContactClient = ReturnType<typeof createContactClient>
