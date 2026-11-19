import type { Database } from '../../../libs/db'

import { userFlux } from '../../../schemas/flux'
import { fluxTransaction } from '../../../schemas/flux-transaction'

/** Creates the wallet and its initial grant once inside the caller's transaction. */
export async function initializeWallet(tx: Pick<Database, 'insert'>, userId: string, initialFlux: number): Promise<void> {
  const [inserted] = await tx.insert(userFlux)
    .values({ userId, flux: initialFlux })
    .onConflictDoNothing({ target: userFlux.userId })
    .returning()
  if (!inserted)
    return
  await tx.insert(fluxTransaction).values({
    userId,
    type: 'initial',
    amount: initialFlux,
    balanceBefore: 0,
    balanceAfter: initialFlux,
    description: 'Initial grant',
  })
}
