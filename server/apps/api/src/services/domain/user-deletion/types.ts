import type { Logger } from '@guiiai/logg'

/**
 * Reason a user deletion is being requested. Recorded in logs and surfaced
 * to handlers so they can branch (e.g. compliance erase vs. user-initiated).
 *
 * - `user-requested`: triggered by the user via better-auth `/delete-user/callback`.
 * - `admin`: triggered by an admin tool (not yet implemented).
 * - `compliance`: triggered by automated GDPR / data-retention workflow (not yet implemented).
 */
export type UserDeletionReason = 'user-requested' | 'admin' | 'compliance'

/**
 * Context passed to every {@link UserDeletionHandler} invocation.
 *
 * Use when:
 * - Implementing a new business handler — read `userId` to scope your soft-delete writes.
 * - Logging within a handler — use the provided `logger` so entries share the deletion correlation context.
 */
export interface UserDeletionContext {
  /** The user being deleted. Handlers MUST scope their writes to this id. */
  userId: string
  /** Why the deletion was triggered. */
  reason: UserDeletionReason
  /** Pre-scoped logger for handler diagnostics. */
  logger: Logger
}

/**
 * A registered participant in the account-deletion pipeline.
 *
 * Each business module that owns user-scoped tables registers one of these
 * with the {@link UserDeletionService}. Handlers run sequentially in
 * ascending `priority` order; a thrown error aborts the whole pipeline so
 * better-auth's hard-delete of the user row never runs (the user is left
 * intact and the operation can be retried idempotently).
 *
 * @example
 * createUserDeletionService().register({
 *   name: 'flux',
 *   priority: 20,
 *   async softDelete({ userId }) {
 *     await db.update(userFlux).set({ deletedAt: new Date() }).where(eq(userFlux.userId, userId))
 *   },
 * })
 */
export interface UserDeletionHandler {
  /** Stable identifier used for logs, metrics, and duplicate-registration checks. */
  name: string
  /**
   * Lower runs first. Conventions:
   * - 10: external side-effects without rollback (Stripe API cancel)
   * - 20: financial / cache state (Flux balance, Redis invalidation)
   * - 30: pure DB soft-delete (providers, characters, chats)
   *
   * @default 30
   */
  priority: number
  /**
   * Mark business records as deleted. MUST be idempotent — the deletion
   * pipeline retries by re-issuing the entire request, and Stripe / Postgres
   * already deduplicate on subsequent calls. Throw to abort the pipeline.
   */
  softDelete: (ctx: UserDeletionContext) => Promise<void>
}

/**
 * Coordinator for account deletion across business modules.
 *
 * Use when:
 * - Wiring better-auth's `user.deleteUser.beforeDelete` hook in `libs/auth.ts`.
 * - Implementing an admin-triggered deletion path (future).
 *
 * Expects:
 * - All handlers are registered at app-composition time before the first
 *   request hits `beforeDelete`. Late registration is allowed but discouraged.
 */
export interface UserDeletionService {
  /**
   * Register a handler. Throws if `handler.name` is already registered —
   * names must be unique so logs and metrics can attribute work cleanly.
   */
  register: (handler: UserDeletionHandler) => void
  /**
   * Run every registered handler in priority order. Returns when all
   * handlers complete, or throws the first handler error and stops.
   */
  softDeleteAll: (input: { userId: string, reason: UserDeletionReason }) => Promise<void>
}
