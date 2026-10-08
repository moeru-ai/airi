import type { ChatSessionsIndex } from '@proj-airi/stage-ui/types/chat-session'

import type { AudioInputSession } from '../../../src/types'

/**
 * Returns the ID of the AIRI Card that owns one chat session, or undefined when no stored index lists the session.
 *
 * The chat session store saves `ChatSessionsIndex` through unstorage. Its `local` mount uses the idb-keyval driver
 * with the `airi-local` base, so each index is one value in the default `keyval-store` database. The value is read
 * after the store saved it, so a session that the store creates before it begins a voice input is always present.
 *
 * Source: `packages/stage-ui/src/database/storage.ts` and `chatSessionsRepo.saveIndex`.
 */
export async function readSessionCharacterId(runtime: AudioInputSession, sessionId: string): Promise<string | undefined> {
  return runtime.runtimePage.evaluate(sessionIdToFind => new Promise<string | undefined>((resolve, reject) => {
    const opened = indexedDB.open('keyval-store')
    opened.onerror = () => reject(opened.error)
    opened.onsuccess = () => {
      const database = opened.result
      const request = database.transaction('keyval', 'readonly').objectStore('keyval').openCursor()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          database.close()
          resolve(undefined)
          return
        }

        // One key per signed-in user, for example `airi-local:chat:index:local`.
        if (typeof cursor.key === 'string' && cursor.key.startsWith('airi-local:chat:index:')) {
          const index = cursor.value as ChatSessionsIndex
          const owner = Object.entries(index.characters).find(([, character]) => sessionIdToFind in character.sessions)
          if (owner) {
            database.close()
            resolve(owner[0])
            return
          }
        }
        cursor.continue()
      }
    }
  }), sessionId)
}
