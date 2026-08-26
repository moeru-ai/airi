/**
 * Error raised when a module cannot use a requested kit.
 */
export class KitUnavailableError extends Error {
  constructor(
    readonly kitId: string,
    readonly reason: 'incompatible-version' | 'missing-kit' | 'not-ready' | 'permission-denied',
  ) {
    super(`Kit \`${kitId}\` is unavailable: ${reason}.`)
    this.name = 'KitUnavailableError'
  }
}
