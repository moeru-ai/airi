/**
 * Error raised when a module cannot use a requested kit.
 */
export class KitUnavailableError extends Error {
  constructor(
    readonly kitId: string,
    readonly reason: 'missing-kit' | 'permission-denied' | 'incompatible-version' | 'not-ready',
  ) {
    super(`Kit \`${kitId}\` is unavailable: ${reason}.`)
    this.name = 'KitUnavailableError'
  }
}
