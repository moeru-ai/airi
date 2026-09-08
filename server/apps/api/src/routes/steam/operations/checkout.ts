import type { Database } from '../../../libs/db'
import type { Env } from '../../../libs/env'
import type { ConfigKVService } from '../../../services/adapters/config-kv'
import type { PaymentService } from '../../../services/domain/payment'
import type { SteamMicroTxnClient } from '../client'

import { randomInt } from 'node:crypto'

import { minLength, object, pipe, safeParse, string } from 'valibot'

import { createBadRequestError, createServiceUnavailableError } from '../../../utils/error'
import { resolveCheckoutRedirectBase } from '../../../utils/origin'
import { findLinkedSteamId } from '../linked-steam-id'

const CheckoutBodySchema = object({
  packKey: pipe(string(), minLength(1)),
})

/**
 * Opens a pending order through Payment CORE, then calls Steam InitTxn.
 *
 * `{ packKey }` resolves a Flux pack with `processors.steam`. Returns the Steam
 * checkout URL so the caller can open it in a browser.
 */
export function createCheckoutOperation(
  payment: PaymentService,
  db: Database,
  client: SteamMicroTxnClient | null,
  configKV: ConfigKVService,
  env: Pick<Env, 'WEB_APP_URL' | 'ADDITIONAL_TRUSTED_ORIGINS'>,
) {
  return async (
    user: { id: string },
    body: unknown,
    request: Request,
  ): Promise<{ orderId: string, url: string }> => {
    if (!client)
      throw createServiceUnavailableError('Steam MicroTxn is not configured', 'STEAM_MICROTXN_DISABLED')

    const parsed = safeParse(CheckoutBodySchema, body)
    if (!parsed.success)
      throw createBadRequestError('Invalid checkout request', 'INVALID_REQUEST', parsed.issues)

    const { packKey } = parsed.output
    const packs = await configKV.getOptional('FLUX_PACKS') ?? []
    const pack = packs.find(item => item.key === packKey)
    if (!pack)
      throw createBadRequestError('Invalid pack', 'INVALID_PACKAGE', { packKey })

    const steamPack = pack.processors?.steam
    if (!steamPack)
      throw createServiceUnavailableError('Steam pack mapping is missing', 'STEAM_PACK_NOT_MAPPED', { packKey })

    const steamId = await findLinkedSteamId(db, user.id)
    if (!steamId)
      throw createBadRequestError('Steam account is not linked', 'STEAM_ACCOUNT_NOT_LINKED')

    // InitTxn needs the payer IP; Caddy/Railway put it in these headers.
    const ipAddress = request.headers.get('x-real-ip')?.trim()
      || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    if (!ipAddress)
      throw createBadRequestError('Client IP is required', 'STEAM_CLIENT_IP_REQUIRED')
    // Steam InitTxn `orderid` is a uint64. `payment_order.id` is a nanoid.
    // `randomInt` range must be less than 2^48.
    const orderId = String(randomInt(1, 2 ** 48))

    const order = await payment.openPending({
      userId: user.id,
      processor: 'steam',
      packKey: pack.key,
      fluxAmount: pack.fluxAmount,
      currency: steamPack.currency,
    })

    const redirectBase = resolveCheckoutRedirectBase(request, env.ADDITIONAL_TRUSTED_ORIGINS, env.WEB_APP_URL)
    const returnUrl = `${redirectBase}/settings/flux?steam_order=${orderId}`

    let steamUrl: string
    try {
      const created = await client.initTxn({
        orderId,
        steamId,
        itemId: steamPack.itemId,
        amount: steamPack.amount,
        currency: steamPack.currency,
        description: pack.name,
        ipAddress,
      })
      steamUrl = created.steamUrl
    }
    catch (error) {
      await payment.abandon(order.id)
      throw error
    }

    await payment.bindProcessorOrder(order.id, {
      processorOrderId: orderId,
      amount: steamPack.amount,
      currency: steamPack.currency,
    })

    const checkoutUrl = new URL(steamUrl)
    checkoutUrl.searchParams.set('returnurl', returnUrl)
    return { orderId, url: checkoutUrl.toString() }
  }
}
