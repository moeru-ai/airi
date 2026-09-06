import { readFile } from 'node:fs/promises'

import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL('../../../api/drizzle/0022_placeholder_email_unverified.sql', import.meta.url)

async function createMigrationFixture() {
  const database = new PGlite()
  await database.exec(`
    CREATE TABLE "user" (
      "id" text PRIMARY KEY NOT NULL,
      "email" text NOT NULL,
      "email_verified" boolean NOT NULL,
      "updated_at" timestamp NOT NULL
    );

    INSERT INTO "user" ("id", "email", "email_verified", "updated_at") VALUES
      ('steam', '76561198012345678@steam.placeholder.local', true, '2020-01-01 00:00:00'),
      ('apple', 'Apple-User@Apple.Placeholder.Local', true, '2020-01-01 00:00:00'),
      ('migrated', 'migrated@steam.placeholder.local', false, '2020-01-01 00:00:00'),
      ('real', 'person@example.com', true, '2020-01-01 00:00:00');
  `)

  return database
}

async function runPlaceholderEmailMigration(database: PGlite) {
  const migrationSql = await readFile(migrationUrl, 'utf8')
  await database.exec(migrationSql)
}

describe('placeholder email migration', () => {
  it('changes only verified placeholder emails without changing their addresses or timestamps', async () => {
    const database = await createMigrationFixture()

    try {
      await runPlaceholderEmailMigration(database)

      const result = await database.query<{
        email: string
        emailVerified: boolean
        timestampPreserved: boolean
      }>(`
        SELECT
          "email",
          "email_verified" AS "emailVerified",
          "updated_at" = timestamp '2020-01-01 00:00:00' AS "timestampPreserved"
        FROM "user"
        ORDER BY "id";
      `)

      expect(result.rows).toEqual([
        {
          email: 'Apple-User@Apple.Placeholder.Local',
          emailVerified: false,
          timestampPreserved: true,
        },
        {
          email: 'migrated@steam.placeholder.local',
          emailVerified: false,
          timestampPreserved: true,
        },
        {
          email: 'person@example.com',
          emailVerified: true,
          timestampPreserved: true,
        },
        {
          email: '76561198012345678@steam.placeholder.local',
          emailVerified: false,
          timestampPreserved: true,
        },
      ])
    }
    finally {
      await database.close()
    }
  })

  it('does not update a placeholder again after the first execution', async () => {
    const database = await createMigrationFixture()

    try {
      await runPlaceholderEmailMigration(database)
      const firstResult = await database.query<{ emailVerified: boolean }>(`
        SELECT "email_verified" AS "emailVerified"
        FROM "user"
        WHERE "id" = 'steam';
      `)
      expect(firstResult.rows).toEqual([{ emailVerified: false }])

      await database.exec(`
        UPDATE "user"
        SET "updated_at" = timestamp '2100-01-01 00:00:00'
        WHERE "id" = 'steam';
      `)

      await runPlaceholderEmailMigration(database)

      const result = await database.query<{ markerPreserved: boolean }>(`
        SELECT "updated_at" = timestamp '2100-01-01 00:00:00' AS "markerPreserved"
        FROM "user"
        WHERE "id" = 'steam';
      `)
      expect(result.rows).toEqual([{ markerPreserved: true }])
    }
    finally {
      await database.close()
    }
  })
})
