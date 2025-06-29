import { env } from 'node:process'

import pLimit from 'p-limit'

import { embed } from '@xsai/embed'
import { eq, isNull } from 'drizzle-orm'
import { chunk } from 'es-toolkit'

import { initDb, useDrizzle } from '../src/db'
import { chatMessagesTable } from '../src/db/schema'

async function main() {
  await initDb()
  const db = useDrizzle()

  // Configuration
  const WORKER_POOL_SIZE = env.WORKER_POOL_SIZE ? Number.parseInt(env.WORKER_POOL_SIZE) : 50
  const BATCH_SIZE = env.BATCH_SIZE ? Number.parseInt(env.BATCH_SIZE) : 10

  console.log(`Starting embedding with worker pool size: ${WORKER_POOL_SIZE}, batch size: ${BATCH_SIZE}`)

  // Create a concurrency limiter
  const limit = pLimit(WORKER_POOL_SIZE)

  let messages: typeof chatMessagesTable.$inferSelect[] = []

  switch (env.EMBEDDING_DIMENSION) {
    case '1536':
      messages = await db.query.chatMessagesTable.findMany({
        where(fields) {
          return isNull(fields.content_vector_1536)
        },
      })
      break
    case '1024':
      messages = await db.query.chatMessagesTable.findMany({
        where(fields) {
          return isNull(fields.content_vector_1024)
        },
      })
      break
    case '768':
      messages = await db.query.chatMessagesTable.findMany({
        where(fields) {
          return isNull(fields.content_vector_768)
        },
      })
      break
    default:
      throw new Error(`Unsupported embedding dimension: ${env.EMBEDDING_DIMENSION}`)
  }

  // Split messages into batches
  const batches = chunk(messages, BATCH_SIZE)
  // Process each batch with worker pool
  const processedCount = { success: 0, error: 0 }

  for (const batch of batches) {
    await limit(async () => {
      const embedPromises = batch.map(async (message) => {
        try {
          const embeddingRes = await embed({
            baseURL: env.EMBEDDING_API_BASE_URL!,
            apiKey: env.EMBEDDING_API_KEY!,
            model: env.EMBEDDING_MODEL!,
            input: message.content,
          })

          switch (env.EMBEDDING_DIMENSION) {
            case '1536':
              await db
                .update(chatMessagesTable)
                .set({ content_vector_1536: embeddingRes.embedding })
                .where(eq(chatMessagesTable.id, message.id))
              break
            case '1024':
              await db
                .update(chatMessagesTable)
                .set({ content_vector_1024: embeddingRes.embedding })
                .where(eq(chatMessagesTable.id, message.id))
              break
            case '768':
              await db
                .update(chatMessagesTable)
                .set({ content_vector_768: embeddingRes.embedding })
                .where(eq(chatMessagesTable.id, message.id))
              break
            default:
              throw new Error(`Unsupported embedding dimension: ${env.EMBEDDING_DIMENSION}`)
          }

          processedCount.success++

          // Optional progress logging
          if (processedCount.success % 100 === 0) {
            console.log(`Processed ${processedCount.success} messages so far`)
          }
        }
        catch (error) {
          processedCount.error++
          console.error(`Error embedding message ${message.id}:`, error)
        }
      })

      await Promise.all(embedPromises)
    })
  }
}

main().then(() => {
  console.log('Done')
}).catch((err) => {
  console.error(err)
})
