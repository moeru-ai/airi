/**
 * Workspace Memory Snapshot
 *
 * Persists/loads operational memory seeds to a `.airi-session.json` file
 * in the workspace directory. This is AIRI's approach to cross-session
 * memory — lighter than Claude Code's full memdir system but sufficient
 * for operational bias continuity.
 *
 * Design decisions (diverges from Claude Code):
 * - Claude Code uses markdown files with YAML frontmatter (human-readable).
 *   AIRI uses JSON (machine-readable, no parsing ambiguity).
 * - Claude Code stores four types of memory (user/feedback/project/reference).
 *   AIRI stores only operational seeds (verification outcomes, bias hints).
 *   User-facing memory is a separate concern for the future.
 * - The snapshot is workspace-scoped, not user-scoped.
 * - Pure functions that read/write — no singleton state.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CodingOperationalMemorySeed } from '../coding/coding-memory-taxonomy'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceMemorySnapshot {
  /** Schema version for forward compatibility. */
  version: 1
  /** ISO timestamp of last write. */
  savedAt: string
  /** Blocking seed summaries from the last session. */
  operationalSeeds: CodingOperationalMemorySeed[]
  /** Last known good validation command (helps next session bootstrap). */
  lastValidationCommand?: string
  /** Last reviewed file (targeting hint for next session). */
  lastReviewedFile?: string
  /** How many workflow cycles ran in the previous session. */
  previousSessionCycles?: number
}

const SNAPSHOT_FILENAME = '.airi-session.json'

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Write a workspace memory snapshot to disk.
 * Only persists blocking seeds — non-blocking data is ephemeral.
 *
 * @param workspacePath Absolute path to the workspace root
 * @param snapshot Memory snapshot to persist
 * @returns true if write succeeded, false on error
 */
export function writeWorkspaceMemory(
  workspacePath: string,
  snapshot: WorkspaceMemorySnapshot,
): boolean {
  try {
    const filePath = join(workspacePath, SNAPSHOT_FILENAME)
    const content = JSON.stringify(snapshot, null, 2)
    writeFileSync(filePath, content, 'utf8')
    return true
  }
  catch {
    // Non-critical — failure to persist memory is not a runtime error.
    return false
  }
}

/**
 * Build a snapshot from the current coding state.
 * Filters to only blocking seeds — non-blocking seeds are noise.
 */
export function buildSnapshotFromSeeds(params: {
  seeds: CodingOperationalMemorySeed[]
  lastValidationCommand?: string
  lastReviewedFile?: string
  cycleCount?: number
}): WorkspaceMemorySnapshot {
  // Only persist blocking seeds — advisory seeds are session-ephemeral
  const blockingSeeds = params.seeds.filter(s => s.blocking)

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    operationalSeeds: blockingSeeds,
    lastValidationCommand: params.lastValidationCommand,
    lastReviewedFile: params.lastReviewedFile,
    previousSessionCycles: params.cycleCount,
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Load a workspace memory snapshot from disk.
 * Returns null if no snapshot exists, is unreadable, or has wrong version.
 */
export function loadWorkspaceMemory(
  workspacePath: string,
): WorkspaceMemorySnapshot | null {
  try {
    const filePath = join(workspacePath, SNAPSHOT_FILENAME)
    const content = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(content) as unknown

    if (!isValidSnapshot(parsed)) {
      return null
    }

    return parsed
  }
  catch {
    // File doesn't exist or is unreadable — normal for first-run
    return null
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidSnapshot(obj: unknown): obj is WorkspaceMemorySnapshot {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }

  const record = obj as Record<string, unknown>

  return (
    record.version === 1
    && typeof record.savedAt === 'string'
    && Array.isArray(record.operationalSeeds)
  )
}

// ---------------------------------------------------------------------------
// Integration helpers
// ---------------------------------------------------------------------------

/**
 * Check if a snapshot has any actionable content.
 * Used to decide whether to inject prior-session memory bias.
 */
export function snapshotHasActionableMemory(snapshot: WorkspaceMemorySnapshot | null): boolean {
  if (!snapshot) {
    return false
  }

  return snapshot.operationalSeeds.length > 0
}

/**
 * Summarize a loaded snapshot for injection into the next session.
 * Returns a human-readable string suitable for embedding in a tool result.
 */
export function summarizeSnapshotForAgent(snapshot: WorkspaceMemorySnapshot): string {
  if (snapshot.operationalSeeds.length === 0) {
    return 'No prior-session memory.'
  }

  const seedSummaries = snapshot.operationalSeeds
    .map(s => `  - [${s.kind}:${s.reason}] ${s.summary}`)
    .join('\n')

  const parts: string[] = [
    `📋 Prior-session memory (saved ${snapshot.savedAt}):`,
    seedSummaries,
  ]

  if (snapshot.lastValidationCommand) {
    parts.push(`  Last validation: ${snapshot.lastValidationCommand}`)
  }

  if (snapshot.lastReviewedFile) {
    parts.push(`  Last reviewed: ${snapshot.lastReviewedFile}`)
  }

  if (snapshot.previousSessionCycles != null) {
    parts.push(`  Previous cycles: ${snapshot.previousSessionCycles}`)
  }

  return parts.join('\n')
}
