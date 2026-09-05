import type { Database } from '../../libs/db'

import { account } from '@proj-airi/auth-shared'
import { and, eq } from 'drizzle-orm'

export async function findLinkedSteamId(db: Database, userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(
      eq(account.userId, userId),
      eq(account.providerId, 'steam'),
    ))
    .limit(1)

  return row?.accountId
}
