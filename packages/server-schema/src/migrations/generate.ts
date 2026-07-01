import { dirname, resolve } from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { writeMigrationSource } from './build'

/**
 * Generates the migration source module before the package build.
 *
 * Call stack:
 *
 * pnpm -F @proj-airi/server-schema run build
 *   -> tsx src/migrations/generate.ts
 *     -> {@link writeMigrationSource}
 *       -> generated src/generated/migrations.ts
 */
export async function runGenerateMigrationsCli(): Promise<void> {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  const workspaceRoot = resolve(packageRoot, '../..')
  const migrationsDir = resolve(workspaceRoot, 'apps/server/drizzle')
  const outFile = resolve(packageRoot, 'src/generated/migrations.ts')

  await writeMigrationSource(migrationsDir, outFile)
}

if (argv[1] != null && import.meta.url === pathToFileURL(argv[1]).href)
  void runGenerateMigrationsCli()
