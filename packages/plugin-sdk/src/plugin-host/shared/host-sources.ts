/** Host payload category owned by one registration lease. */
export type HostSourceKind = 'descriptor' | 'client-factory'

/**
 * Withdraws one exact Host source registration. A stale lease cannot withdraw a replacement.
 *
 * @param TAccepted Immutable payload accepted by the Registry.
 */
export interface HostSourceLease<TAccepted = unknown> {
  /** Immutable payload accepted by the Registry. */
  readonly accepted: TAccepted
  /** Stable Kit identifier. */
  readonly kitId: string
  /** Payload category owned by this lease. */
  readonly sourceKind: HostSourceKind
  /** Withdraws this registration. Returns true only when this lease owns the current source. */
  dispose: () => boolean
}
