/**
 * Re-encrypts every stored provider key from `LLM_ROUTER_MASTER_KEY_PREVIOUS`
 * to `LLM_ROUTER_MASTER_KEY`.
 *
 * Use when:
 * - Every service that reads the master key runs with the new key in
 *   `LLM_ROUTER_MASTER_KEY` and the old key in `LLM_ROUTER_MASTER_KEY_PREVIOUS`.
 *
 * Covers:
 * - ConfigKV `LLM_ROUTER_CONFIG` (LLM, TTS, and ASR upstream keys).
 * - ConfigKV `UNSPEECH_UPSTREAM` (streaming TTS keys).
 * - `user_provider_configs.config`, soft-deleted rows included.
 *
 * Modes:
 * - Without `--apply`, it only reads and counts.
 * - With `--apply`, it rewrites values that only the previous key opens, then counts again.
 *
 * Exit codes:
 * - 0: no value needs the previous key. You can remove `LLM_ROUTER_MASTER_KEY_PREVIOUS`.
 * - 1: some values open with neither key. Do not remove the previous key.
 * - 2: some values still need the previous key. Run again with `--apply`.
 *
 * Usage:
 *   pnpm -F @proj-airi/api-server exec tsx src/scripts/rotate-llm-router-master-key/index.ts [--apply]
 */
import type { Database } from '../../libs/db'
import type { EnvelopeRotation, RotatedConfig, RotationCounts, RotationProblem } from './rotation'

import { argv, env, exit } from 'node:process'

import Redis from 'ioredis'

import { errorMessageFrom } from '@moeru/std'
import { and, asc, eq, gt } from 'drizzle-orm'

import { createDrizzle } from '../../libs/db'
import { parseEnv } from '../../libs/env'
import { configKV } from '../../schemas/config-kv'
import { userProviderConfigs } from '../../schemas/providers'
import { CONFIG_KV_INVALIDATION_CHANNEL, configKVCacheKey } from '../../services/adapters/config-kv/contracts'
import { providerConfigAad } from '../../services/domain/providers'
import { createEnvelopeCrypto } from '../../utils/envelope-crypto'
import { addCount, createEnvelopeRotation, emptyCounts, rotateRouterConfig, rotateUnspeechUpstream } from './rotation'

const PROVIDER_PAGE_SIZE = 500

const CONFIG_ROTATORS = {
  LLM_ROUTER_CONFIG: rotateRouterConfig,
  UNSPEECH_UPSTREAM: rotateUnspeechUpstream,
} as const

type RotatedConfigKey = keyof typeof CONFIG_ROTATORS

const ROTATED_CONFIG_KEYS: RotatedConfigKey[] = ['LLM_ROUTER_CONFIG', 'UNSPEECH_UPSTREAM']

interface SourceReport {
  source: string
  configKey?: RotatedConfigKey
  counts: RotationCounts
  rewritten: number
  conflicts: number
  problems: RotationProblem[]
}

/**
 * Rotates one ConfigKV entry inside a row lock, so a concurrent admin write
 * waits for this transaction instead of overwriting it.
 */
async function rotateConfigEntry(db: Database, rotation: EnvelopeRotation, key: RotatedConfigKey, apply: boolean): Promise<SourceReport> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ value: configKV.value }).from(configKV).where(eq(configKV.key, key)).for('update')
    const report: SourceReport = { source: `config_kv:${key}`, configKey: key, counts: emptyCounts(), rewritten: 0, conflicts: 0, problems: [] }
    if (!row)
      return report

    const rotated: RotatedConfig = CONFIG_ROTATORS[key](rotation, row.value)
    report.counts = rotated.counts
    report.problems = rotated.problems
    if (apply && rotated.value !== null) {
      await tx.update(configKV).set({ value: rotated.value, updatedAt: new Date() }).where(eq(configKV.key, key))
      report.rewritten = rotated.counts.previous
    }
    return report
  })
}

/**
 * Rotates provider config rows page by page. Each update matches the old
 * ciphertext, so a concurrent user edit wins and shows up as a conflict.
 */
