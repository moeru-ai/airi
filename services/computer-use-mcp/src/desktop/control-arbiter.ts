import type { ControlLease, ControlLeaseKind, DesktopMode } from './types'

const MIN_LEASE_MS = 250
const MAX_LEASE_MS = 30_000
const RECOVERY_SETTLE_MS = 120
const INTERRUPTED_SETTLE_MS = 120

function modeForKind(kind: ControlLeaseKind): DesktopMode {
  switch (kind) {
    case 'observe':
      return 'observing'
    case 'suggest':
      return 'suggesting'
    case 'act':
      return 'acting'
  }
}

function clampLeaseTtl(ttlMs: number | undefined): number {
  const next = Number.isFinite(ttlMs) ? Number(ttlMs) : 2_000
  return Math.min(Math.max(next, MIN_LEASE_MS), MAX_LEASE_MS)
}

export class ControlArbiter {
  private mode: DesktopMode = 'idle'
  private lease?: ControlLease
  private modeChangedAt = Date.now()

  private setMode(mode: DesktopMode, now: number) {
    if (this.mode !== mode) {
      this.mode = mode
      this.modeChangedAt = now
    }
  }

  private refresh(now: number) {
    if (this.lease && now >= this.lease.expiresAt) {
      this.lease = undefined
      this.setMode('recovering', now)
    }

    if (this.mode === 'recovering' && now - this.modeChangedAt >= RECOVERY_SETTLE_MS) {
      this.setMode('idle', now)
    }

    if (this.mode === 'interrupted' && now - this.modeChangedAt >= INTERRUPTED_SETTLE_MS) {
      this.setMode('idle', now)
    }
  }

  getState(now = Date.now()) {
    this.refresh(now)
    return {
      mode: this.mode,
      lease: this.lease,
    }
  }

  requestLease(kind: ControlLeaseKind, ttlMs?: number, now = Date.now()) {
    this.refresh(now)

    const expiresAt = now + clampLeaseTtl(ttlMs)
    this.lease = {
      holder: 'airi',
      kind,
      startedAt: now,
      expiresAt,
      interruptOnUserInput: true,
    }
    this.setMode(modeForKind(kind), now)

    return {
      granted: true,
      reason: `lease_granted:${kind}`,
      lease: this.lease,
      mode: this.mode,
    }
  }

  cancelLease(reason = 'cancelled_by_request', now = Date.now()) {
    this.refresh(now)
    this.lease = undefined
    this.setMode('recovering', now)

    return {
      cancelled: true,
      reason,
      mode: this.mode,
    }
  }

  notifyUserInput(now = Date.now()) {
    this.refresh(now)

    if (!this.lease || this.lease.holder !== 'airi' || !this.lease.interruptOnUserInput) {
      return {
        interrupted: false,
        reason: 'no_interruptible_airi_lease',
        mode: this.mode,
        lease: this.lease,
      }
    }

    this.lease = undefined
    this.setMode('interrupted', now)

    return {
      interrupted: true,
      reason: 'user_input_preempted_airi',
      mode: this.mode,
    }
  }

  hasActiveLease(kind?: ControlLeaseKind, now = Date.now()) {
    this.refresh(now)
    if (!this.lease || this.lease.holder !== 'airi') {
      return false
    }
    if (kind && this.lease.kind !== kind) {
      return false
    }
    return true
  }
}
