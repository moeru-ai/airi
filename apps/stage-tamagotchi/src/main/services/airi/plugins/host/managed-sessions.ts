import type { ExtensionManifestV2 } from '@proj-airi/plugin-sdk/plugin-host'

type CleanupStepState = 'required' | 'complete'

interface ManagedExtensionSessionBase {
  extensionId: string
  sessionId: string
  manifest: ExtensionManifestV2
  runtimeCleanup: CleanupStepState
  assetCleanup: CleanupStepState
}

interface LoadedExtensionSession extends ManagedExtensionSessionBase {
  phase: 'loaded'
}

interface CleanupPendingExtensionSession extends ManagedExtensionSessionBase {
  phase: 'cleanup-pending'
  cleanupSequence: number
}

type ManagedExtensionSession = LoadedExtensionSession | CleanupPendingExtensionSession

/** Separates active projections from session ownership retained for cleanup. */
export interface ManagedSessionSnapshot {
  /** Extensions that callers may treat as active. */
  loadedExtensionIds: string[]
  /** Manifests for active Extensions passed to the activation Planner. */
  loadedManifests: ExtensionManifestV2[]
  /** Extensions hidden from active projections but still awaiting cleanup. */
  cleanupPendingExtensionIds: string[]
  /** Manifests for every session still owned by the Electron Host. */
  ownedManifests: ExtensionManifestV2[]
}

/** Identifies one cleanup owner that failed without hiding other cleanup results. */
export interface SessionCleanupFailure {
  /** Subsystem that still owns cleanup work. */
  owner: 'runtime' | 'assets'
  /** Original failure returned by the cleanup subsystem. */
  error: unknown
}

/** Reports whether all cleanup owners released one Extension session. */
export interface SessionCleanupReport {
  /** Extension whose managed session was inspected or cleaned. */
  extensionId: string
  /** Whether no cleanup ownership remains for this Extension. */
  complete: boolean
  /** Cleanup owners that still need a later retry. */
  failures: SessionCleanupFailure[]
}

/**
 * Owns Electron extension sessions until runtime and asset cleanup both succeed.
 *
 * Loaded state is only an activation projection. A session that leaves that
 * projection can still remain here as cleanup debt. Each cleanup owner records
 * completion independently, so retries never repeat a completed side effect.
 */
export class ManagedExtensionSessions {
  private readonly sessions = new Map<string, ManagedExtensionSession>()
  private nextCleanupSequence = 0

  constructor(private readonly dependencies: {
    stopRuntime: (sessionId: string) => Promise<void>
    revokeAssets: (sessionId: string) => Promise<void>
  }) {}

  registerLoaded(input: {
    extensionId: string
    sessionId: string
    manifest: ExtensionManifestV2
  }): void {
    if (this.sessions.has(input.extensionId)) {
      throw new Error(`Extension "${input.extensionId}" still owns a managed session.`)
    }

    this.sessions.set(input.extensionId, {
      extensionId: input.extensionId,
      sessionId: input.sessionId,
      manifest: input.manifest,
      phase: 'loaded',
      runtimeCleanup: 'required',
      assetCleanup: 'required',
    })
  }

  hasOwnership(extensionId: string): boolean {
    return this.sessions.has(extensionId)
  }

  isLoaded(extensionId: string): boolean {
    return this.sessions.get(extensionId)?.phase === 'loaded'
  }

  /** Returns true when the exact runtime session can create owned assets. */
  isLoadedSession(extensionId: string, sessionId: string): boolean {
    const session = this.sessions.get(extensionId)
    return session?.phase === 'loaded' && session.sessionId === sessionId
  }

  snapshot(): ManagedSessionSnapshot {
    const sessions = [...this.sessions.values()]

    return {
      loadedExtensionIds: sessions
        .filter(session => session.phase === 'loaded')
        .map(session => session.extensionId),
      loadedManifests: sessions
        .filter(session => session.phase === 'loaded')
        .map(session => session.manifest),
      cleanupPendingExtensionIds: sessions
        .filter((session): session is CleanupPendingExtensionSession => session.phase === 'cleanup-pending')
        .sort((left, right) => left.cleanupSequence - right.cleanupSequence)
        .map(session => session.extensionId),
      ownedManifests: sessions.map(session => session.manifest),
    }
  }

  async prepareForLoad(extensionId: string): Promise<'ready' | 'already-loaded' | SessionCleanupReport> {
    const session = this.sessions.get(extensionId)
    if (!session) {
      return 'ready'
    }
    if (session.phase === 'loaded') {
      return 'already-loaded'
    }

    const report = await this.cleanup(extensionId)
    return report.complete ? 'ready' : report
  }

  async cleanup(extensionId: string): Promise<SessionCleanupReport> {
    let session = this.sessions.get(extensionId)
    if (!session) {
      return { extensionId, complete: true, failures: [] }
    }

    if (session.phase === 'loaded') {
      session = {
        ...session,
        phase: 'cleanup-pending',
        cleanupSequence: this.nextCleanupSequence,
      }
      this.sessions.set(extensionId, session)
      this.nextCleanupSequence += 1
    }
    const failures: SessionCleanupFailure[] = []

    if (session.runtimeCleanup === 'required') {
      try {
        await this.dependencies.stopRuntime(session.sessionId)
        session.runtimeCleanup = 'complete'
      }
      catch (error) {
        failures.push({ owner: 'runtime', error })
      }
    }

    if (session.assetCleanup === 'required') {
      try {
        await this.dependencies.revokeAssets(session.sessionId)
        session.assetCleanup = 'complete'
      }
      catch (error) {
        failures.push({
          owner: 'assets',
          error,
        })
      }
    }

    const complete = session.runtimeCleanup === 'complete' && session.assetCleanup === 'complete'
    if (complete) {
      this.sessions.delete(extensionId)
    }

    return { extensionId, complete, failures }
  }
}
