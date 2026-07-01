import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildMigrationEntries, migrationEntriesToSource } from './build'

/**
 * @example
 * Describes the deterministic migration bundle generation used by the server
 * schema build.
 */
describe('buildMigrationEntries', () => {
  /**
   * @example
   * Builds entries from a Drizzle journal and the referenced SQL files.
   */
  it('generates migrator-compatible entries from a Drizzle journal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-server-schema-'))

    try {
      await mkdir(join(root, 'meta'))
      await writeFile(join(root, 'meta/_journal.json'), JSON.stringify({
        entries: [
          { idx: 0, when: 123, tag: '0000_alpha' },
          { idx: 1, when: 456, tag: '0001_beta' },
        ],
      }))
      await writeFile(join(root, '0000_alpha.sql'), [
        '-- ignored leading comment',
        'CREATE TABLE "alpha" (',
        '  "id" text PRIMARY KEY',
        ');',
        '--> statement-breakpoint',
        'ALTER TABLE "alpha" ADD COLUMN "name" text;',
      ].join('\n'))
      await writeFile(join(root, '0001_beta.sql'), '/* ignored block */\nSELECT 1;')

      const entries = await buildMigrationEntries(root)

      /**
       * @example
       * The first entry keeps Drizzle's journal metadata.
       */
      expect(entries[0]).toMatchObject({
        idx: 0,
        when: 123,
        tag: '0000_alpha',
      })
      /**
       * @example
       * SQL comments and statement breakpoints are removed before bundling.
       */
      expect(entries[0]?.sql).toEqual([
        'CREATE TABLE "alpha" ( "id" text PRIMARY KEY );',
        'ALTER TABLE "alpha" ADD COLUMN "name" text;',
      ])
      /**
       * @example
       * Hashes are stable SHA-256 hex strings over the original SQL file.
       */
      expect(entries[0]?.hash).toHaveLength(64)
      /**
       * @example
       * Every journal entry gets a corresponding SQL bundle entry.
       */
      expect(entries).toHaveLength(2)
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  /**
   * @example
   * Preserves semicolons inside SQL literals when Drizzle breakpoints exist.
   */
  it('keeps semicolons inside breakpoint-delimited statements', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-server-schema-'))

    try {
      await mkdir(join(root, 'meta'))
      await writeFile(join(root, 'meta/_journal.json'), JSON.stringify({
        entries: [
          { idx: 0, when: 123, tag: '0000_alpha' },
        ],
      }))
      await writeFile(join(root, '0000_alpha.sql'), [
        'SELECT \'alpha;beta\';',
        '--> statement-breakpoint',
        'SELECT 2;',
      ].join('\n'))

      const entries = await buildMigrationEntries(root)

      /**
       * @example
       * Drizzle breakpoints, not every semicolon, define statement boundaries.
       */
      expect(entries[0]?.sql).toEqual([
        'SELECT \'alpha;beta\';',
        'SELECT 2;',
      ])
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

/**
 * @example
 * Describes source emission for the generated migrations module.
 */
describe('migrationEntriesToSource', () => {
  /**
   * @example
   * Emits an import-free TypeScript module for tsdown to compile normally.
   */
  it('emits a real module without virtual imports', async () => {
    const source = migrationEntriesToSource([
      {
        idx: 0,
        when: 123,
        tag: '0000_alpha',
        hash: 'a'.repeat(64),
        sql: ['SELECT 1;'],
      },
    ])

    /**
     * @example
     * The generated module exports the named binding imported by index.ts.
     */
    expect(source).toContain('export const migrations = [')
    /**
     * @example
     * The generated module does not rely on the rolldown virtual module hook.
     */
    expect(source).not.toContain('virtual:')
  })
})
