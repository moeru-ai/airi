import { eq } from 'drizzle-orm'

import { useDrizzle } from '../db'
import { joinedChatsTable } from '../db/schema'

export async function listJoinedChats() {
  return await useDrizzle()
    .select()
    .from(joinedChatsTable)
    .where(eq(joinedChatsTable.platform, 'telegram'))
    .limit(20)
}

export async function recordJoinedChat(chatId: string, chatName: string) {
  return useDrizzle()
    .insert(joinedChatsTable)
    .values({
      chat_id: chatId,
      chat_name: chatName,
      platform: 'telegram',
    })
    .onConflictDoUpdate({
      set: {
        chat_name: chatName,
        updated_at: Date.now(),
      },
      target: joinedChatsTable.chat_id,
    })
}
