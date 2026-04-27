import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  electronMemoryAppendTurn as electronMemoryAppendTurnFromMemory,
  electronMemoryGetSyncState as electronMemoryGetSyncStateFromMemory,
  electronMemoryReadPromptContext as electronMemoryReadPromptContextFromMemory,
} from './memory'

/**
 * Verifies the memory Eventa contracts stay sourced from the dedicated memory module.
 *
 * @example
 * describe('memory Eventa contracts', () => {
 *   expect(electronMemoryReadPromptContext).toBe(electronMemoryReadPromptContextFromMemory)
 * })
 */
describe('memory Eventa contracts', () => {
  /**
   * Keeps the dedicated memory contract module wired into the shared Eventa barrel.
   *
   * @example
   * it('exports the memory domain through the shared Eventa barrel', () => {
   *   expect(indexSource).toContain(`export * from './memory'`)
   * })
   */
  it('exports the memory domain through the shared Eventa barrel', () => {
    const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

    expect(indexSource).toContain(`export * from './memory'`)
    expect(electronMemoryReadPromptContextFromMemory).toBeDefined()
    expect(electronMemoryAppendTurnFromMemory).toBeDefined()
    expect(electronMemoryGetSyncStateFromMemory).toBeDefined()
  })
})
