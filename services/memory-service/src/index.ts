/**
 * Memory Service - Centralized memory backend for AIRI
 *
 * This service provides:
 * - REST API for memory operations (CRUD)
 * - WebSocket support for real-time updates
 * - PostgreSQL + pgvector for vector similarity search
 * - Memory consolidation and decay algorithms
 * - Multi-platform support (web, desktop, telegram, discord, etc.)
 */

import process, { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

// TODO [lucas-ona]: Import database initialization
// import { initDb } from './db'
// Import API server
import memoryRouter from './api/memory.js'

import { createApp } from './api/server.js'
import { BackgroundTrigger } from './services/background-trigger.js'
import { EmbeddingProviderFactory } from './services/embedding-providers/factory.js'
// TODO [gg582]: Implement DB Backup
import { MemoryService } from './services/memory.js'
import { MessageIngestionService } from './services/message-processing.js'

// TODO [lucas-oma]: Import WebSocket server
// import { createWebSocketServer } from './api/websocket'
import 'dotenv/config'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Debug)

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

  // TODO [lucas-oma]: Initialize database connection
  // await initDb()

  // Initialize embedding provider at startup (prevents first-request delays)
  try {
    console.warn('🚀 Initializing embedding provider...')
    const embeddingFactory = EmbeddingProviderFactory.getInstance()
    await embeddingFactory.initializeProvider()
  }
  catch (error) {
    console.error('Embedding provider initialization failed:', error)
    // Don't exit - service can still work without embeddings
  }

  // Get shared message ingestion service singleton
  const messageIngestionService = MessageIngestionService.getInstance()

  // Create REST API server with shared message ingestion service
  const app = createApp()

  // Check for incomplete regeneration
  const memoryService = new MemoryService()
  await memoryService.checkAndResumeRegeneration()
  // Start background processing with shared message ingestion service (singleton)
  const backgroundTrigger = BackgroundTrigger.getInstance(messageIngestionService)
  backgroundTrigger.startProcessing(30000) // Process every 30 seconds
  console.warn('Background processing started')

  // Create and start REST API server
  const port = env.PORT || 3001
  app.use('/api/memory', memoryRouter)
  app.listen(port, () => {
    console.warn(`Memory service running on port ${port}`)
  })

  // TODO [lucas-oma]: Create and start WebSocket server
  // const wss = createWebSocketServer()
  // console.log('WebSocket server started')

  // console.log('Memory service started successfully!')
}

process.on('unhandledRejection', (err) => {
  const log = useLogg('UnhandledRejection').useGlobalConfig()
  log
    .withError(err)
    .withField('cause', (err as any).cause)
    .error('Unhandled rejection')
})

main().catch(console.error)
