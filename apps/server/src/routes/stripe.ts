import type { Env } from '../services/env'
import type { FluxService } from '../services/flux'
import type { HonoEnv } from '../types/hono'

import Stripe from 'stripe'

import { Hono } from 'hono'

import { authGuard } from '../middlewares/auth'

export function createStripeRoutes(fluxService: FluxService, env: Env) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY)
  const routes = new Hono<HonoEnv>()

  routes.post('/checkout', authGuard, async (c) => {
    const user = c.get('user')!
    const { amount } = await c.req.json()

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

  routes.post('/webhook', async (c) => {
    const sig = c.req.header('stripe-signature')
    if (!sig)
      return c.json({ error: 'No signature' }, 400)

    let event: Stripe.Event
    try {
      const body = await c.req.text()
      event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET)
    }
    catch (err: any) {
      return c.json({ error: `Webhook Error: ${err.message}` }, 400)
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.userId
      const amount = session.amount_total

      if (userId && amount) {
        // Example: 1 flux per cent?
        await fluxService.addFlux(userId, amount)
      }
    }

    return c.json({ received: true })
  })

  return routes
}