async function rotateProviderConfigs(db: Database, rotation: EnvelopeRotation, apply: boolean): Promise<SourceReport> {
  const report: SourceReport = { source: 'user_provider_configs', counts: emptyCounts(), rewritten: 0, conflicts: 0, problems: [] }
  let lastId = ''

  while (true) {
    const rows = await db
      .select({ id: userProviderConfigs.id, ownerId: userProviderConfigs.ownerId, instanceId: userProviderConfigs.instanceId, config: userProviderConfigs.config })
      .from(userProviderConfigs)
      .where(gt(userProviderConfigs.id, lastId))
      .orderBy(asc(userProviderConfigs.id))
      .limit(PROVIDER_PAGE_SIZE)
    if (rows.length === 0)
      return report

    for (const row of rows) {
      const rotated = rotation.rotate(row.config, providerConfigAad(row.ownerId, row.instanceId))
      addCount(report.counts, rotated.state)
      if (rotated.state === 'unreadable' || rotated.state === 'not-envelope')
        report.problems.push({ location: `user_provider_configs[${row.id}]`, state: rotated.state })
      if (!apply || rotated.state !== 'previous')
        continue

      const updated = await db.update(userProviderConfigs)
        .set({ config: rotated.ciphertext })
        .where(and(eq(userProviderConfigs.id, row.id), eq(userProviderConfigs.config, row.config)))
        .returning({ id: userProviderConfigs.id })
      if (updated.length === 1)
        report.rewritten += 1
      else
        report.conflicts += 1
    }
    lastId = rows[rows.length - 1].id
  }
}

async function invalidateConfigCaches(redis: Redis, keys: RotatedConfigKey[]): Promise<void> {
  for (const key of keys) {
    await redis.del(configKVCacheKey(key))
    const now = Date.now()
    await redis.publish(CONFIG_KV_INVALIDATION_CHANNEL, JSON.stringify({ key, version: now, publishedAt: now }))
  }
}

async function runPass(db: Database, rotation: EnvelopeRotation, apply: boolean): Promise<SourceReport[]> {
  const reports: SourceReport[] = []
  for (const key of ROTATED_CONFIG_KEYS)
    reports.push(await rotateConfigEntry(db, rotation, key, apply))
  reports.push(await rotateProviderConfigs(db, rotation, apply))
  return reports
}

function exitCodeFor(reports: SourceReport[]): number {
  if (reports.some(report => report.counts.unreadable > 0))
    return 1
  if (reports.some(report => report.counts.previous > 0))
    return 2
  return 0
}

async function main(): Promise<number> {
  const apply = argv.includes('--apply')
  const parsedEnv = parseEnv(env)
  const previousKey = parsedEnv.LLM_ROUTER_MASTER_KEY_PREVIOUS
  if (!previousKey) {
    console.error('LLM_ROUTER_MASTER_KEY_PREVIOUS is not set. Set the old key before you rotate.')
    return 1
  }
  if (previousKey.equals(parsedEnv.LLM_ROUTER_MASTER_KEY)) {
    console.error('LLM_ROUTER_MASTER_KEY and LLM_ROUTER_MASTER_KEY_PREVIOUS are the same key.')
    return 1
  }

  const rotation = createEnvelopeRotation({
    current: createEnvelopeCrypto({ masterKey: parsedEnv.LLM_ROUTER_MASTER_KEY }),
    previous: createEnvelopeCrypto({ masterKey: previousKey }),
  })
  const { db, pool } = createDrizzle(parsedEnv)
  const redis = apply ? new Redis(parsedEnv.REDIS_URL, { lazyConnect: true }) : null

  try {
    const firstPass = await runPass(db, rotation, apply)
    console.info(JSON.stringify({ mode: apply ? 'apply' : 'check', reports: firstPass }, null, 2))
    if (!apply)
      return exitCodeFor(firstPass)

    const rewrittenKeys = firstPass
      .filter(report => report.rewritten > 0)
      .flatMap(report => report.configKey ? [report.configKey] : [])
    if (redis && rewrittenKeys.length > 0) {
      await redis.connect()
      await invalidateConfigCaches(redis, rewrittenKeys)
    }

    const verifyPass = await runPass(db, rotation, false)
    console.info(JSON.stringify({ mode: 'verify', reports: verifyPass }, null, 2))
    return exitCodeFor(verifyPass)
  }
  finally {
    redis?.disconnect()
    await pool.end()
  }
}

main()
  .then(code => exit(code))
  .catch((error) => {
    console.error(`Rotation failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
    exit(1)
  })
