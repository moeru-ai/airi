import type { CodingOperationalMemorySeed } from '../coding/coding-memory-taxonomy'

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildSnapshotFromSeeds,
  loadWorkspaceMemory,
  snapshotHasActionableMemory,
  summarizeSnapshotForAgent,
  writeWorkspaceMemory,
} from './workspace-memory'

describe('workspace-memory', () => {
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'airi-ws-mem-'))
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  const makeSeed = (overrides: Partial<CodingOperationalMemorySeed> = {}): CodingOperationalMemorySeed => ({
    kind: 'verification_failure',
    reason: 'no_validation_run',
    summary: 'test seed',
    source: 'verification_gate',
    recordedAt: new Date().toISOString(),
    recheckEligible: true,
    blocking: true,
    ...overrides,
  })

  it('writes and reads a snapshot', () => {
    const snapshot = buildSnapshotFromSeeds({
      seeds: [makeSeed()],
      lastValidationCommand: 'pnpm test',
      lastReviewedFile: 'foo.ts',
    })

    const written = writeWorkspaceMemory(testDir, snapshot)
    expect(written).toBe(true)

    // Verify file exists
    const raw = readFileSync(join(testDir, '.airi-session.json'), 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.version).toBe(1)
    expect(parsed.operationalSeeds).toHaveLength(1)

    // Load back
    const loaded = loadWorkspaceMemory(testDir)
    expect(loaded).not.toBeNull()
    expect(loaded!.operationalSeeds).toHaveLength(1)
    expect(loaded!.lastValidationCommand).toBe('pnpm test')
  })

  it('returns null for non-existent workspace', () => {
    const loaded = loadWorkspaceMemory('/tmp/nonexistent-airi-ws-test')
    expect(loaded).toBeNull()
  })

  it('filters to blocking seeds only', () => {
    const seeds = [
      makeSeed({ blocking: true, reason: 'no_validation_run' }),
      makeSeed({ blocking: false, reason: 'gate_passed' }),
    ]
    const snapshot = buildSnapshotFromSeeds({ seeds })
    expect(snapshot.operationalSeeds).toHaveLength(1)
    expect(snapshot.operationalSeeds[0].reason).toBe('no_validation_run')
  })

  it('snapshotHasActionableMemory returns false for empty seeds', () => {
    const snapshot = buildSnapshotFromSeeds({ seeds: [] })
    expect(snapshotHasActionableMemory(snapshot)).toBe(false)
  })

  it('snapshotHasActionableMemory returns true for blocking seeds', () => {
    const snapshot = buildSnapshotFromSeeds({
      seeds: [makeSeed({ blocking: true })],
    })
    expect(snapshotHasActionableMemory(snapshot)).toBe(true)
  })

  it('summarizeSnapshotForAgent produces readable output', () => {
    const snapshot = buildSnapshotFromSeeds({
      seeds: [makeSeed()],
      lastValidationCommand: 'vitest run',
      lastReviewedFile: 'index.ts',
    })
    const summary = summarizeSnapshotForAgent(snapshot)
    expect(summary).toContain('Prior-session memory')
    expect(summary).toContain('verification_failure')
    expect(summary).toContain('vitest run')
    expect(summary).toContain('index.ts')
  })

  it('handles malformed JSON gracefully', () => {
    const filePath = join(testDir, '.airi-session.json')
    const { writeFileSync } = require('node:fs')
    writeFileSync(filePath, '{ broken json', 'utf8')
    expect(loadWorkspaceMemory(testDir)).toBeNull()
  })

  it('handles wrong version gracefully', () => {
    const filePath = join(testDir, '.airi-session.json')
    const { writeFileSync } = require('node:fs')
    writeFileSync(filePath, JSON.stringify({ version: 99, savedAt: '', operationalSeeds: [] }), 'utf8')
    expect(loadWorkspaceMemory(testDir)).toBeNull()
  })
})
