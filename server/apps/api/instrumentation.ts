/**
 * OpenTelemetry preload — single entry point for SDK setup.
 *
 * Loaded via `tsx --import ./instrumentation.ts`, runs BEFORE any application
 * module is evaluated. By starting NodeSDK here:
 *   - require-in-the-middle hooks for http / pg / ioredis install before app
 *     code does `require('pg')` etc. (fixes the original commit-9451cd7c race).
 *   - The MeterProvider is real from the moment instrumentations construct, so
 *     `this._meter` is never NoopMeter — no setMeterProvider rebind dance.
 *
 * Trade-offs accepted:
 *   - Env vars are read directly from `process.env` (no valibot). The full
 *     business `Env` schema is parsed later in libs/env.ts; this preload only
 *     needs OTEL_* — and a config error here should crash early anyway.
 *   - `dotenvx run` injects .env.local before tsx, so process.env is fully
 *     populated by the time this file runs.
 *
 * Sources / why this shape:
 *   - https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
 *   - https://github.com/open-telemetry/opentelemetry-js-contrib/blob/main/packages/auto-instrumentations-node/src/register.ts
 *   - https://github.com/open-telemetry/opentelemetry-js/issues/3146 (NodeSDK
 *     registers instrumentations early in start(), making single-file safe)
 */

import process, { env, exit } from 'node:process'

import { randomUUID } from 'node:crypto'

