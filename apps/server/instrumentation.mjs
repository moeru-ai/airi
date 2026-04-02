/**
 * OTEL instrumentation preload — loaded via `--import` BEFORE tsx processes
 * any application module. This ensures @opentelemetry/instrumentation-pg can
 * monkey-patch the CJS `pg` module before it is imported anywhere.
 *
 * Only instrumentations that patch third-party modules need to live here.
 * The full SDK (exporters, metrics, log processors) is still configured in
 * src/libs/otel.ts — the NodeSDK there will reuse the already-registered
 * instrumentations.
 *
 * NOTICE: `pg` and `ioredis` are CJS packages. When ESM code does
 * `import pg from 'pg'`, Node.js internally calls `require()` to load
 * the CJS module, so `require-in-the-middle` hooks still intercept it.
 */

import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: req => req.url === '/health',
    }),
    new PgInstrumentation({
      enhancedDatabaseReporting: true,
    }),
    new IORedisInstrumentation(),
  ],
})
