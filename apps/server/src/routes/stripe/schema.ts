import { integer, minValue, number, object, pipe } from 'valibot'

export const CheckoutBodySchema = object({
  amount: pipe(number(), integer(), minValue(1)),
})