import { LangfuseSpanProcessor } from '@langfuse/otel'
import { setLangfuseTracerProvider } from '@langfuse/tracing'
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node'
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { AlwaysOnSampler, BatchSpanProcessor, NodeTracerProvider, ParentBasedSampler, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'

// NOTICE:
// instrumentation-http >=0.215 defaults to OLD semconv (http.server.duration in
// ms). Our Grafana dashboards / alerts only query the STABLE name
// (http.server.request.duration in seconds). MUST be set BEFORE the
// HttpInstrumentation constructor runs — that constructor reads the env var
// once and caches the result.
// Truthy check (not `??=`) so empty string from Railway / missing-var also
// falls back to STABLE.
if (!env.OTEL_SEMCONV_STABILITY_OPT_IN)
  env.OTEL_SEMCONV_STABILITY_OPT_IN = 'http'

// Surface the resolved value early. Lets ops grep Railway logs for
// `[otel-preload]` to confirm the preload actually executed and what semconv
// mode is active. Without this, a misloaded preload (wrong --import path,
// missing flag, build cache) is invisible.
console.info(`[otel-preload] OTEL_SEMCONV_STABILITY_OPT_IN=${env.OTEL_SEMCONV_STABILITY_OPT_IN}`)

const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT
// Langfuse LLM-native tracing is an INDEPENDENT exporter from the OTLP
// (Grafana) pipeline. Gate the two separately so setting only Langfuse keys
// does not silently no-op just because OTEL_EXPORTER_OTLP_ENDPOINT is unset
// (and vice versa). Both ride the same NodeSDK tracer provider; Langfuse adds
// a second SpanProcessor that exports only its own observation spans (see
// shouldExportSpan below), so the OTLP/Grafana trace stream is untouched.
const langfuseEnabled = !!env.LANGFUSE_PUBLIC_KEY && !!env.LANGFUSE_SECRET_KEY
if (!otlpEndpoint && !langfuseEnabled) {
  console.info('[otel-preload] OpenTelemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT and/or LANGFUSE_PUBLIC_KEY+LANGFUSE_SECRET_KEY to enable)')
}
else {
  if (env.OTEL_DEBUG === 'true')
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG)

  // OTEL_EXPORTER_OTLP_HEADERS format: "key=value,key2=value2"
  const headers: Record<string, string> = {}
  for (const pair of (env.OTEL_EXPORTER_OTLP_HEADERS ?? '').split(',')) {
    const idx = pair.indexOf('=')
    if (idx > 0)
      headers[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
  }

  const serviceName = env.OTEL_SERVICE_NAME || 'server'
  const serviceNamespace = env.OTEL_SERVICE_NAMESPACE || 'airi'
  const samplingRatioRaw = Number(env.OTEL_TRACES_SAMPLING_RATIO ?? '1')
  // Head-based sampling. Metrics are always 100% accurate regardless.
  const samplingRatio = Number.isFinite(samplingRatioRaw) && samplingRatioRaw >= 0 && samplingRatioRaw <= 1
    ? samplingRatioRaw
    : 1

  // service.instance.id MUST be unique per replica. Without it, two replicas
  // emit the same (service_name, deployment_environment) label tuple — when
  // an OTel collector / Prometheus receives both, it can either drop one
  // sample as a "duplicate timestamp" or collapse the series outright,
  // making per-replica `sum()` aggregates undercount.
  //
  // Source preference, strongest → weakest:
  //  1. RAILWAY_REPLICA_ID — Railway-managed, guaranteed unique per replica.
  //  2. SERVER_INSTANCE_ID — operator-supplied override.
  //  3. randomUUID() — per-process fallback. Logged as a warning so ops
  //     know we're relying on a value that doesn't survive restarts (i.e.
  //     metric series cardinality climbs every deploy until staleness
  //     evicts old instance ids).
  //
  // HOSTNAME was previously used as a fallback but Railway's HOSTNAME
  // semantics aren't documented as per-replica unique, so we no longer
  // trust it. If you need to pin instance id to something stable across
  // restarts, set SERVER_INSTANCE_ID explicitly.
  let instanceId = env.RAILWAY_REPLICA_ID || env.SERVER_INSTANCE_ID
  if (!instanceId) {
    instanceId = randomUUID()
    console.warn(`[otel-preload] No RAILWAY_REPLICA_ID or SERVER_INSTANCE_ID set — falling back to randomUUID() ${instanceId}. Multi-replica metric series will churn on every restart.`)
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: env.npm_package_version || '0.0.0',
    'service.namespace': serviceNamespace,
    'service.instance.id': instanceId,
    'deployment.environment': env.NODE_ENV || 'development',
  })

  // Traces fan out to independent processors. OTLP (Grafana Tempo) sees every
  // sampled span; Langfuse sees ONLY the LLM observation spans created via
  // @langfuse/tracing. Each processor is added only when its backend is
  // configured, so enabling one without the other is safe.
  const spanProcessors = []
  if (otlpEndpoint) {
    spanProcessors.push(new BatchSpanProcessor(new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
      headers,
    })))
  }
  // Langfuse runs on its OWN TracerProvider, isolated from the global NodeSDK
  // provider above. Why isolation instead of a second SpanProcessor on the
  // shared provider: the OTLP BatchSpanProcessor has no per-span filter, so a
  // shared provider would also ship every Langfuse generation span — prompt and
  // completion text included — to Grafana Tempo. An isolated provider keeps the
  // LLM observation spans (and their text) exclusively on the Langfuse export
  // path.
  //
  // sampler: AlwaysOnSampler is REQUIRED, not cosmetic. The gateway handler runs
  // inside the @hono/otel HTTP server span's context, so startObservation picks
  // that span up as the generation's parent (OTel context is global, shared
  // across providers). A NodeTracerProvider with no explicit sampler defaults to
  // ParentBased, which would inherit that parent's sampling decision — so
  // lowering OTEL_TRACES_SAMPLING_RATIO for Grafana would silently drop Langfuse
  // generations whenever the parent HTTP span is sampled out. AlwaysOnSampler
  // decouples Langfuse capture from Grafana's head-sampling: every generation is
  // recorded and exported regardless of the parent decision. Trace id is still
  // inherited from the active parent, so when OTLP is on the generation shares
  // the request's trace id and stays correlatable with the Grafana trace.
  let langfuseProvider: NodeTracerProvider | null = null
  if (langfuseEnabled) {
    langfuseProvider = new NodeTracerProvider({
      resource,
      sampler: new AlwaysOnSampler(),
      spanProcessors: [new LangfuseSpanProcessor({
        publicKey: env.LANGFUSE_PUBLIC_KEY,
        secretKey: env.LANGFUSE_SECRET_KEY,
        baseUrl: env.LANGFUSE_BASE_URL,
        // Railway is long-running → batched. Flushed via
        // langfuseProvider.shutdown() in the SIGTERM handler below.
        exportMode: 'batched',
        // Full override of Langfuse's default filter. Export ONLY spans the
        // @langfuse/tracing SDK created (they carry `langfuse.*` attributes
        // such as `langfuse.observation.type`). This provider should only ever
        // see those anyway; the predicate guards against stray
        // context-propagated spans landing in Langfuse Cloud.
        shouldExportSpan: ({ otelSpan }) =>
          Object.keys(otelSpan.attributes).some(key => key.startsWith('langfuse.')),
      })],
    })
    setLangfuseTracerProvider(langfuseProvider)
    // Single source of truth for "the isolated Langfuse provider is actually
    // wired". The chat route gates generation creation on THIS, not on a second
    // independent key check — if setLangfuseTracerProvider was never called,
    // startObservation would fall back to the GLOBAL provider and leak prompt
    // text to the OTLP/Grafana exporter. Setting the sentinel only here ties the
    // route's gate to the real provider state.
    env.LANGFUSE_TRACING_ACTIVE = '1'
  }

  const sdk = new NodeSDK({
    resource,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(samplingRatio),
    }),
    spanProcessors,
    // Metrics and logs are OTLP-only (Langfuse is traces-only). Omit the
    // readers entirely when OTLP is off so NodeSDK doesn't build exporters
    // pointed at an empty URL.
    ...(otlpEndpoint
      ? {
          metricReaders: [new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
              url: `${otlpEndpoint}/v1/metrics`,
              headers,
            }),
            exportIntervalMillis: 15_000,
            exportTimeoutMillis: 10_000,
          })],
          logRecordProcessors: [new BatchLogRecordProcessor(new OTLPLogExporter({
            url: `${otlpEndpoint}/v1/logs`,
            headers,
          }))],
        }
      : {}),
    instrumentations: [
      // Inbound HTTP is instrumented by @hono/otel inside the Hono pipeline
      // (it sees Hono's matched route pattern; auto-instrumentation can't).
      // Keep HttpInstrumentation for OUTBOUND traces only — LLM gateway,
      // Stripe, Resend, OIDC discovery — so we still get spans on egress.
      new HttpInstrumentation({
        // NOTICE:
        // Do not use `ignoreIncomingRequestHook: () => true` here. In
        // @opentelemetry/instrumentation-http@0.215.0, ignored incoming
        // requests run the whole Node `request` listener inside
        // `suppressTracing(...)`, which also suppresses @hono/otel middleware
        // spans and hand-written route spans. Disabling incoming patching keeps
        // outbound http/https spans without touching Hono's request context.
        disableIncomingRequestInstrumentation: true,
      }),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
      }),
      new IORedisInstrumentation(),
      new RuntimeNodeInstrumentation(),
      // Outbound fetch — HttpInstrumentation only patches node:http/https, not undici.
      new UndiciInstrumentation(),
    ],
  })

  sdk.start()
  console.info(`[otel-preload] OpenTelemetry initialized — OTLP: ${otlpEndpoint || 'off'}, Langfuse: ${langfuseEnabled ? (env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com') : 'off'}, sampling ratio: ${samplingRatio}`)

  // Graceful shutdown — flush pending exports before exit. Idempotent.
  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown)
      return
    shuttingDown = true
    try {
      // Shut down both providers. The Langfuse provider is separate from
      // NodeSDK, so sdk.shutdown() does NOT drain it — flush it explicitly or
      // the last batch of generations is lost on deploy/restart.
      await Promise.all([
        sdk.shutdown(),
        langfuseProvider?.shutdown(),
      ])
      console.info('[otel-preload] OpenTelemetry shut down successfully')
    }
    catch (err) {
      console.error('[otel-preload] Error shutting down OpenTelemetry:', err)
    }
  }
  const shutdownAndExit = () => {
    void shutdown().then(() => exit(0))
  }
  process.on('SIGTERM', shutdownAndExit)
  process.on('SIGINT', shutdownAndExit)
}
