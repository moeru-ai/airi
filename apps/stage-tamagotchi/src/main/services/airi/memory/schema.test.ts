import { describe, expect, it } from 'vitest'

import { MEMORY_V1_TABLE_NAMES, memorySchemaV1Sql } from './schema'

/**
 * Verifies the Phase 1 local-first memory schema skeleton is present.
 *
 * @example
 * describe('memory schema V1', () => {
 *   expect(memorySchemaV1Sql).toContain('CREATE TABLE IF NOT EXISTS profile_summary')
 * })
 */
describe('memory schema V1', () => {
  /**
   * Keeps the schema bootstrap anchored to the six Phase 1 tables.
   *
   * @example
   * it('contains the six required Phase 1 tables', () => {
   *   expect(MEMORY_V1_TABLE_NAMES).toHaveLength(6)
   * })
   */
  it('contains the six required Phase 1 tables', () => {
    expect(MEMORY_V1_TABLE_NAMES).toEqual([
      'profile_summary',
      'stable_facts',
      'recent_turns',
      'raw_turn_log',
      'memory_cards',
      'sync_state',
    ])

    for (const tableName of MEMORY_V1_TABLE_NAMES) {
      expect(memorySchemaV1Sql).toContain(`CREATE TABLE IF NOT EXISTS ${tableName}`)
    }
  })
})
