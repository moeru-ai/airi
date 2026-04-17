import type { Account } from 'better-auth'

import { ref } from 'vue'

// NOTICE:
// These shared refs and the reset function live in their own module so the
// auth layer (`libs/auth.ts`) can call the reset without importing the full
// `use-account-management` composable. The composable transitively depends
// on `libs/auth.ts` (it pulls in `authClient`, `signOut`, etc.), so a direct
// import in the other direction would form a circular module graph that
// only works by accident (lazy ESM bindings + no top-level cross-reads).
//
// Splitting them keeps the dependency graph one-way:
//
//   libs/auth.ts                     ──> use-account-management-state.ts
//   composables/use-account-management.ts ──> libs/auth.ts
//   composables/use-account-management.ts ──> use-account-management-state.ts
//
// Removal condition: only if the composable stops depending on `libs/auth.ts`,
// at which point the refs and reset can move back inline.

/**
 * Loading flag shared by every `useAccountManagement()` consumer.
 *
 * Use when:
 * - Reading the in-flight state of any account-management operation.
 *
 * Expects:
 * - Mutated only by the composable itself (and by {@link resetAccountManagementState}).
 */
export const sharedLoading = ref(false)

/**
 * Last error message produced by an account-management operation.
 *
 * Use when:
 * - Surfacing a single error banner that reflects the latest failure across
 *   any of the account-management calls (load, link, unlink, change-email...).
 *
 * Expects:
 * - Mutated only by the composable itself (and by {@link resetAccountManagementState}).
 */
export const sharedError = ref<string | null>(null)

/**
 * Linked-account list shared across every `useAccountManagement()` caller.
 *
 * Use when:
 * - Reading the current set of linked providers (credential, google, github...)
 *   in any settings UI.
 *
 * Expects:
 * - Populated by `loadAccounts()` inside the composable.
 * - Mutated only by the composable itself (and by {@link resetAccountManagementState}).
 */
export const sharedAccounts = ref<Account[]>([])

/**
 * Clear the module-scoped account management state.
 *
 * Use when:
 * - The user signs out, so the next sign-in does not see the previous
 *   account's `accounts` list, half-loaded `loading` flag, or stale `error`.
 * - The active user id changes (account switching, OIDC identity bridge),
 *   which would otherwise render the prior user's linked providers in the
 *   new session's settings UI.
 *
 * Expects:
 * - Caller decides when to invoke this. The state module does not subscribe
 *   to the auth store on its own — the wiring lives in `libs/auth.ts` so
 *   the dependency graph stays one-way.
 *
 * Returns:
 * - Nothing. Resets `accounts` to `[]`, `loading` to `false`, `error` to `null`.
 */
export function resetAccountManagementState(): void {
  sharedAccounts.value = []
  sharedLoading.value = false
  sharedError.value = null
}
