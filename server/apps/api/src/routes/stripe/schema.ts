import { minLength, object, optional, pipe, string } from 'valibot'

export const CheckoutBodySchema = object({
  packKey: optional(pipe(string(), minLength(1))),
  // NOTICE: compatibility field for previous-version clients. Current clients send packKey.
  stripePriceId: optional(pipe(string(), minLength(1))),
  currency: optional(string()),
})
