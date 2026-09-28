import type { Database } from '../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createChatService } from './chats'
import { createContactService } from './contacts'

import * as schema from '../../schemas'

describe('contact ownership and direct conversations', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  async function characterFor(ownerId: string) {
    const [character] = await db.insert(schema.character).values({
      ownerId,
      creatorId: ownerId,
      characterId: 'default',
      version: '1',
      coverUrl: '',
    }).returning()
    return character
  }

  it('registers once and isolates identical local character keys across accounts', async () => {
    const first = await characterFor('registration-a')
    const second = await characterFor('registration-b')
    const service = createContactService(db)
    const contact = await service.register(first.ownerId, first.id)

    expect(await service.register(first.ownerId, first.id)).toEqual(contact)
    await expect(service.register(second.ownerId, first.id)).rejects.toMatchObject({ statusCode: 404 })
    const otherContact = await service.register(second.ownerId, second.id)
    expect(otherContact.id).not.toBe(contact.id)
    expect(await service.list(first.ownerId)).toEqual([{ ...contact, document: null }])
    expect(await service.list(second.ownerId)).toEqual([{ ...otherContact, document: null }])
  })

  it('returns explicit ownership through create, list, and detail', async () => {
    const character = await characterFor('binding')
    const contact = await createContactService(db).register(character.ownerId, character.id)
    const service = createChatService(db)
    const chat = await service.createChat(character.ownerId, { type: 'bot', contactId: contact.id })

    expect(chat).toMatchObject({ contactId: contact.id, contactOwnerId: character.ownerId })
    expect(await service.listChats(character.ownerId)).toEqual([expect.objectContaining({ contactId: contact.id })])
    const detail = await service.getChat(character.ownerId, chat.id)
    expect(detail.contactId).toBe(contact.id)
    expect(detail.members).toHaveLength(2)
    expect(detail.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ memberType: 'user', userId: character.ownerId }),
      expect.objectContaining({ memberType: 'character', characterId: character.id }),
    ]))
    await expect(service.createChat('intruder', { type: 'bot', contactId: contact.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(service.createChat(character.ownerId, { type: 'group', contactId: contact.id })).rejects.toMatchObject({ statusCode: 400 })
    await expect(service.createChat(character.ownerId, { type: 'bot', contactId: contact.id, members: [] })).rejects.toMatchObject({ statusCode: 400 })
    await expect(service.addMember(character.ownerId, chat.id, { type: 'user', userId: 'intruder' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(service.removeMember(character.ownerId, chat.id, detail.members[0].id)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('deletes all bound direct histories but retains group, unbound, and other-account histories', async () => {
    const character = await characterFor('deletion')
    const otherCharacter = await characterFor('deletion-other')
    const contacts = createContactService(db)
    const chats = createChatService(db)
    const contact = await contacts.register(character.ownerId, character.id)
    const otherContact = await contacts.register(otherCharacter.ownerId, otherCharacter.id)
    const first = await chats.createChat(character.ownerId, { type: 'bot', contactId: contact.id })
    const second = await chats.createChat(character.ownerId, { type: 'bot', contactId: contact.id })
    const group = await chats.createChat(character.ownerId, { type: 'group', members: [{ type: 'character', characterId: character.id }] })
    const unbound = await chats.createChat(character.ownerId, { type: 'bot' })
    const other = await chats.createChat(otherCharacter.ownerId, { type: 'bot', contactId: otherContact.id })
    for (const chat of [first, second, group, unbound, other]) {
      await chats.pushMessages(chat.id === other.id ? otherCharacter.ownerId : character.ownerId, chat.id, [
        { id: `${chat.id}-user`, role: 'user', content: 'hello' },
        { id: `${chat.id}-assistant`, role: 'assistant', content: 'reply' },
      ])
    }

    await expect(contacts.deleteContact('intruder', contact.id)).rejects.toMatchObject({ statusCode: 404 })
    const result = await contacts.deleteContact(character.ownerId, contact.id)
    expect(result.chatIds).toEqual([first.id, second.id].sort())
    expect(result.contact.revision).toBe(2)
    expect(result.contact.deletedAt).toBeInstanceOf(Date)
    expect(await contacts.deleteContact(character.ownerId, contact.id)).toEqual(result)
    expect(await contacts.list(character.ownerId)).toEqual([{ ...result.contact, document: null }])
    for (const chat of [first, second]) {
      const stored = await db.select().from(schema.messages).where(eq(schema.messages.chatId, chat.id))
      expect(stored).toHaveLength(2)
      expect(stored.every(message => message.deletedAt != null)).toBe(true)
      await expect(chats.pullMessages(character.ownerId, chat.id, 0)).rejects.toMatchObject({ statusCode: 404 })
      await expect(chats.pushMessages(character.ownerId, chat.id, [{ id: 'late', role: 'assistant', content: 'late' }])).rejects.toMatchObject({ statusCode: 404 })
    }
    for (const chat of [group, unbound, other]) {
      const result = await chats.pullMessages(chat.id === other.id ? otherCharacter.ownerId : character.ownerId, chat.id, 0)
      expect(result.messages.map(message => message.content)).toEqual(['hello', 'reply'])
    }
    expect((await db.query.character.findFirst({ where: eq(schema.character.id, character.id) }))?.deletedAt).toBeNull()
    await expect(contacts.register(character.ownerId, character.id)).rejects.toMatchObject({ statusCode: 409 })
    await expect(chats.createChat(character.ownerId, { type: 'bot', contactId: contact.id })).rejects.toMatchObject({ statusCode: 404 })
    await expect(chats.createChat(character.ownerId, { type: 'bot', members: [{ type: 'character', characterId: character.id }] })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('enforces complete account-scoped bindings in the database', async () => {
    const character = await characterFor('constraints')
    const contact = await createContactService(db).register(character.ownerId, character.id)
    await expect(db.insert(schema.chats).values({ type: 'bot', contactId: contact.id })).rejects.toThrow()
    await expect(db.insert(schema.chats).values({ type: 'bot', contactId: contact.id, contactOwnerId: 'another-owner' })).rejects.toThrow()
    await expect(db.insert(schema.chats).values({ type: 'group', contactId: contact.id, contactOwnerId: character.ownerId })).rejects.toThrow()
  })

  it('account deletion retains contact tombstones and rejects re-registration', async () => {
    const character = await characterFor('account-deletion')
    const service = createContactService(db)
    const contact = await service.register(character.ownerId, character.id)
    await service.deleteAllForUser(character.ownerId)
    await service.deleteAllForUser(character.ownerId)
    expect(await service.list(character.ownerId)).toEqual([expect.objectContaining({ id: contact.id, revision: 2, deletedAt: expect.any(Date) })])
    await expect(service.register(character.ownerId, character.id)).rejects.toMatchObject({ statusCode: 409 })
  })
})
