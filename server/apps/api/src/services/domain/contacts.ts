import type { PutCharacterDocument } from '@proj-airi/server-sdk-shared/contacts'

import type { Database } from '../../libs/db'

import { CharacterDocumentSchema, PutCharacterDocumentSchema } from '@proj-airi/server-sdk-shared/contacts'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { isEqual } from 'es-toolkit'
import { parse } from 'valibot'

import { character } from '../../schemas/characters'
import { chatMembers, chats, messages } from '../../schemas/chats'
import { characterDocuments, contacts } from '../../schemas/contacts'
import { createBadRequestError, createConflictError, createNotFoundError } from '../../utils/error'

/** Owns contact registration and irreversible, retry-safe deletion of its direct chats. */
export function createContactService(db: Database) {
  /** Imports only exact single-user, single-character bot memberships. Ambiguous histories remain unbound. */
  async function bindLegacyHistories(tx: Parameters<Parameters<Database['transaction']>[0]>[0], contact: typeof contacts.$inferSelect, legacyId: string) {
    const bound = await tx.update(chats).set({ contactId: contact.id, contactOwnerId: contact.ownerId }).where(and(
      eq(chats.type, 'bot'),
      isNull(chats.contactId),
      isNull(chats.deletedAt),
      sql`(SELECT count(*) FROM chat_members WHERE chat_id = ${chats.id} AND member_type = 'user') = 1`,
      sql`EXISTS (SELECT 1 FROM chat_members WHERE chat_id = ${chats.id} AND member_type = 'user' AND user_id = ${contact.ownerId})`,
      sql`(SELECT count(*) FROM chat_members WHERE chat_id = ${chats.id} AND member_type <> 'user') = 1`,
      sql`EXISTS (SELECT 1 FROM chat_members WHERE chat_id = ${chats.id} AND member_type <> 'user' AND character_id = ${legacyId})`,
    )).returning({ id: chats.id })
    if (bound.length > 0) {
      await tx.update(chatMembers).set({ characterId: contact.characterId }).where(and(inArray(chatMembers.chatId, bound.map(chat => chat.id)), eq(chatMembers.characterId, legacyId)))
    }
  }

  async function deleteOwnedContact(tx: Parameters<Parameters<Database['transaction']>[0]>[0], ownerId: string, contactId: string, allowBuiltin = false) {
    const [contact] = await tx.select().from(contacts).where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, contactId))).for('update')
    if (!contact)
      throw createNotFoundError('Contact not found')
    if (contact.localCharacterId === 'default' && !allowBuiltin)
      throw createBadRequestError('The built-in character cannot be deleted')

    const boundChats = await tx.select({ id: chats.id }).from(chats).where(and(eq(chats.contactOwnerId, ownerId), eq(chats.contactId, contactId))).orderBy(chats.id).for('update')
    const chatIds = boundChats.map(chat => chat.id)
    if (contact.deletedAt)
      return { contact, chatIds }

    const now = new Date()
    if (chatIds.length > 0) {
      await tx.update(chats).set({ deletedAt: now, updatedAt: now }).where(and(inArray(chats.id, chatIds), isNull(chats.deletedAt)))
      await tx.update(messages).set({ deletedAt: now, updatedAt: now }).where(and(inArray(messages.chatId, chatIds), isNull(messages.deletedAt)))
    }
    if (contact.localCharacterId !== null) {
      await tx.delete(characterDocuments).where(eq(characterDocuments.characterId, contact.characterId))
      await tx.update(character).set({ deletedAt: now, updatedAt: now }).where(and(eq(character.id, contact.characterId), eq(character.ownerId, ownerId), eq(character.isPrivate, true)))
    }
    const [deleted] = await tx.update(contacts)
      .set({ deletedAt: now, updatedAt: now, revision: sql`${contacts.revision} + 1` })
      .where(eq(contacts.id, contactId))
      .returning()
    return { contact: deleted, chatIds }
  }

  async function deleteContact(ownerId: string, contactId: string) {
    return db.transaction(tx => deleteOwnedContact(tx, ownerId, contactId))
  }

  return {
    /** Persists deletion by local identity even when an earlier import response was lost. */
    async deleteCharacter(ownerId: string, localCharacterId: string) {
      if (localCharacterId === 'default')
        throw createBadRequestError('The built-in character cannot be deleted')
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([ownerId, localCharacterId])}, 0))`)
        const [existing] = await tx.select().from(contacts).where(and(eq(contacts.ownerId, ownerId), eq(contacts.localCharacterId, localCharacterId)))
        if (existing)
          return deleteOwnedContact(tx, ownerId, existing.id)
        const [definition] = await tx.insert(character).values({
          ownerId,
          creatorId: ownerId,
          characterId: localCharacterId,
          version: '1.0.0',
          coverUrl: '',
          isPrivate: true,
        }).returning()
        const [contact] = await tx.insert(contacts).values({ ownerId, characterId: definition.id, localCharacterId }).returning()
        await bindLegacyHistories(tx, contact, localCharacterId)
        return deleteOwnedContact(tx, ownerId, contact.id)
      })
    },

    async putCharacter(ownerId: string, localCharacterId: string, input: PutCharacterDocument) {
      const command = parse(PutCharacterDocumentSchema, input)
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([ownerId, localCharacterId])}, 0))`)
        const [existing] = await tx.select().from(contacts).where(and(eq(contacts.ownerId, ownerId), eq(contacts.localCharacterId, localCharacterId))).for('update')
        if (existing) {
          if (existing.deletedAt)
            throw createConflictError('Contact was deleted')
          const [stored] = await tx.select().from(characterDocuments).where(eq(characterDocuments.characterId, existing.characterId))
          if (!stored)
            throw createConflictError('Private character definition is missing')
          const document = parse(CharacterDocumentSchema, stored.document)
          if (existing.lastMutationId === command.mutationId) {
            if (!isEqual(document, command.document))
              throw createConflictError('Mutation identity already used for another definition')
            return { ...existing, document }
          }
          if (existing.revision !== command.expectedRevision)
            throw createConflictError('Character revision changed')
          await tx.update(characterDocuments).set({ document: command.document }).where(eq(characterDocuments.characterId, existing.characterId))
          await tx.update(character).set({ version: command.document.version, updatedAt: new Date() }).where(eq(character.id, existing.characterId))
          const [updated] = await tx.update(contacts).set({
            revision: existing.revision + 1,
            lastMutationId: command.mutationId,
            updatedAt: new Date(),
          }).where(eq(contacts.id, existing.id)).returning()
          return { ...updated, document: command.document }
        }
        if (command.expectedRevision !== 0)
          throw createConflictError('Character is not registered')
        const [definition] = await tx.insert(character).values({
          ownerId,
          creatorId: ownerId,
          characterId: localCharacterId,
          version: command.document.version,
          coverUrl: '',
          isPrivate: true,
        }).returning()
        await tx.insert(characterDocuments).values({ characterId: definition.id, document: command.document })
        const [contact] = await tx.insert(contacts).values({
          ownerId,
          characterId: definition.id,
          localCharacterId,
          lastMutationId: command.mutationId,
        }).returning()
        await bindLegacyHistories(tx, contact, localCharacterId)
        return { ...contact, document: command.document }
      })
    },

    async register(ownerId: string, characterId: string) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([ownerId, characterId])}, 0))`)
        const [definition] = await tx.select({ id: character.id }).from(character).where(and(eq(character.id, characterId), eq(character.ownerId, ownerId), eq(character.isPrivate, false), isNull(character.deletedAt))).for('update')
        if (!definition)
          throw createNotFoundError('Character not found')

        await tx.insert(contacts).values({ ownerId, characterId }).onConflictDoNothing({
          target: [contacts.ownerId, contacts.characterId],
        })
        const [contact] = await tx.select().from(contacts).where(and(eq(contacts.ownerId, ownerId), eq(contacts.characterId, characterId))).for('update')
        if (contact.deletedAt)
          throw createConflictError('Contact was deleted')
        await bindLegacyHistories(tx, contact, characterId)
        return contact
      })
    },

    async list(ownerId: string) {
      const rows = await db.select({ contact: contacts, document: characterDocuments.document }).from(contacts).leftJoin(characterDocuments, eq(characterDocuments.characterId, contacts.characterId)).where(eq(contacts.ownerId, ownerId)).orderBy(contacts.id)
      return rows.map(({ contact, document }) => ({
        ...contact,
        document: document === null ? null : parse(CharacterDocumentSchema, document),
      }))
    },

    deleteContact,

    async deleteAllForUser(ownerId: string) {
      const owned = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.ownerId, ownerId)).orderBy(contacts.id)
      for (const contact of owned)
        await db.transaction(tx => deleteOwnedContact(tx, ownerId, contact.id, true))
    },
  }
}

export type ContactService = ReturnType<typeof createContactService>
