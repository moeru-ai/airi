import { check, minLength, object, optional, pipe, string } from 'valibot'

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
