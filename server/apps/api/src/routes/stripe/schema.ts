import { minLength, object, optional, pipe, string } from 'valibot'

export const CheckoutBodySchema = object({
  stripePriceId: pipe(string(), minLength(1)),
  currency: optional(string()),
})
