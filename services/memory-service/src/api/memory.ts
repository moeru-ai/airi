import os from 'node:os'

import { cp, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function exportEmbeddedPostgres(): Promise<string> {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)

  const sourceDir = resolve(__dirname, '../../.embedded_pg')
  if (!existsSync(sourceDir)) {
    throw new Error(`Source directory does not exist: ${sourceDir}`)
  }

  const homeDir = os.homedir()
  const targetRoot = resolve(homeDir, 'airi_memory')
  const targetDir = resolve(targetRoot, '.embedded_pg.db')

  if (!existsSync(targetRoot)) {
    mkdirSync(targetRoot, { recursive: true })
  }

  await cp(sourceDir, targetDir, { recursive: true })
  console.warn(`Copied embedded Postgres to: ${targetDir}`)
  return targetDir
}
