import { describe, expect, it } from 'vitest'

import { loadMigrations } from '../migrations'

describe('loadMigrations', () => {
  it('loads the checked-in journal and SQL files without a bundler plugin', async () => {
    const migrations = await loadMigrations()

    expect(migrations).toContainEqual({
      idx: 21,
      when: 1786864179375,
      tag: '0021_chilly_starjammers',
      hash: 'fb7c12edd07afd96fb71510d2a90c2902eba2311625ca30cfa41c6d284af84ea',
      sql: [
        'ALTER TABLE "session" DROP COLUMN "impersonated_by";',
        'ALTER TABLE "user" DROP COLUMN "role";',
      ],
    })
  })
})
