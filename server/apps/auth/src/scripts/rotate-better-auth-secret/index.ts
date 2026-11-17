/**
 * Re-encrypts every JWKS private key under the current Better Auth secret.
 *
 * Use when:
 * - The auth service runs with `BETTER_AUTH_SECRETS=<new version>:<new secret>,...`.
 * - The old secret is a later `BETTER_AUTH_SECRETS` entry, or it is still in `BETTER_AUTH_SECRET`.
 *
 * Covers:
 * - `jwks.private_key`. It is the only stored value that the auth service encrypts with the secret.
 *   OAuth client secrets are hashed, and account OAuth tokens are not encrypted.
 *
 * Modes:
 * - Without `--apply`, it only reads and counts.
 * - With `--apply`, it rewrites keys that need an old secret, then counts again.
 *
 * Exit codes:
 * - 0: every key uses the current secret. You can remove the old secret.
 * - 1: some keys open with no configured secret. Do not remove the old secret.
 * - 2: some keys still need an old secret. Run again with `--apply`.
 *
 * Usage:
 *   pnpm -F @proj-airi/auth-server exec tsx src/scripts/rotate-better-auth-secret/index.ts [--apply]
 */
import type { SecretConfig } from 'better-auth/crypto'

import type { AuthDatabase } from '../../db'
import type { PrivateKeyState } from './rotation'

import { argv, env, exit } from 'node:process'

import { errorMessageFrom } from '@moeru/std'
import { jwks } from '@proj-airi/auth-shared'
import { betterAuth } from 'better-auth'
import { and, eq } from 'drizzle-orm'

import { createAuthDrizzle } from '../../db'
import { parseAuthEnv } from '../../env'
import { rotatePrivateKey } from './rotation'

interface KeyReport {
  id: string
  state: PrivateKeyState
}

interface PassReport {
  keys: KeyReport[]
  rewritten: number
  conflicts: number
}

/**
 * Builds the secret config the same way the auth service does, so the script
 * and the running service agree on versions and the legacy secret.
 */
async function resolveSecretConfig(secret: string, secrets: Array<{ version: number, value: string }>): Promise<SecretConfig> {
  const context = await betterAuth({ secret, secrets }).$context
  if (typeof context.secretConfig === 'string')
    throw new Error('Better Auth did not build a versioned secret config.')
  return context.secretConfig
}

async function runPass(db: AuthDatabase, secretConfig: SecretConfig, apply: boolean): Promise<PassReport> {
  const rows = await db.select({ id: jwks.id, privateKey: jwks.privateKey }).from(jwks)
  const report: PassReport = { keys: [], rewritten: 0, conflicts: 0 }

  for (const row of rows) {
    const rotated = await rotatePrivateKey(secretConfig, row.privateKey)
    report.keys.push({ id: row.id, state: rotated.state })
    if (!apply || rotated.state !== 'previous')
      continue

    const updated = await db.update(jwks)
      .set({ privateKey: rotated.value })
      .where(and(eq(jwks.id, row.id), eq(jwks.privateKey, row.privateKey)))
      .returning({ id: jwks.id })
    if (updated.length === 1)
      report.rewritten += 1
    else
      report.conflicts += 1
  }
  return report
}

function exitCodeFor(report: PassReport): number {
  if (report.keys.some(key => key.state === 'unreadable'))
    return 1
  if (report.keys.some(key => key.state === 'previous'))
    return 2
  return 0
}

async function main(): Promise<number> {
  const apply = argv.includes('--apply')
  const authEnv = parseAuthEnv(env)
  if (!authEnv.BETTER_AUTH_SECRETS) {
    console.error('BETTER_AUTH_SECRETS is not set. Set `<new version>:<new secret>,<old version>:<old secret>` first.')
    return 1
  }

  const secretConfig = await resolveSecretConfig(authEnv.BETTER_AUTH_SECRET, authEnv.BETTER_AUTH_SECRETS)
  const { db, pool } = createAuthDrizzle(authEnv)

  try {
    const firstPass = await runPass(db, secretConfig, apply)
    console.info(JSON.stringify({ mode: apply ? 'apply' : 'check', currentVersion: secretConfig.currentVersion, ...firstPass }, null, 2))
    if (!apply)
      return exitCodeFor(firstPass)

    const verifyPass = await runPass(db, secretConfig, false)
    console.info(JSON.stringify({ mode: 'verify', currentVersion: secretConfig.currentVersion, ...verifyPass }, null, 2))
    return exitCodeFor(verifyPass)
  }
  finally {
    await pool.end()
  }
}

main()
  .then(code => exit(code))
  .catch((error) => {
    console.error(`Rotation failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
    exit(1)
  })
