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

import memoryRouter from './api/memory.js'

import { createApp } from './api/server.js'
import { initDb } from './db'
import { BackgroundTrigger } from './services/background-trigger.js'
import { EmbeddingProviderFactory } from './services/embedding-providers/factory.js'
import { MemoryService } from './services/memory.js'
import { MessageIngestionService } from './services/message-processing.js'

import 'dotenv/config'

// ----------------------------------------------------------------------------
// Logging setup
// ----------------------------------------------------------------------------
setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Debug)

// ----------------------------------------------------------------------------
// Small helpers for ESM __dirname
// ----------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------
const PG_URL = env.PG_URL || env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres'
const PORT = Number(env.PORT || 3001)
const BASE_SCHEMA_FILE = path.resolve(__dirname, '../drizzle/0000_sharp_iceman.sql')

// ----------------------------------------------------------------------------
// Ensure Base Schema (idempotent)
//   - We check a sentinel table first (public.memory_settings).
//   - If missing, we load and execute the iceman SQL file verbatim.
// ----------------------------------------------------------------------------
async function ensureBaseSchema(): Promise<void> {
  const pool = new Pool({ connectionString: PG_URL })
  try {
    // 1) Sentinel check: does one of the core tables already exist?
    const check = await pool.query<{ exists: string | null }>(
      'SELECT to_regclass(\'public.memory_settings\') AS exists',
    )
    if (check.rows[0]?.exists) {
      console.warn('[memory-service] Base schema already present (skipping)')
      return
    }

    // 2) Load SQL file
    if (!fs.existsSync(BASE_SCHEMA_FILE)) {
      throw new Error(`Base schema SQL not found at: ${BASE_SCHEMA_FILE}`)
    }
    const sql = fs.readFileSync(BASE_SCHEMA_FILE, 'utf8').trim()
    if (!sql) {
      throw new Error('Base schema SQL file is empty')
    }

    // 3) Execute (single round-trip; node-postgres accepts multiple statements separated by ;)
    console.warn('[memory-service] Applying base schema from drizzle/0000_sharp_iceman.sql …')
    await pool.query(sql)
    console.warn('[memory-service] Base schema applied successfully ✅')
  }
  finally {
    await pool.end()
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  // ---- OpenTelemetry (non-fatal if collector is absent) --------------------
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

  // ---- DB bootstrap --------------------------------------------------------
  await initDb()
  await ensureBaseSchema() // <— Run the iceman SQL once if needed

  // ---- Warm up embedding provider (non-fatal) ------------------------------
  try {
    console.warn('🚀 Initializing embedding provider…')
    const embeddingFactory = EmbeddingProviderFactory.getInstance()
    await embeddingFactory.initializeProvider()
  }
  catch (error) {
    console.error('[memory-service] Embedding provider init failed (continuing):', error)
  }

  // ---- Shared singletons ---------------------------------------------------
  const messageIngestionService = MessageIngestionService.getInstance()
  const memoryService = new MemoryService()

  // Resume any in-progress regeneration workflow
  await memoryService.checkAndResumeRegeneration()

  // Start background processing loop
  const backgroundTrigger = BackgroundTrigger.getInstance(messageIngestionService)
  backgroundTrigger.startProcessing(30_000)
  console.warn('[memory-service] Background processing started')

  // ---- HTTP server ---------------------------------------------------------
  const app = createApp()
  app.use('/api/memory', memoryRouter)

  app.listen(PORT, () => {
    console.warn(`[memory-service] HTTP server listening on http://localhost:${PORT}`)
  })
}

// ----------------------------------------------------------------------------
// Global rejection handler (keeps logs useful in production)
// ----------------------------------------------------------------------------
process.on('unhandledRejection', (err) => {
  const log = useLogg('UnhandledRejection').useGlobalConfig()
  log.withError(err).withField('cause', (err as any)?.cause).error('Unhandled rejection')
})

// ----------------------------------------------------------------------------
// Entrypoint
// ----------------------------------------------------------------------------
main().catch((err) => {
  console.error('[memory-service] Fatal error during startup:', err)
  process.exitCode = 1
})
