import type { Env } from '../libs/env'
import type { FluxService } from '../services/flux'
import type { HonoEnv } from '../types/hono'

import Stripe from 'stripe'

import { Hono } from 'hono'
import { integer, minValue, number, object, pipe, safeParse } from 'valibot'

import { authGuard } from '../middlewares/auth'
import { createBadRequestError, createServiceUnavailableError } from '../utils/error'

const CheckoutBodySchema = object({
  amount: pipe(number(), integer(), minValue(1)),
})

export function createStripeRoutes(fluxService: FluxService, env: Env) {
  const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null

  return new Hono<HonoEnv>()
    .post('/checkout', authGuard, async (c) => {
      if (!stripe)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

      const user = c.get('user')!
      const body = await c.req.json()

      const result = safeParse(CheckoutBodySchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid checkout amount', 'INVALID_REQUEST', result.issues)

      const { amount } = result.output

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Flux Top-up',
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${env.CLIENT_URL}/settings/flux?success=true`,
        cancel_url: `${env.CLIENT_URL}/settings/flux?canceled=true`,
        customer_email: user.email,
        metadata: {
          userId: user.id,
        },
      })

      return c.json({ url: session.url })
    })
    .post('/webhook', async (c) => {
      if (!stripe || !env.STRIPE_WEBHOOK_SECRET)
        throw createServiceUnavailableError('Stripe is not configured', 'STRIPE_NOT_CONFIGURED')

      const sig = c.req.header('stripe-signature')
      if (!sig)
        throw createBadRequestError('No signature', 'MISSING_SIGNATURE')

      let event: Stripe.Event
      try {
        const body = await c.req.text()
        event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET)
      }
      catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        throw createBadRequestError(`Webhook Error: ${message}`, 'WEBHOOK_ERROR')
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object
        const userId = session.metadata?.userId
        const amount = session.amount_total

        if (userId && amount) {
          await fluxService.addFlux(userId, amount * env.FLUX_PER_CENT)

          if (session.customer) {
            const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
            await fluxService.updateStripeCustomerId(userId, customerId)
          }
        }
      }

      return c.json({ received: true })
    })
}
