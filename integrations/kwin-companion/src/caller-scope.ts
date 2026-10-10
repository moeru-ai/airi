/** The D-Bus adapter resolves these fields from the bus daemon, never from request payloads. */
export interface BusPeer {
  uniqueOwner: string
  uid: number
  pid: number
}

/** The parent verifies process birth identities. A PID alone cannot survive process exit and reuse. */
export interface ProcessIdentity {
  pid: number
  birthId: string
}

/**
 * A scope remains revoked after any owner or parent change. Reconnection requires a new explicit session.
 * Other scripts inside KWin share its bus identity. They are inside the compositor trust boundary.
 */
export class CallerScope {
  private active = true
  private readonly owner: BusPeer
  private readonly process: ProcessIdentity

  constructor(owner: BusPeer, process: ProcessIdentity) {
    if (!/^:\d+\.\d+$/.test(owner.uniqueOwner) || !Number.isSafeInteger(owner.uid) || owner.uid < 0
      || !Number.isSafeInteger(owner.pid) || owner.pid <= 0
      || !Number.isSafeInteger(process.pid) || process.pid <= 0 || !process.birthId) {
      throw new Error('Invalid trusted session identity')
    }
    this.owner = { ...owner }
    this.process = { ...process }
  }

  accepts(peer: BusPeer): boolean {
    return this.active && peer.uniqueOwner === this.owner.uniqueOwner
      && peer.uid === this.owner.uid && peer.pid === this.owner.pid
  }

  /** The helper watches org.kde.KWin ownership. Even the same PID with a new bus owner revokes this scope. */
  ownerChanged(uniqueOwner: string): void {
    if (uniqueOwner !== this.owner.uniqueOwner)
      this.revoke()
  }

  /** A verified Wayland connection process can differ from Electron's main process. Enrollment binds its exact birth identity. */
  processMatches(identity: ProcessIdentity): boolean {
    const matches = identity.pid === this.process.pid && identity.birthId === this.process.birthId
    if (!matches)
      this.revoke()
    return this.active && matches
  }

  /** Parent pipe EOF, helper failure, disable, or process exit revokes the session permanently. */
  revoke(): void {
    this.active = false
  }
}
