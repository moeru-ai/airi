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
      platform: 'telegram',
      chatId,
      chatName,
    })
    .onConflictDoNothing()
}
