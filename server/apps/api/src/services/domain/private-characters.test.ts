import type { CharacterDocument } from '@proj-airi/server-sdk-shared/contacts'

import type { Database } from '../../libs/db'

import { CharacterDocumentSchema } from '@proj-airi/server-sdk-shared/contacts'
import { eq, sql } from 'drizzle-orm'
import { safeParse } from 'valibot'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createCharacterService } from './characters'
import { createChatService } from './chats'
import { createContactService } from './contacts'

import * as schema from '../../schemas'

const document: CharacterDocument = {
  name: 'Luna',
  version: '1.0.0',
  description: 'A private companion',
  systemPrompt: 'A private persona',
  extensions: {
    airi: {
      modules: {
        consciousness: { provider: '', model: '' },
        vision: { provider: '', model: '' },
        speech: { provider: '', model: '', voice_id: '' },
        displayModelId: 'preset-live2d-1',
      },
      agents: {},
    },
  },
}

describe('private character sync', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  it('atomically imports the definition and contact and preserves inherited selections', async () => {
    const service = createContactService(db)
    const command = { document, expectedRevision: 0, mutationId: 'first-import' }
    const contact = await service.putCharacter('private-owner', 'default', command)
    expect(contact).toMatchObject({ ownerId: 'private-owner', localCharacterId: 'default', revision: 1, document })
    expect(await service.putCharacter('private-owner', 'default', command)).toEqual(contact)
    expect(await service.list('private-owner')).toEqual([contact])
    const other = await service.putCharacter('another-owner', 'default', command)
    expect(other.id).not.toBe(contact.id)
    expect(other.characterId).not.toBe(contact.characterId)
    expect(await service.list('another-owner')).toEqual([other])
    const definitions = await db.select().from(schema.characterDocuments).where(eq(schema.characterDocuments.characterId, contact.characterId))
    expect(definitions).toEqual([{ characterId: contact.characterId, document }])
  })

  it('keeps private data outside marketplace reads and engagement', async () => {
    const contact = await createContactService(db).putCharacter('privacy-owner', 'private', { document, expectedRevision: 0, mutationId: 'privacy' })
    const marketplace = createCharacterService(db)
    expect(await marketplace.findById(contact.characterId)).toBeUndefined()
    expect(await marketplace.findByOwnerId('privacy-owner')).toEqual([])
    expect(await marketplace.findAll()).toEqual([])
    await expect(marketplace.like('intruder', contact.characterId)).rejects.toMatchObject({ statusCode: 404 })
    await expect(marketplace.bookmark('intruder', contact.characterId)).rejects.toMatchObject({ statusCode: 404 })
    await expect(createContactService(db).register('intruder', contact.characterId)).rejects.toMatchObject({ statusCode: 404 })
    expect(await createContactService(db).list('intruder')).toEqual([])
  })

  it('rejects stale revisions and replayed mutation identities with different content', async () => {
    const service = createContactService(db)
    const first = await service.putCharacter('revision-owner', 'local', { document, expectedRevision: 0, mutationId: 'create' })
    const edited = { ...document, name: 'Edited Luna' }
    const command = { document: edited, expectedRevision: first.revision, mutationId: 'edit' }
    const updated = await service.putCharacter('revision-owner', 'local', command)
    expect(updated.revision).toBe(2)
    expect(updated.document.name).toBe('Edited Luna')
    expect(await service.putCharacter('revision-owner', 'local', command)).toEqual(updated)
    await expect(service.putCharacter('revision-owner', 'local', { document, expectedRevision: 1, mutationId: 'stale' }))
      .rejects
      .toMatchObject({ statusCode: 409, message: 'Character revision changed' })
    await expect(service.putCharacter('revision-owner', 'local', { ...command, document }))
      .rejects
      .toMatchObject({ statusCode: 409, message: 'Mutation identity already used for another definition' })
    expect(await service.list('revision-owner')).toEqual([updated])
  })

  it('deletes private definitions and direct history without allowing stale imports to resurrect them', async () => {
    const contacts = createContactService(db)
    const chats = createChatService(db)
    const command = { document, expectedRevision: 0, mutationId: 'delete-create' }
    const contact = await contacts.putCharacter('private-delete', 'local', command)
    const chat = await chats.createChat('private-delete', { type: 'bot', contactId: contact.id })
    await chats.pushMessages('private-delete', chat.id, [{ id: 'private-message', role: 'user', content: 'private history' }])
    const deleted = await contacts.deleteContact('private-delete', contact.id)
    expect(deleted.chatIds).toEqual([chat.id])
    expect(await contacts.list('private-delete')).toEqual([{ ...deleted.contact, document: null }])
    expect(await db.select().from(schema.characterDocuments).where(eq(schema.characterDocuments.characterId, contact.characterId))).toEqual([])
    expect(await db.query.character.findFirst({ where: eq(schema.character.id, contact.characterId) })).toMatchObject({ deletedAt: expect.any(Date) })
    await expect(contacts.putCharacter('private-delete', 'local', command)).rejects.toMatchObject({ statusCode: 409, message: 'Contact was deleted' })
    await expect(chats.pushMessages('private-delete', chat.id, [{ id: 'late-private', role: 'assistant', content: 'late' }])).rejects.toMatchObject({ statusCode: 404 })
  })

  it('persists deletion before first import and rejects delayed creation without storing the definition', async () => {
    const contacts = createContactService(db)
    const chats = createChatService(db)
    const history = await chats.createChat('offline-delete', { type: 'bot', members: [{ type: 'character', characterId: 'offline-role' }] })
    await chats.pushMessages('offline-delete', history.id, [{ id: 'offline-message', role: 'user', content: 'remove with contact' }])
    const deleted = await contacts.deleteCharacter('offline-delete', 'offline-role')
    expect(deleted.chatIds).toEqual([history.id])
    expect(deleted.contact.deletedAt).toBeInstanceOf(Date)
    expect(await contacts.deleteCharacter('offline-delete', 'offline-role')).toEqual(deleted)
    expect(await db.select().from(schema.characterDocuments).where(eq(schema.characterDocuments.characterId, deleted.contact.characterId))).toEqual([])
    await expect(contacts.putCharacter('offline-delete', 'offline-role', { document, expectedRevision: 0, mutationId: 'delayed-import' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(chats.getChat('offline-delete', history.id)).rejects.toMatchObject({ statusCode: 404 })
    const other = await contacts.putCharacter('other-offline-owner', 'offline-role', { document, expectedRevision: 0, mutationId: 'other-import' })
    expect(other.deletedAt).toBeNull()
  })

  it('protects the built-in contact except during account erasure', async () => {
    const contacts = createContactService(db)
    const builtin = await contacts.putCharacter('builtin-delete', 'default', { document, expectedRevision: 0, mutationId: 'builtin' })
    await expect(contacts.deleteCharacter('builtin-delete', 'default')).rejects.toMatchObject({ statusCode: 400 })
    await expect(contacts.deleteContact('builtin-delete', builtin.id)).rejects.toMatchObject({ statusCode: 400 })
    expect((await contacts.list('builtin-delete'))[0].deletedAt).toBeNull()
    await contacts.deleteAllForUser('builtin-delete')
    expect((await contacts.list('builtin-delete'))[0].deletedAt).toBeInstanceOf(Date)
  })

  it('rejects credential fields, unknown extensions, and device paths', () => {
    const airi = document.extensions.airi
    expect(safeParse(CharacterDocumentSchema, { ...document, apiKey: 'not-portable' }).success).toBe(false)
    expect(safeParse(CharacterDocumentSchema, { ...document, extensions: { ...document.extensions, other: { secret: 'not-portable' } } }).success).toBe(false)
    expect(safeParse(CharacterDocumentSchema, { ...document, extensions: { airi: { ...airi, modules: { ...airi.modules, vrm: { file: '/private/model.vrm' } } } } }).success).toBe(false)
    expect(safeParse(CharacterDocumentSchema, { ...document, extensions: { airi: { ...airi, modules: { ...airi.modules, displayModelId: '/private/model.vrm' } } } }).success).toBe(false)
  })

  it('migrates only exact owned histories and preserves message identity and sequence', async () => {
    const chats = createChatService(db)
    const contacts = createContactService(db)
    const direct = await chats.createChat('migration-owner', { type: 'bot', members: [{ type: 'character', characterId: 'local' }] })
    const shared = await chats.createChat('migration-owner', { type: 'bot', members: [{ type: 'character', characterId: 'local' }, { type: 'user', userId: 'peer' }] })
    const ambiguous = await chats.createChat('migration-owner', { type: 'bot', members: [{ type: 'character', characterId: 'local' }, { type: 'character', characterId: 'second' }] })
    const other = await chats.createChat('migration-other', { type: 'bot', members: [{ type: 'character', characterId: 'local' }] })
    await chats.pushMessages('migration-owner', direct.id, [{ id: 'migrated-message', role: 'user', content: 'keep this history' }])
    const before = await chats.pullMessages('migration-owner', direct.id, 0)
    const contact = await contacts.putCharacter('migration-owner', 'local', { document, expectedRevision: 0, mutationId: 'migrate' })
    expect(await chats.getChat('migration-owner', direct.id)).toMatchObject({ id: direct.id, contactId: contact.id })
    expect(await chats.pullMessages('migration-owner', direct.id, 0)).toEqual(before)
    for (const chat of [shared, ambiguous])
      expect(await chats.getChat('migration-owner', chat.id)).toMatchObject({ contactId: null })
    expect(await chats.getChat('migration-other', other.id)).toMatchObject({ contactId: null })
    await contacts.deleteContact('migration-owner', contact.id)
    await expect(chats.createChat('migration-owner', { type: 'bot', members: [{ type: 'character', characterId: 'local' }] }))
      .rejects
      .toMatchObject({ statusCode: 400 })
  })

  it('supports explicit assignment but rejects automatic guesses and shared-chat conversion', async () => {
    const chats = createChatService(db)
    const contacts = createContactService(db)
    const unbound = await chats.createChat('assignment-owner', { type: 'bot' })
    const shared = await chats.createChat('assignment-owner', { type: 'bot', members: [{ type: 'user', userId: 'peer' }] })
    const contact = await contacts.putCharacter('assignment-owner', 'local', { document, expectedRevision: 0, mutationId: 'assign' })
    await expect(chats.bindContact('assignment-owner', unbound.id, { contactId: contact.id, expectedCharacterId: 'local' }))
      .rejects
      .toMatchObject({ statusCode: 409 })
    await expect(chats.bindContact('assignment-owner', shared.id, { contactId: contact.id }))
      .rejects
      .toMatchObject({ statusCode: 400 })
    const assigned = await chats.bindContact('assignment-owner', unbound.id, { contactId: contact.id })
    expect(assigned.contactId).toBe(contact.id)
    expect(await chats.bindContact('assignment-owner', unbound.id, { contactId: contact.id })).toEqual(assigned)
    await expect(chats.bindContact('intruder', unbound.id, { contactId: contact.id })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('validates database JSON before returning it to a device', async () => {
    const contacts = createContactService(db)
    const contact = await contacts.putCharacter('corrupt-document', 'local', { document, expectedRevision: 0, mutationId: 'corrupt' })
    await db.execute(sql`UPDATE character_documents SET document = '{"apiKey":"not-portable"}'::jsonb WHERE character_id = ${contact.characterId}`)
    await expect(contacts.list('corrupt-document')).rejects.toThrow()
  })
})
