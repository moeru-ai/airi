/**
 * Memory Service - Centralized memory backend for AIRI
 *
 * What this file does:
 *  1) Bootstraps OpenTelemetry (optional; non-fatal if collector is absent)
 *  2) Initializes DB connection (initDb)
 *  3) Ensures base schema by executing ./drizzle/0000_sharp_iceman.sql exactly once
 *  4) Warms up embedding provider (non-fatal on failure)
 *  5) Starts background workers and HTTP server at PORT (default: 3001)
 *
 * Notes:
 *  - No external migration runner. The SQL file is executed inline, one-shot.
 *  - Idempotency: We check for the existence of a sentinel table before applying.
 */

import fs from 'node:fs'
import path from 'node:path'
import process, { env } from 'node:process'

import { fileURLToPath } from 'node:url'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { Pool } from 'pg'

import { memoryRouter } from './api/memory.js'
import { createApp } from './api/server.js'
import { initDb } from './db'
import { BackgroundTrigger } from './services/background-trigger.js'
import { EmbeddingProviderFactory } from './services/embedding-providers/factory.js'
import { MemoryService } from './services/memory.js'
import { MessageIngestionService } from './services/message-processing.js'

import 'dotenv/config'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Debug)

const __filename
  = (typeof import.meta !== 'undefined' && (import.meta as any).url)
    ? fileURLToPath((import.meta as any).url)
    : path.resolve(process.cwd(), 'src/index.ts')
const __dirname = path.dirname(__filename)

const PG_URL = env.PG_URL || env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres'
const PORT = Number(env.PORT || 3001)
const BASE_SCHEMA_FILE = path.resolve(__dirname, '../drizzle/0000_sharp_iceman.sql')

async function ensureBaseSchema(): Promise<void> {
  const pool = new Pool({ connectionString: PG_URL })
  try {
    const check = await pool.query<{ exists: string | null }>(
      'SELECT to_regclass(\'public.memory_settings\') AS exists',
    )
    if (check.rows[0]?.exists)
      return

    if (!fs.existsSync(BASE_SCHEMA_FILE))
      throw new Error(`Base schema SQL not found at: ${BASE_SCHEMA_FILE}`)
    const sql = fs.readFileSync(BASE_SCHEMA_FILE, 'utf8').trim()
    if (!sql)
      throw new Error('Base schema SQL file is empty')

    await pool.query(sql)
  }
  finally {
    await pool.end()
  }
}

async function main() {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'memory-service',
      [ATTR_SERVICE_VERSION]: '1.0.0',
    }),
    traceExporter: new OTLPTraceExporter({
      url: env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || 'http://localhost:4318/v1/metrics',
      }),
      exportIntervalMillis: 5000,
    }),
  })
  sdk.start()

  await initDb()
  await ensureBaseSchema()

  try {
    const embeddingFactory = EmbeddingProviderFactory.getInstance()
    await embeddingFactory.initializeProvider()
  }
  catch (error) {
    console.error('[memory-service] Embedding provider init failed (continuing):', error)
  }

  const messageIngestionService = MessageIngestionService.getInstance()
  const memoryService = new MemoryService()
  await memoryService.checkAndResumeRegeneration()

  const backgroundTrigger = BackgroundTrigger.getInstance(messageIngestionService)
  backgroundTrigger.startProcessing(30_000)

  const app = createApp()
  app.use('/api/memory', memoryRouter)

  app.listen(PORT, () => {
    process.stdout.write(`[memory-service] HTTP server listening on http://localhost:${PORT}\n`)
  })
}

process.on('unhandledRejection', (err) => {
  const log = useLogg('UnhandledRejection').useGlobalConfig()
  log.withError(err).withField('cause', (err as any)?.cause).error('Unhandled rejection')
})

main().catch((err) => {
  console.error('[memory-service] Fatal error during startup:', err)
  process.exitCode = 1
})
