import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { argv } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Removes generated migration source after tsdown has emitted package dist.
 *
 * Call stack:
 *
 * pnpm -F @proj-airi/server-schema run build
 *   -> tsdown
 *     -> tsx src/migrations/clean.ts
 *       -> removes generated src used only during build
 */
export async function runCleanGeneratedMigrationsCli(): Promise<void> {
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  await rm(resolve(packageRoot, 'src/generated'), { recursive: true, force: true })
}

if (argv[1] != null && import.meta.url === pathToFileURL(argv[1]).href)
  void runCleanGeneratedMigrationsCli()
