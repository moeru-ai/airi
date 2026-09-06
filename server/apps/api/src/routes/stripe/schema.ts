import { minLength, object, optional, pipe, string } from 'valibot'

export const CheckoutBodySchema = object({
  packKey: pipe(string(), minLength(1)),
  currency: optional(string()),
})
