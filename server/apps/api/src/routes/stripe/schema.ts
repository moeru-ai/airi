import { minLength, object, optional, pipe, string } from 'valibot'

export const CheckoutBodySchema = object({
  currency: optional(string()),
  stripePriceId: pipe(string(), minLength(1)),
})
