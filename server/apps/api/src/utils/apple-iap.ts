/**
 * Namespace UUID used to derive a deterministic `appAccountToken` from the
 * authenticated user id via uuid v5.
 *
 * The iOS client derives the same token before StoreKit purchase. Do not rotate
 * this value without a coordinated client and server release.
 */
export const APPLE_IAP_NAMESPACE_UUID = 'f4e8a0c2-2c6b-4e1b-b2a5-6d7f3b5a8c91' as const
