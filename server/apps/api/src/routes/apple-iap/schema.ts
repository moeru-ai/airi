import { minLength, object, pipe, string } from 'valibot'

/**
 * Body for `POST /api/v1/apple-iap/transactions`.
 *
 * The client sends StoreKit 2 `verification.jwsRepresentation`.
 */
export const SubmitTransactionBodySchema = object({
  signedTransaction: pipe(string(), minLength(1, 'signedTransaction is required')),
})
