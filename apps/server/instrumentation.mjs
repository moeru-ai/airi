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

import { env } from 'node:process'

import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'

// NOTICE:
// instrumentation-http >=0.215 defaults to OLD semconv (http.server.duration in
// ms). Our Grafana dashboards / alerts only query the STABLE name
// (http.server.request.duration in seconds), and grep across the repo confirms
// no OLD-name consumer exists, so we go straight to STABLE-only — no `http/dup`
// transition phase, no doubled cardinality.
// Source: node_modules/.pnpm/@opentelemetry+instrumentation-http@0.215.0/.../build/src/http.js L25-72
// MUST run before `new HttpInstrumentation(...)` (created in src/libs/otel.ts) —
// its constructor reads the env var once and caches the result.
//
// Use a truthy check (not `??=`): `process.env.X` is `''` when the platform
// (e.g. Railway) registers the var without a value, and `??=` does NOT override
// empty strings — that would silently fall back to OLD semconv with no signal
// in logs. Truthy check covers both `undefined` and `''`.
// Removal condition: ops sets OTEL_SEMCONV_STABILITY_OPT_IN explicitly in the
// deployment platform with a non-empty value, then this preload default can be
// deleted.
if (!env.OTEL_SEMCONV_STABILITY_OPT_IN) {
  env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http'
}

// Surface the resolved value in stdout BEFORE any instrumentation constructor
// runs. Lets ops grep Railway logs for `[otel-preload]` to confirm the preload
// actually executed and what semconv mode is active. Without this, a misloaded
// preload (wrong `--import` path, missing flag, build cache) is invisible
// until you query Prometheus and notice STABLE-name series are missing.
console.info(`[otel-preload] OTEL_SEMCONV_STABILITY_OPT_IN=${env.OTEL_SEMCONV_STABILITY_OPT_IN}`)

// NOTICE:
// HttpInstrumentation is INTENTIONALLY constructed in src/libs/otel.ts (not
// here) and passed to NodeSDK's `instrumentations` config. Reason: the OTel
// metrics API does NOT have a proxy mechanism like traces — instruments
// created against a NoopMeterProvider stay noop forever. If we register
// HttpInstrumentation in this preload, its constructor caches a noop meter
// (because no MeterProvider is set yet), then `_recordServerDuration` writes
// to NoopHistogram for the entire process lifetime, and
// `http_server_request_duration_seconds_*` never appears in Prometheus.
//
// Putting it in NodeSDK config lets the SDK call `setMeterProvider` with the
// real provider at start(), which re-runs `_updateMetricInstruments()` and
// upgrades the histograms to real instruments. The patches it installs are
// `Server.prototype.emit` (incoming) — prototype-level, race-immune, so it
// doesn't matter that they install at SDK start instead of preload.
//
// pg / ioredis can stay here because they only emit spans, and the trace API
// DOES have a proxy that upgrades cleanly when the SDK installs its provider.
//
// Removal condition: when @opentelemetry/api adds a proxy MeterProvider that
// upgrades cached meters retroactively, all three can move back here.
registerInstrumentations({
  instrumentations: [
    new PgInstrumentation({
      enhancedDatabaseReporting: true,
    }),
    new IORedisInstrumentation(),
  ],
})
