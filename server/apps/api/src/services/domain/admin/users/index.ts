import type { Database } from '../../../../libs/db'
import type { BillingService } from '../../billing/billing-service'
import type { UserSelector } from '../../users/resolve-user'

import { useLogger } from '@guiiai/logg'

import { resolveUserByIdOrEmail } from '../../users/resolve-user'

const logger = useLogger('admin-users').useGlobalConfig()

export interface SetBalanceInput extends UserSelector {
  /** Target absolute balance. Non-negative integer; the route validates this. */
  balance: number
  /** Audit description stored on the ledger row. */
  description: string
  /** Admin user id issuing the change. */
  issuedByUserId: string
}

export interface SetBalanceResult {
  userId: string
  email: string
  balanceBefore: number
  balanceAfter: number
  fluxTransactionId: string
}

/**
 * Admin operations that target a single user by id or email.
 *
 * Balance overrides go through {@link BillingService.setFlux} so the write +
 * ledger stay in one place; this service only resolves the selector to a
 * concrete user before delegating.
 */
export function createAdminUsersService(deps: { db: Database, billingService: BillingService }) {
  const { db, billingService } = deps

  return {
    /**
     * Set a user's flux balance to an absolute value (including 0).
     *
     * Use when:
     * - An admin overrides a balance, e.g. zeroing it for testing.
     *
     * Returns:
     * - The resolved user plus the before/after balance and ledger row id.
     */
    async setBalance(input: SetBalanceInput): Promise<SetBalanceResult> {
      const target = await resolveUserByIdOrEmail(db, input)

      const { balanceBefore, balanceAfter, fluxTransactionId } = await billingService.setFlux({
        userId: target.id,
        balance: input.balance,
        description: input.description,
        issuedByUserId: input.issuedByUserId,
      })

      logger.withFields({
        userId: target.id,
        email: target.email,
        balanceBefore,
        balanceAfter,
        issuedByUserId: input.issuedByUserId,
      }).log('Admin set balance')

      return { userId: target.id, email: target.email, balanceBefore, balanceAfter, fluxTransactionId }
    },
  }
}

export type AdminUsersService = ReturnType<typeof createAdminUsersService>
