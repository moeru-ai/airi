import { check, minLength, object, optional, pipe, string } from 'valibot'

// NOTICE:
// Previous-version clients send stripePriceId. Current clients send packKey.
// Checkout accepts exactly one of these fields so both clients can open a session.
// Remove stripePriceId after previous-version clients ship packKey.
export const CheckoutBodySchema = pipe(
  object({
    packKey: optional(pipe(string(), minLength(1))),
    stripePriceId: optional(pipe(string(), minLength(1))),
    currency: optional(string()),
  }),
  check(
    (value) => {
      const selected = [value.packKey, value.stripePriceId].filter(Boolean)
      return selected.length === 1
    },
    'Provide exactly one of packKey or stripePriceId',
  ),
)
