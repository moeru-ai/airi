/** Why a Kit is not available to a consumer scope. */
export type KitUnavailableReason = 'missing-kit' | 'permission-denied' | 'incompatible-version' | 'not-ready'

/**
 * Error raised when a module cannot use a requested kit.
 */
export class KitUnavailableError extends Error {
  constructor(
    readonly kitId: string,
    readonly reason: KitUnavailableReason,
    readonly detail?: string,
  ) {
    super(`Kit \`${kitId}\` is unavailable: ${reason}.${detail ? ` ${detail}` : ''}`)
    this.name = 'KitUnavailableError'
  }
}
