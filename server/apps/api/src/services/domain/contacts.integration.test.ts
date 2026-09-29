import { readFile } from 'node:fs/promises'
import { env } from 'node:process'
import { setTimeout } from 'node:timers/promises'

import pg from 'pg'

import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createChatService } from './chats'
import { createContactService } from './contacts'

import * as schema from '../../schemas'

const connectionString = env.CONTACT_TEST_DATABASE_URL

describe.skipIf(!connectionString)('contact migration and PostgreSQL lock ordering', () => {
  const pool = new pg.Pool({ connectionString, application_name: 'airi-contact-regression', max: 5 })
  const db = drizzle(pool, { schema })

  beforeAll(async () => {
    const target = new URL(connectionString!)
    if (target.hostname !== '127.0.0.1' || target.pathname !== '/airi_contacts_test')
      throw new Error('Use a disposable loopback database named airi_contacts_test')

    await pool.query(`
      CREATE TABLE characters (id text PRIMARY KEY, owner_id text NOT NULL, deleted_at timestamp);
      CREATE TABLE chats (
        id text PRIMARY KEY, type text NOT NULL, title text,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(), deleted_at timestamp
      );
      CREATE TABLE chat_members (
        id text PRIMARY KEY, chat_id text NOT NULL REFERENCES chats(id),
        member_type text NOT NULL, user_id text, character_id text
      );
      CREATE TABLE messages (
        id text PRIMARY KEY, chat_id text NOT NULL REFERENCES chats(id), sender_id text,
        role text NOT NULL, seq integer, content text NOT NULL,
        media_ids text[] NOT NULL, sticker_ids text[] NOT NULL,
        reply_message_id text, forward_from_message_id text,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(), deleted_at timestamp
      );
      INSERT INTO characters (id, owner_id) VALUES ('character', 'owner');
      INSERT INTO chats (id, type) VALUES ('legacy', 'bot');
      INSERT INTO chat_members VALUES ('legacy-owner', 'legacy', 'user', 'owner', null);
      INSERT INTO messages (id, chat_id, sender_id, role, seq, content, media_ids, sticker_ids)
        VALUES ('legacy-message', 'legacy', 'owner', 'user', 7, 'existing history', '{}', '{}');
    `)
    const migration = await readFile(new URL('../../../drizzle/0027_contact_ownership.sql', import.meta.url), 'utf8')
    await pool.query(migration)
    const privateMigration = await readFile(new URL('../../../drizzle/0028_private_character_documents.sql', import.meta.url), 'utf8')
    await pool.query(privateMigration)
  })

  afterAll(async () => {
    await pool.end()
  })

  async function waitForBlockedQueries(count: number) {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const result = await pool.query<{ count: number }>(`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE application_name = 'airi-contact-regression' AND wait_event_type = 'Lock'
      `)
      if (result.rows[0].count >= count)
        return
      await setTimeout(10)
    }
    throw new Error(`Expected ${count} blocked database queries`)
  }

  it('preserves existing message identities, sequences, and unbound ownership', async () => {
    const chats = await db.query.chats.findMany()
    const messages = await db.query.messages.findMany()
    expect(chats).toEqual([expect.objectContaining({ id: 'legacy', contactId: null, contactOwnerId: null, deletedAt: null })])
    expect(messages).toEqual([expect.objectContaining({ id: 'legacy-message', chatId: 'legacy', seq: 7, content: 'existing history', deletedAt: null })])
    expect(await createContactService(db).list('owner')).toEqual([])
  })

  // ROOT CAUSE:
  // Authorization previously ran before the row lock. A waiting writer accepted
  // a deleted chat after the deleting transaction committed. Locking the active
  // chat during authorization makes PostgreSQL recheck the deletion predicate.
  it('rejects a message that waits behind a concurrent chat deletion', async () => {
    const blocker = await pool.connect()
    try {
      await blocker.query('BEGIN')
      await blocker.query('UPDATE chats SET deleted_at = now() WHERE id = \'legacy\'')
      const rejected = expect(createChatService(db).pushMessages('owner', 'legacy', [
        { id: 'late-message', role: 'assistant', content: 'must not persist' },
      ])).rejects.toMatchObject({ statusCode: 404 })
      await waitForBlockedQueries(1)
      await blocker.query('COMMIT')
      await rejected
      const messages = await db.query.messages.findMany()
      expect(messages.map(message => message.id)).toEqual(['legacy-message'])
    }
    finally {
      await blocker.query('ROLLBACK')
      blocker.release()
    }
  })

  it('serializes new direct chat creation behind contact deletion', async () => {
    const contacts = createContactService(db)
    const chats = createChatService(db)
    const contact = await contacts.register('owner', 'character')
    const chat = await chats.createChat('owner', { type: 'bot', contactId: contact.id })
    const blocker = await pool.connect()
    try {
      await blocker.query('BEGIN')
      await blocker.query('SELECT id FROM chats WHERE id = $1 FOR UPDATE', [chat.id])
      const deletion = contacts.deleteContact('owner', contact.id)
      await waitForBlockedQueries(1)
      const rejected = expect(chats.createChat('owner', { type: 'bot', contactId: contact.id }))
        .rejects
        .toMatchObject({ statusCode: 404 })
      await waitForBlockedQueries(2)
      await blocker.query('COMMIT')
      const result = await deletion
      await rejected
      expect(result.chatIds).toEqual([chat.id])
      expect(result.contact.revision).toBe(2)
      expect(await chats.listChats('owner')).toEqual([])
      expect(await contacts.deleteContact('owner', contact.id)).toEqual(result)
    }
    finally {
      await blocker.query('ROLLBACK')
      blocker.release()
    }
  })
})
