import type { Database } from '../../../libs/db'
import type { Verifier } from '../verifier'

import { createInternalError } from '../../../utils/error'
import { APPLE_IAP_PROCESSOR, findLiveAccount, requireVerifier } from '../evidence'

import * as schema from '../../../schemas/payment'

/**
 * Returns the stored UUID for this user, or inserts one.
 * The UUID stays stable so an in-flight Ask to Buy still binds after a later tap.
 */
export function createAccountTokenOperation(
  db: Database,
  verifier: Verifier | null,
) {
  return async (userId: string): Promise<{ appAccountToken: string }> => {
    requireVerifier(verifier)

    const existing = await findLiveAccount(db, { userId })
    if (existing)
      return { appAccountToken: existing.customerId }

    const appAccountToken = crypto.randomUUID()
    await db.insert(schema.paymentCustomer).values({
      userId,
      processor: APPLE_IAP_PROCESSOR,
      customerId: appAccountToken,
    }).onConflictDoNothing()

    const row = await findLiveAccount(db, { userId })
    if (!row)
      throw createInternalError('Failed to issue Apple IAP account token')

    return { appAccountToken: row.customerId }
  }
}
