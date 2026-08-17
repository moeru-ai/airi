import type { migrate } from '@proj-airi/drizzle-orm-browser-migrator/pg'

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { array, integer, number, object, parse, pipe, regex, string } from 'valibot'

type Migration = Parameters<typeof migrate>[1][number]

const MigrationJournalSchema = object({
  entries: array(object({
    idx: pipe(number(), integer()),
    when: pipe(number(), integer()),
    tag: pipe(string(), regex(/^[\w-]+$/)),
  })),
})

const migrationDirectory = new URL('../../drizzle/', import.meta.url)

/**
 * Loads the API migration history from the files in the deployment image.
 *
 * The Dockerfiles copy `drizzle/` with the API source. This loader avoids a
 * bundler virtual module and preserves the migration format that `migrate` uses.
 */
export async function loadMigrations(): Promise<Migration[]> {
  const journal = parse(
    MigrationJournalSchema,
    JSON.parse(await readFile(new URL('meta/_journal.json', migrationDirectory), 'utf8')),
  )

  return Promise.all(journal.entries.map(async (entry) => {
    const sql = await readFile(new URL(`${entry.tag}.sql`, migrationDirectory), 'utf8')

    return {
      idx: entry.idx,
      when: entry.when,
      tag: entry.tag,
      hash: createHash('sha256').update(sql, 'utf8').digest('hex'),
      sql: splitSql(sql),
    }
  }))
}

function splitSql(sql: string): string[] {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n\t?/g)
    .map(line => line.replace(/^--.*$/g, ''))
    .map(line => line.replace('--> statement-breakpoint', ''))
    .map(line => line.trim())
    .join(' ')
    .replaceAll(';', ';\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}
