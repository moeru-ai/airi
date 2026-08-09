import { useDrizzle } from '../db'
import { chatCompletionsHistoryTable } from '../db/schema'

export async function recordChatCompletions(task: string, content: any, response?: any) {
  const db = useDrizzle()

  await db
    .insert(chatCompletionsHistoryTable)
    .values({
      prompt: JSON.stringify(content),
      response: JSON.stringify(response),
      task,
    })
}
