import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { ContactListSchema, ContactSnapshotSchema } from '@proj-airi/server-sdk-shared/contacts'
import { Hono } from 'hono'
import { parse } from 'valibot'
import { beforeAll, describe, expect, it } from 'vitest'

import { createContactRoutes } from '.'
import { mockDB } from '../../libs/mock-db'
import { createContactService } from '../../services/domain/contacts'
import { ApiError } from '../../utils/error'

import * as schema from '../../schemas'

describe('contact HTTP commands', () => {
  let db: Database
  let app: Hono<HonoEnv>
  let characterId: string

  beforeAll(async () => {
    db = await mockDB(schema)
    const [user] = await db.insert(schema.user).values({
      id: 'contact-http-user',
      name: 'Contact owner',
      email: 'contact-owner@example.test',
    }).returning()
    const [character] = await db.insert(schema.character).values({
      ownerId: user.id,
      creatorId: user.id,
      characterId: 'local-character',
      version: '1',
      coverUrl: '',
    }).returning()
    characterId = character.id
    app = new Hono<HonoEnv>()
    app.onError((error, context) => {
      if (error instanceof ApiError)
        return context.json({ error: error.errorCode }, error.statusCode)
      throw error
    })
    app.use('*', async (context, next) => {
      if (context.req.header('Authorization') === 'Bearer test-user')
        context.set('user', user)
      await next()
    })
    app.route('/contacts', createContactRoutes(createContactService(db)))
  })

  it('requires authentication and does not trust caller-supplied ownership', async () => {
    expect((await app.request('/contacts')).status).toBe(401)
    const response = await app.request('/contacts', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-user', 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId, ownerId: 'another-user' }),
    })
    expect(response.status).toBe(400)
    expect(await createContactService(db).list('contact-http-user')).toEqual([])
  })

  it('requires destructive consent and returns durable deletion markers on retry and list', async () => {
    const service = createContactService(db)
    const contact = await service.register('contact-http-user', characterId)
    const headers = { 'Authorization': 'Bearer test-user', 'Content-Type': 'application/json' }
    for (const body of [{}, { deleteDirectConversations: false }]) {
      const response = await app.request(`/contacts/${contact.id}/delete`, { method: 'POST', headers, body: JSON.stringify(body) })
      expect(response.status).toBe(400)
      expect(await service.list('contact-http-user')).toEqual([{ ...contact, document: null }])
    }
    const request = { method: 'POST', headers, body: JSON.stringify({ deleteDirectConversations: true }) }
    const response = await app.request(`/contacts/${contact.id}/delete`, request)
    expect(response.status).toBe(200)
    const deleted = await response.json()
    expect(deleted).toMatchObject({ contact: { id: contact.id, revision: 2, deletedAt: expect.any(String) }, chatIds: [] })
    const retry = await app.request(`/contacts/${contact.id}/delete`, request)
    expect(await retry.json()).toEqual(deleted)
    const list = await app.request('/contacts', { headers })
    expect(await list.json()).toMatchObject({ contacts: [{ id: contact.id, revision: 2, deletedAt: expect.any(String) }] })
  })

  it('requires consent before recording an offline identity deletion', async () => {
    const headers = { 'Authorization': 'Bearer test-user', 'Content-Type': 'application/json' }
    const path = '/contacts/characters/not-yet-imported/delete'
    const denied = await app.request(path, { method: 'POST', headers, body: '{}' })
    expect(denied.status).toBe(400)
    expect((await createContactService(db).list('contact-http-user')).some(contact => contact.localCharacterId === 'not-yet-imported')).toBe(false)
    const request = { method: 'POST', headers, body: JSON.stringify({ deleteDirectConversations: true }) }
    const response = await app.request(path, request)
    expect(response.status).toBe(200)
    const deleted = await response.json()
    expect(deleted).toMatchObject({ contact: { localCharacterId: 'not-yet-imported', deletedAt: expect.any(String) }, chatIds: [] })
    expect(await (await app.request(path, request)).json()).toEqual(deleted)
  })

  it('validates private import and returns the shared wire contract on put and list', async () => {
    const headers = { 'Authorization': 'Bearer test-user', 'Content-Type': 'application/json' }
    const document = {
      name: 'Private Luna',
      version: '1.0.0',
      extensions: {
        airi: {
          modules: {
            consciousness: { provider: '', model: '' },
            vision: { provider: '', model: '' },
            speech: { provider: '', model: '', voice_id: '' },
          },
          agents: {},
        },
      },
    }
    const invalid = await app.request('/contacts/characters/local-role', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ document: { ...document, apiKey: 'secret' }, expectedRevision: 0, mutationId: 'bad' }),
    })
    expect(invalid.status).toBe(400)
    const imported = await app.request('/contacts/characters/local-role', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ document, expectedRevision: 0, mutationId: 'import' }),
    })
    expect(imported.status).toBe(200)
    const contact = parse(ContactSnapshotSchema, await imported.json())
    expect(contact.document).toEqual(document)
    expect(contact.localCharacterId).toBe('local-role')
    const response = await app.request('/contacts', { headers })
    const snapshot = parse(ContactListSchema, await response.json())
    expect(snapshot.contacts.find(entry => entry.id === contact.id)).toEqual(contact)
  })
})
