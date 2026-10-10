import type { BusPeer, ProcessIdentity } from './caller-scope'
import type { Enrollment } from './companion-session'

/** Main owns these snapshots. Neither renderers nor D-Bus callers can register or replace a surface here. */
export interface OwnedSurface {
  surfaceId: string
  registrationId: string
  alive: boolean
  processCandidates: ProcessIdentity[]
}

/** Implement this boundary with the actual Electron main window registry, never with renderer-provided records. */
export interface OwnedSurfaceRegistry {
  get: (surfaceId: string) => OwnedSurface | null
}

/** The native verifier must prove this mapping for the current registry generation and native Wayland connection. */
export interface VerifiedNativeMapping {
  surfaceId: string
  registrationId: string
  backend: 'native-wayland'
  windowId: string
  resourceClass: string
  process: ProcessIdentity
  kwinPeer: BusPeer
}

/** There is no production implementation until the packaged Electron-to-KWin mapping passes live verification. */
export interface NativeMappingVerifier {
  verify: (surface: OwnedSurface) => Promise<VerifiedNativeMapping | null>
}

/** A permit binds one main-registry generation. It cannot authorize a replacement window after asynchronous verification. */
export type EnrollmentResult
  = { status: 'unavailable', reason: string }
    | { status: 'verified', binding: Enrollment, registrationId: string, kwinPeer: BusPeer }

/**
 * Missing native evidence fails closed. A class, title, PID, or successful helper launch cannot supply that evidence.
 * The host must revoke this permit when its registry entry, process birth identity, or KWin bus owner changes.
 */
export async function authorizeSurface(registry: OwnedSurfaceRegistry, verifier: NativeMappingVerifier | null, surfaceId: string, sessionId: string): Promise<EnrollmentResult> {
  if (!verifier)
    return { status: 'unavailable', reason: 'native-window-mapping-unverified' }
  const initial = registry.get(surfaceId)
  if (!initial?.alive || initial.surfaceId !== surfaceId || !validId(initial.registrationId) || !validId(sessionId) || !validId(surfaceId))
    return { status: 'unavailable', reason: 'surface-not-owned' }
  const generation = initial.registrationId
  let proof: VerifiedNativeMapping | null
  try {
    proof = await verifier.verify({ ...initial, processCandidates: initial.processCandidates.map(process => ({ ...process })) })
  }
  catch {
    return { status: 'unavailable', reason: 'native-window-mapping-failed' }
  }
  const current = registry.get(surfaceId)
  if (!current?.alive || current.registrationId !== generation || current.surfaceId !== surfaceId)
    return { status: 'unavailable', reason: 'surface-registration-changed' }
  if (!proof || proof.backend !== 'native-wayland' || proof.surfaceId !== surfaceId
    || proof.registrationId !== generation || !validId(proof.windowId) || !validId(proof.resourceClass)
    || !current.processCandidates.some(process => process.pid === proof.process.pid && process.birthId === proof.process.birthId)
    || !Number.isSafeInteger(proof.process.pid) || proof.process.pid <= 0 || !validId(proof.process.birthId)
    || !/^:\d+\.\d+$/.test(proof.kwinPeer.uniqueOwner)
    || !Number.isSafeInteger(proof.kwinPeer.pid) || proof.kwinPeer.pid <= 0
    || !Number.isSafeInteger(proof.kwinPeer.uid) || proof.kwinPeer.uid < 0) {
    return { status: 'unavailable', reason: 'native-window-mapping-unverified' }
  }
  return {
    status: 'verified',
    registrationId: generation,
    kwinPeer: { ...proof.kwinPeer },
    binding: {
      sessionId,
      surfaceId,
      windowId: proof.windowId,
      resourceClass: proof.resourceClass,
      process: { ...proof.process },
    },
  }
}

function validId(value: string): boolean {
  return value.length > 0 && value.length <= 128
}
