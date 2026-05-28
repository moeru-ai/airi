/**
 * Dashboard generator for `airi-server-overview-cloud.json`.
 *
 * Run: `pnpm -F @proj-airi/server otel:dashboards`
 *  (or directly: `pnpm exec tsx apps/server/otel/grafana/dashboards/build.ts`)
 *
 * Why a generator instead of hand-edited JSON: the dashboard's Grafana v2
 * schema is verbose (~50 lines per panel). Rebuilding the file by hand every
 * time we add a row guarantees drift between query expressions and the
 * panel layout. A small DSL keeps each panel to one or two screen lines and
 * cross-references panel ids → grid positions in one place.
 *
 * Scope: ONE core panel per metric. We intentionally do NOT keep the same
 * metric in stat + trend + bar + pie forms — each metric gets the single
 * visualisation that answers its question best (gauge for bounded ratios,
 * bar gauge for top-N rankings, timeseries for trends, stat for range totals).
 *
 * Visual language:
 *   - stat — absolute counts / range totals
 *   - gauge — bounded ratios (%) where thresholds tell a story (5xx %, fallback %)
 *   - bargauge — top-N leaderboards (which route is hottest / slowest)
 *   - timeseries — trends over time, with rich legend calcs
 *
 * Counter queries follow strict semantics:
 *   - rate() for "right now" trends
 *   - increase($__range) for "total over visible window"
 *   - never raw sum() on a cumulative counter (resets on deploy distort it)
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { exit } from 'node:process'
import { fileURLToPath } from 'node:url'

const PROM = { name: 'grafanacloud-projairi-prom' }
const LOKI = { name: 'grafanacloud-projairi-logs' }
const SCHEMA_VERSION = '13.0.0-23630096546'

// Service / env filter applied to every Prom query. Pulled into a helper so
// the variable name only appears once.
const SERVICE_FILTER = 'service_name=~"$service", deployment_environment=~"$env"'

// Build-script local types. Kept loose — Grafana owns the schema, and we
// validate the rendered JSON by re-importing it into Grafana, not by typing.
type DataSource = typeof PROM | typeof LOKI
interface ThresholdStep { color: string, value: number }
type PanelQuery = ReturnType<typeof query>
type LegendCalc = 'lastNotNull' | 'max' | 'min' | 'mean' | 'sum'

interface QueryOpts {
  instant?: boolean
}

function query(expr: string, legend: string, refId = 'A', datasource: DataSource = PROM, opts: QueryOpts = {}) {
  return {
    kind: 'PanelQuery',
    spec: {
      hidden: false,
      query: {
        datasource,
        group: datasource === LOKI ? 'loki' : 'prometheus',
        kind: 'DataQuery',
        spec: {
          expr,
          legendFormat: legend,
          ...(opts.instant && { instant: true, range: false }),
        },
        version: 'v0',
      },
      refId,
    },
  }
}

function thresholds(steps: ThresholdStep[]) {
  return { mode: 'absolute', steps }
}

interface DefaultsBlockOpts {
  unit: string
  steps: ThresholdStep[]
  decimals?: number
  noValue?: string
  min?: number
  max?: number
}

interface StatPanelOpts {
  unit?: string
  steps?: ThresholdStep[]
  decimals?: number
  noValue?: string
  graphMode?: 'area' | 'none'
}

interface GaugePanelOpts {
  unit?: string
  steps: ThresholdStep[]
  decimals?: number
  min?: number
  max?: number
  noValue?: string
}

interface BarGaugePanelOpts {
  unit?: string
  steps?: ThresholdStep[]
  decimals?: number
  min?: number
  max?: number
  noValue?: string
}

interface TimeseriesPanelOpts {
  unit?: string
  stack?: boolean
  fillOpacity?: number
  legendCalcs?: LegendCalc[]
}

// `noValue` shows a friendly placeholder instead of "No data" red text when
// the env genuinely has zero traffic (e.g. dev, fresh deploy). Empty-string
// fields are omitted from the JSON to keep diffs tidy.
function defaultsBlock({ unit, steps, decimals, noValue, min, max }: DefaultsBlockOpts) {
  return {
    color: { mode: 'thresholds' },
    thresholds: thresholds(steps),
    unit,
    ...(decimals != null && { decimals }),
    ...(noValue != null && { noValue }),
    ...(min != null && { min }),
    ...(max != null && { max }),
  }
}

function statPanel(id: number, title: string, description: string, queries: PanelQuery[], opts: StatPanelOpts = {}) {
  const { unit = 'short', steps = [{ color: 'green', value: 0 }], decimals, noValue, graphMode = 'area' } = opts
  return {
    kind: 'Panel',
    spec: {
      data: { kind: 'QueryGroup', spec: { queries, queryOptions: {}, transformations: [] } },
      description,
      id,
      links: [],
      title,
      vizConfig: {
        group: 'stat',
        kind: 'VizConfig',
        spec: {
          fieldConfig: { defaults: defaultsBlock({ unit, steps, decimals, noValue }), overrides: [] },
          options: {
            colorMode: 'value',
            graphMode,
            justifyMode: 'auto',
            orientation: 'auto',
            percentChangeColorMode: 'standard',
            reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
            showPercentChange: false,
            textMode: 'auto',
            wideLayout: true,
          },
        },
        version: SCHEMA_VERSION,
      },
    },
  }
}

// Bounded ratio with traffic-light thresholds. Use for percent or capacity
// metrics; the radial fill instantly conveys "OK / warn / critical" without
// reading the number.
function gaugePanel(id: number, title: string, description: string, queries: PanelQuery[], opts: GaugePanelOpts) {
  const { unit = 'percent', steps, decimals = 1, min = 0, max = 100, noValue } = opts
  return {
    kind: 'Panel',
    spec: {
      data: { kind: 'QueryGroup', spec: { queries, queryOptions: {}, transformations: [] } },
      description,
      id,
      links: [],
      title,
      vizConfig: {
        group: 'gauge',
        kind: 'VizConfig',
        spec: {
          fieldConfig: { defaults: defaultsBlock({ unit, steps, decimals, min, max, noValue }), overrides: [] },
          options: {
            minVizHeight: 75,
            minVizWidth: 75,
            orientation: 'auto',
            reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
            showThresholdLabels: false,
            showThresholdMarkers: true,
            sizing: 'auto',
          },
        },
        version: SCHEMA_VERSION,
      },
    },
  }
}

// Horizontal bar gauge for top-N leaderboards. Each series (one route) becomes
// one bar; bar length encodes the value and threshold colours flag severity.
// Use over a table when the question is "rank these and show relative
// magnitude" — it reads at a glance without scanning rows or a dead Time
// column. Feed it an INSTANT query (one point per series) so every route
// reduces to a single current value.
function barGaugePanel(id: number, title: string, description: string, queries: PanelQuery[], opts: BarGaugePanelOpts = {}) {
  const { unit = 'short', steps = [{ color: 'green', value: 0 }], decimals, min, max, noValue } = opts
  return {
    kind: 'Panel',
    spec: {
      data: { kind: 'QueryGroup', spec: { queries, queryOptions: {}, transformations: [] } },
      description,
      id,
      links: [],
      title,
      vizConfig: {
        group: 'bargauge',
        kind: 'VizConfig',
        spec: {
          fieldConfig: { defaults: defaultsBlock({ unit, steps, decimals, min, max, noValue }), overrides: [] },
          options: {
            displayMode: 'gradient',
            maxVizHeight: 300,
            minVizHeight: 12,
            minVizWidth: 8,
            namePlacement: 'auto',
            orientation: 'horizontal',
            reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
            showUnfilled: true,
            sizing: 'auto',
            valueMode: 'color',
          },
        },
        version: SCHEMA_VERSION,
      },
    },
  }
}

function timeseriesPanel(id: number, title: string, description: string, queries: PanelQuery[], opts: TimeseriesPanelOpts = {}) {
  const { unit = 'short', stack = false, fillOpacity = 20, legendCalcs = ['lastNotNull', 'max'] } = opts
  return {
    kind: 'Panel',
    spec: {
      data: { kind: 'QueryGroup', spec: { queries, queryOptions: {}, transformations: [] } },
      description,
      id,
      links: [],
      title,
      vizConfig: {
        group: 'timeseries',
        kind: 'VizConfig',
        spec: {
          fieldConfig: {
            defaults: {
              color: { mode: 'palette-classic' },
              custom: {
                axisBorderShow: false,
                axisCenteredZero: false,
                axisColorMode: 'text',
                axisLabel: '',
                axisPlacement: 'auto',
                barAlignment: 0,
                barWidthFactor: 0.6,
                drawStyle: 'line',
                fillOpacity,
                gradientMode: 'none',
                hideFrom: { legend: false, tooltip: false, viz: false },
                insertNulls: false,
                lineInterpolation: 'smooth',
                lineWidth: 1,
                pointSize: 5,
                scaleDistribution: { type: 'linear' },
                showPoints: 'auto',
                showValues: false,
                spanNulls: false,
                stacking: { group: 'A', mode: stack ? 'normal' : 'none' },
                thresholdsStyle: { mode: 'off' },
              },
              thresholds: thresholds([{ color: 'green', value: 0 }]),
              unit,
            },
            overrides: [],
          },
          options: {
            annotations: { clustering: -1, multiLane: false },
            // Show last + max in the legend table so viewers don't have to
            // click each line to see numbers — same trick as Keycloak's
            // "Login Errors" panel.
            legend: { calcs: legendCalcs, displayMode: 'table', placement: 'right', showLegend: true },
            tooltip: { hideZeros: false, mode: 'multi', sort: 'desc' },
          },
        },
        version: SCHEMA_VERSION,
      },
    },
  }
}

function logsPanel(id: number, title: string, description: string, expr: string) {
  return {
    kind: 'Panel',
    spec: {
      data: { kind: 'QueryGroup', spec: { queries: [query(expr, '', 'A', LOKI)], queryOptions: {}, transformations: [] } },
      description,
      id,
      links: [],
      title,
      vizConfig: {
        group: 'logs',
        kind: 'VizConfig',
        spec: {
          fieldConfig: { defaults: {}, overrides: [] },
          options: {
            dedupStrategy: 'none',
            enableInfiniteScrolling: false,
            enableLogDetails: true,
            prettifyLogMessage: false,
            showCommonLabels: false,
            showControls: false,
            showFieldSelector: false,
            showLabels: true,
            showLevel: true,
            showLogAttributes: true,
            showTime: true,
            sortOrder: 'Descending',
            timestampResolution: 'ms',
            unwrappedColumns: false,
            wrapLogMessage: true,
          },
        },
        version: SCHEMA_VERSION,
      },
    },
  }
}

function item(name: string, x: number, y: number, width: number, height: number) {
  return { kind: 'GridLayoutItem', spec: { element: { kind: 'ElementReference', name }, height, width, x, y } }
}

function row(title: string, items: ReturnType<typeof item>[], { collapse = false }: { collapse?: boolean } = {}) {
  return {
    kind: 'RowsLayoutRow',
    spec: {
      collapse,
      layout: { kind: 'GridLayout', spec: { items } },
      title,
    },
  }
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

// Grafana v2 element entries are opaque to us — each helper returns a Panel
// shape with deeply-nested fieldConfig/options that we don't statically type
// (Grafana owns that schema, and any drift would surface at dashboard import
// time, not compile time). Treat `elements` as a string-keyed bag of
// `unknown`-shaped panel JSON; the cross-check below catches mismatches
// between defined panel ids and layout references.
const elements: Record<string, unknown> = {}

// --- Row 1: Service Health — "is anything broken right now?" ---------------
// All ratios use a fixed [5m] window and DO NOT follow the time picker: this
// row is an on-call glance, the numbers should be stable regardless of which
// range the viewer picked. Trends live in their own rows below.
elements['panel-1'] = statPanel(
  1,
  'New Users 24h',
  'Rolling 24h `increase(user.registered)` — counts the Better Auth `databaseHooks.user.create.after` fires over the last 24 hours. Operational signup signal; for DAU / WAU / MAU query PostHog (`event = session_started`).',
  [query(`sum(increase(user_registered_total{${SERVICE_FILTER}}[24h]))`, 'new users')],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1000 }] },
)

elements['panel-15'] = statPanel(
  15,
  'Active Sessions',
  'COUNT(*) over the Better Auth `session` table where `expires_at > now()`. Counts session **rows**, not users — divide by panel-1 to spot row inflation.',
  [query(`avg(user_active_sessions{${SERVICE_FILTER}})`, 'sessions')],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 5000 }] },
)

elements['panel-3'] = statPanel(
  3,
  'Req/s (5m)',
  '5-minute average inbound HTTP request rate. /livez and /readyz (K8s probes) are excluded at the @hono/otel middleware level so this reflects real user traffic.',
  [query(`sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[5m]))`, 'req/s')],
  { unit: 'reqps', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 100 }, { color: 'red', value: 500 }], decimals: 2 },
)

elements['panel-4'] = gaugePanel(
  4,
  '5xx Rate %',
  '5xx responses ÷ all responses over the last 5m. Fixed 5m window for an on-call glance ("is the service failing right now"). >1% warns, >5% pages.',
  [query(
    `100 * sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_response_status_code=~"5.."}[5m])) / clamp_min(sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[5m])), 1)`,
    'fail %',
  )],
  { steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1 }, { color: 'red', value: 5 }], max: 10, decimals: 2 },
)

elements['panel-5'] = statPanel(
  5,
  'LLM Req/s (5m)',
  '5-minute average LLM gateway request rate (chat + tts). For per-model trends see the LLM Gateway row.',
  [query(`sum(rate(gen_ai_client_operation_count_total{${SERVICE_FILTER}}[5m]))`, 'req/s')],
  { unit: 'reqps', decimals: 2 },
)

elements['panel-6'] = gaugePanel(
  6,
  'Email Failure %',
  'Email failures ÷ total attempts over the last 5m. >5% means Resend / DNS / suppression-list problems blocking auth flows.',
  [query(
    `100 * sum(rate(airi_email_failures_total{${SERVICE_FILTER}}[5m])) / clamp_min(sum(rate(airi_email_send_total{${SERVICE_FILTER}}[5m])) + sum(rate(airi_email_failures_total{${SERVICE_FILTER}}[5m])), 1)`,
    'fail %',
  )],
  { steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1 }, { color: 'red', value: 5 }], max: 20, decimals: 1, noValue: '0' },
)

// --- Row 2: HTTP — traffic ranking, error trend, latency trend -------------
elements['panel-16'] = barGaugePanel(
  16,
  'Top Routes by Requests (range)',
  'Top Hono-matched routes by request count over the dashboard range. The main traffic list: which API surfaces are hottest. Wildcard patterns like `/api/v1/openai/*` are requests that did not reach a concrete handler (404 / auth-rejected); concrete paths are successful routes.',
  [query(
    `topk(10, sum by (http_route) (increase(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!=""}[$__range])))`,
    '{{http_route}}',
    'A',
    PROM,
    { instant: true },
  )],
  { unit: 'short' },
)

elements['panel-40'] = timeseriesPanel(
  40,
  'Error Rate %',
  'Error rate as a percentage of total non-OPTIONS HTTP traffic — 4xx (client-side: validation, auth, missing routes) and 5xx (server-side) over the same denominator.',
  [
    query(
      `100 * sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_response_status_code=~"4.."}[$__rate_interval])) / clamp_min(sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[$__rate_interval])), 1)`,
      '4xx %',
      'A',
    ),
    query(
      `100 * sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_response_status_code=~"5.."}[$__rate_interval])) / clamp_min(sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[$__rate_interval])), 1)`,
      '5xx %',
      'B',
    ),
  ],
  { unit: 'percent' },
)

elements['panel-20'] = timeseriesPanel(
  20,
  'HTTP P95 by Route',
  'P95 latency per Hono-matched route, excluding /api/v1/openai/* (LLM gateway latency lives in the LLM Gateway row). 404s excluded so missing-route noise does not skew the curve.',
  [query(
    `histogram_quantile(0.95, sum by (le, http_route) (rate(http_server_request_duration_seconds_bucket{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!~"/api/v1/openai/.*", http_response_status_code!="404"}[$__rate_interval])))`,
    '{{http_route}}',
  )],
  { unit: 's' },
)

// --- Row 3: LLM Gateway — request mix, latency, billed usage ---------------
elements['panel-11'] = timeseriesPanel(
  11,
  'LLM Request Rate by Model',
  'Per-model request rate (chat + tts). Useful for capacity planning and spotting model-routing regressions.',
  [query(
    `sum by (gen_ai_request_model) (rate(gen_ai_client_operation_count_total{${SERVICE_FILTER}, gen_ai_request_model!=""}[$__rate_interval]))`,
    '{{gen_ai_request_model}}',
  )],
  { unit: 'reqps' },
)

elements['panel-21'] = timeseriesPanel(
  21,
  'LLM Latency P95',
  'Two P95 latency signals for the LLM gateway, aggregated across models. TTFB = time to first streamed token (streaming chat UX). End-to-end = full operation duration — the only latency signal for non-streaming chat and TTS, which have no first-token event.',
  [
    query(`histogram_quantile(0.95, sum by (le) (rate(gen_ai_client_first_token_duration_seconds_bucket{${SERVICE_FILTER}}[$__rate_interval])))`, 'TTFB p95', 'A'),
    query(`histogram_quantile(0.95, sum by (le) (rate(gen_ai_client_operation_duration_seconds_bucket{${SERVICE_FILTER}}[$__rate_interval])))`, 'end-to-end p95', 'B'),
  ],
  { unit: 's' },
)

elements['panel-72'] = timeseriesPanel(
  72,
  'LLM Flux Consumed by Model',
  'Normal flux debited per LLM request, by model (flux/sec). The billed-usage counterpart to panel-43 (⚠ Flux Unbilled): together they show what was charged vs what leaked. A model trending up here without matching request-rate growth means per-call cost rose.',
  [query(
    `sum by (gen_ai_request_model) (rate(airi_billing_flux_consumed_total{${SERVICE_FILTER}, gen_ai_request_model!=""}[$__rate_interval]))`,
    '{{gen_ai_request_model}}',
  )],
  { unit: 'short' },
)

// --- Row 4: LLM Tokens & Quality — usage totals + revenue-leak alerts ------
elements['panel-73'] = statPanel(
  73,
  'Tokens Consumed (range)',
  'Total input and output tokens billed over the dashboard range, from the upstream `usage` block (requests where the upstream omits usage are not counted). The cumulative counterpart to panel-71 throughput — use for "how many tokens did we burn this window" cost math.',
  [
    query(`sum(increase(gen_ai_client_token_usage_input_total{${SERVICE_FILTER}}[$__range]))`, 'input', 'A'),
    query(`sum(increase(gen_ai_client_token_usage_output_total{${SERVICE_FILTER}}[$__range]))`, 'output', 'B'),
  ],
  { unit: 'short', noValue: '0', graphMode: 'none' },
)

elements['panel-71'] = timeseriesPanel(
  71,
  'LLM Token Throughput',
  'Input vs output token throughput across the LLM gateway (tokens/sec). Recorded per request from the upstream `usage` block. Use for capacity planning and cost estimation. input = prompt tokens consumed; output = completion tokens generated.',
  [
    query(`sum(rate(gen_ai_client_token_usage_input_total{${SERVICE_FILTER}}[$__rate_interval]))`, 'input tokens/s', 'A'),
    query(`sum(rate(gen_ai_client_token_usage_output_total{${SERVICE_FILTER}}[$__rate_interval]))`, 'output tokens/s', 'B'),
  ],
  { unit: 'short' },
)

elements['panel-43'] = statPanel(
  43,
  '⚠ Flux Unbilled (range)',
  'Flux owed by users but never debited for unexpected reasons (excludes `partial_debit_drained`, a known partial-balance drain path). Real revenue leak — DB latency and HTTP 5xx alerts do NOT cover this, because the response was 2xx and the catch path is silent.',
  [query(
    `sum(increase(airi_billing_flux_unbilled_total{${SERVICE_FILTER}, reason!="partial_debit_drained"}[$__range]))`,
    'flux',
  )],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'red', value: 1 }], noValue: '0', graphMode: 'none' },
)

elements['panel-41'] = statPanel(
  41,
  'Stream Interruptions (range)',
  'LLM streams that died mid-flight over the dashboard range. before_first_chunk = upstream blew up; mid_stream = partial delivery (user saw a broken response).',
  [query(
    `sum(increase(airi_gen_ai_stream_interrupted_total{${SERVICE_FILTER}}[$__range]))`,
    'interruptions',
  )],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1 }, { color: 'red', value: 10 }], noValue: '0', graphMode: 'none' },
)

// --- Row 5: LLM Router Health — "wake someone up" gateway indicators -------
// Counters from `apps/server/src/services/llm-router/router.ts`, emitted for
// every chat AND tts dispatch attempt. Prom names (OTel dot → underscore,
// `_total` for counters): airi_gen_ai_gateway_{key_exhausted,decrypt_failures,
// fallback_count,upstream_errors}_total.
elements['panel-60'] = statPanel(
  60,
  'Key Exhausted (5m)',
  'Number of (model, upstream) pairs that ran out of usable keys within one user request over the last 5 minutes. Sustained > 0 = a provider account is dead or every stored ciphertext is failing to decrypt — page on-call.',
  [query(`sum(increase(airi_gen_ai_gateway_key_exhausted_total{${SERVICE_FILTER}}[5m]))`, 'events')],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'red', value: 1 }], noValue: '0', graphMode: 'none' },
)

elements['panel-61'] = statPanel(
  61,
  'Decrypt Failures (5m)',
  'Envelope-crypto decrypt failures in the key rotator. Non-zero is security-relevant: either the master key was rotated without re-wrapping ciphertexts, or someone forged a config blob.',
  [query(`sum(increase(airi_gen_ai_gateway_decrypt_failures_total{${SERVICE_FILTER}}[5m]))`, 'events')],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'red', value: 1 }], noValue: '0', graphMode: 'none' },
)

elements['panel-62'] = gaugePanel(
  62,
  'Fallback Ratio % (5m)',
  'Fallback attempts ÷ total LLM operations over the last 5m. Sustained > 30% means one provider is degraded and the router is silently masking it for users while burning quota on the failing upstream.',
  [query(
    `100 * sum(rate(airi_gen_ai_gateway_fallback_count_total{${SERVICE_FILTER}}[5m])) / clamp_min(sum(rate(gen_ai_client_operation_count_total{${SERVICE_FILTER}}[5m])), 1)`,
    'fallback %',
  )],
  { steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 10 }, { color: 'red', value: 30 }], max: 100, decimals: 1, noValue: '0' },
)

elements['panel-65'] = timeseriesPanel(
  65,
  'Upstream Errors by Status Code',
  'Per-upstream non-2xx response rate split by status code. Only counts attempts where the upstream actually answered. 401/403 = bad key; 429 = quota; 5xx = upstream outage.',
  [query(
    `sum by (provider, status_code) (rate(airi_gen_ai_gateway_upstream_errors_total{${SERVICE_FILTER}}[$__rate_interval]))`,
    '{{provider}} · {{status_code}}',
  )],
  { unit: 'ops' },
)

// --- Row 6: Business — money flow ------------------------------------------
elements['panel-30'] = statPanel(
  30,
  'Revenue (range)',
  'Stripe revenue over dashboard range, in major currency unit (cents → dollars). Cross-currency sums are meaningless — always grouped by currency. Empty in dev / fresh deploys.',
  [query(
    `sum by (currency) (increase(airi_stripe_revenue_minor_unit_total{${SERVICE_FILTER}, currency!=""}[$__range])) / 100`,
    '{{currency}}',
  )],
  { unit: 'short', decimals: 2, noValue: '—' },
)

elements['panel-31'] = gaugePanel(
  31,
  'Checkout Conversion %',
  'Completed checkouts ÷ created checkouts over dashboard range. Drops can flag price-page bugs or payment-method outages.',
  [query(
    `100 * sum(increase(stripe_checkout_completed_total{${SERVICE_FILTER}}[$__range])) / clamp_min(sum(increase(stripe_checkout_created_total{${SERVICE_FILTER}}[$__range])), 1)`,
    'completed %',
  )],
  { steps: [{ color: 'red', value: 0 }, { color: 'yellow', value: 30 }, { color: 'green', value: 60 }], decimals: 1, noValue: '—' },
)

elements['panel-32'] = statPanel(
  32,
  'Stripe Events (range)',
  'Webhook events grouped by event.type. Pattern shifts (e.g. surge in invoice.payment_failed) indicate billing health.',
  [query(
    `sum by (event_type) (increase(stripe_events_total{${SERVICE_FILTER}, event_type!=""}[$__range]))`,
    '{{event_type}}',
  )],
  { unit: 'short', noValue: '—', graphMode: 'none' },
)

// --- Row 7: Infrastructure (collapsed) — process / DB health ---------------
elements['panel-50'] = statPanel(
  50,
  'DB Query P95 (5m)',
  'PostgreSQL query duration P95 from PgInstrumentation. Fixed 5m window. Spikes correlate with index misses, connection exhaustion, or backend lock contention.',
  [query(
    `histogram_quantile(0.95, sum by (le) (rate(db_client_operation_duration_seconds_bucket{${SERVICE_FILTER}}[5m])))`,
    'p95',
  )],
  { unit: 's', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 0.05 }, { color: 'red', value: 0.5 }], decimals: 3 },
)

elements['panel-51'] = timeseriesPanel(
  51,
  'DB Pool Connections by Instance',
  'Open PostgreSQL connections, per replica (`service_instance_id`). Each instance has its own pool sized by env `DB_POOL_MAX`. One instance with a permanently-high count = pool leak on that pod.',
  [query(
    `sum by (service_instance_id) (db_client_connection_count{${SERVICE_FILTER}})`,
    '{{service_instance_id}}',
  )],
  { unit: 'short' },
)

elements['panel-52'] = timeseriesPanel(
  52,
  'Heap Used % by Instance',
  'V8 heap used ÷ heap limit, per replica (`service_instance_id`). A single replica trending up while others stay flat = leak on that pod.',
  [query(
    `100 * sum by (service_instance_id) (v8js_memory_heap_used_bytes{${SERVICE_FILTER}}) / clamp_min(sum by (service_instance_id) (v8js_memory_heap_limit_bytes{${SERVICE_FILTER}}), 1)`,
    '{{service_instance_id}}',
  )],
  { unit: 'percent' },
)

elements['panel-53'] = timeseriesPanel(
  53,
  'Event Loop Delay P99 by Instance',
  'P99 event-loop delay per replica. One replica climbing while others stay flat = CPU-bound work pinning that pod. >50ms sustained is bad anywhere.',
  [query(
    `max by (service_instance_id) (nodejs_eventloop_delay_p99_seconds{${SERVICE_FILTER}})`,
    '{{service_instance_id}}',
  )],
  { unit: 's' },
)

// --- Row 8: Logs ------------------------------------------------------------
elements['panel-91'] = logsPanel(
  91,
  '5xx Error Logs',
  'Server-side error logs (level=warn|error) from Loki. Derived fields make `trace_id` and `req` clickable — `trace_id` jumps to Tempo for full request playback.',
  `{${SERVICE_FILTER}} | json | level=~"warn|error"`,
)

elements['panel-90'] = logsPanel(
  90,
  'Application Logs',
  'Live application logs from Loki. Filter via the panel UI; click trace_id to jump to Tempo.',
  `{${SERVICE_FILTER}} |= \`\``,
)

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const rows = [
  // Row 1: six health stats/gauges, each 4 wide (4×6=24).
  row('Service Health', [
    item('panel-1', 0, 0, 4, 4),
    item('panel-15', 4, 0, 4, 4),
    item('panel-3', 8, 0, 4, 4),
    item('panel-4', 12, 0, 4, 4),
    item('panel-5', 16, 0, 4, 4),
    item('panel-6', 20, 0, 4, 4),
  ]),
  // Row 2: HTTP — request ranking (bar), error trend, latency trend.
  row('HTTP', [
    item('panel-16', 0, 0, 8, 8),
    item('panel-40', 8, 0, 8, 8),
    item('panel-20', 16, 0, 8, 8),
  ]),
  // Row 3: LLM gateway — request mix, latency, billed flux.
  row('LLM Gateway', [
    item('panel-11', 0, 0, 8, 8),
    item('panel-21', 8, 0, 8, 8),
    item('panel-72', 16, 0, 8, 8),
  ]),
  // Row 4: token totals + throughput + the two revenue/quality alert stats.
  row('LLM Tokens & Quality', [
    item('panel-73', 0, 0, 6, 7),
    item('panel-71', 6, 0, 10, 7),
    item('panel-43', 16, 0, 4, 7),
    item('panel-41', 20, 0, 4, 7),
  ]),
  // Row 5: router health — three "wake someone up" stats/gauge + upstream errors.
  row('LLM Router Health', [
    item('panel-60', 0, 0, 6, 6),
    item('panel-61', 6, 0, 6, 6),
    item('panel-62', 12, 0, 6, 6),
    item('panel-65', 18, 0, 6, 6),
  ]),
  // Row 6: business money flow.
  row('Business', [
    item('panel-30', 0, 0, 8, 7),
    item('panel-31', 8, 0, 8, 7),
    item('panel-32', 16, 0, 8, 7),
  ]),
  // Row 7: infra (collapsed) — by-instance breakdowns catch single-replica issues.
  row('Infrastructure', [
    item('panel-50', 0, 0, 6, 6),
    item('panel-51', 6, 0, 6, 6),
    item('panel-52', 12, 0, 6, 6),
    item('panel-53', 18, 0, 6, 6),
  ], { collapse: true }),
  // Row 8: full-width logs — errors on top (triage focus), firehose below.
  row('Logs', [
    item('panel-91', 0, 0, 24, 10),
    item('panel-90', 0, 10, 24, 10),
  ]),
]

// ---------------------------------------------------------------------------
// Variables (use target_info — always present, owns service.name + deployment.environment labels)
// ---------------------------------------------------------------------------

const variables = [
  {
    kind: 'QueryVariable',
    spec: {
      allowCustomValue: true,
      current: { text: 'All', value: '$__all' },
      definition: 'label_values(target_info, deployment_environment)',
      hide: 'dontHide',
      includeAll: true,
      multi: false,
      name: 'env',
      options: [],
      query: {
        datasource: PROM,
        group: 'prometheus',
        kind: 'DataQuery',
        spec: { __legacyStringValue: 'label_values(target_info, deployment_environment)' },
        version: 'v0',
      },
      refresh: 'onDashboardLoad',
      regex: '',
      regexApplyTo: 'value',
      skipUrlSync: false,
      sort: 'disabled',
    },
  },
  {
    kind: 'QueryVariable',
    spec: {
      allowCustomValue: true,
      current: { text: ['server'], value: ['server'] },
      definition: 'label_values(target_info{deployment_environment=~"$env"}, service_name)',
      hide: 'dontHide',
      includeAll: true,
      multi: true,
      name: 'service',
      options: [],
      query: {
        datasource: PROM,
        group: 'prometheus',
        kind: 'DataQuery',
        spec: { __legacyStringValue: 'label_values(target_info{deployment_environment=~"$env"}, service_name)' },
        version: 'v0',
      },
      refresh: 'onDashboardLoad',
      regex: '',
      regexApplyTo: 'value',
      skipUrlSync: false,
      sort: 'disabled',
    },
  },
]

// ---------------------------------------------------------------------------
// Top-level dashboard
// ---------------------------------------------------------------------------

/**
 * AIRI Server Overview dashboard.
 *
 * Reading order:
 *   1. Service Health — six gauges/stats, "is everything OK right now?"
 *   2. HTTP — request ranking, error rate, latency by route
 *   3. LLM Gateway — request mix, latency (TTFB + end-to-end), billed flux
 *   4. LLM Tokens & Quality — token totals/throughput, revenue-leak alerts
 *   5. LLM Router Health — key/decrypt/fallback "wake someone up" signals
 *   6. Business — Stripe / Flux money flow
 *   7. Infrastructure (collapsed) — DB / runtime health for triage
 *   8. Logs — Loki for live debugging
 *
 * One metric, one panel: we deliberately do not duplicate a metric across
 * stat/trend/bar/pie forms. Counter conventions: rate() for "now" trends,
 * increase($__range) for "total over window", never raw sum() on a counter.
 *
 * Variables source from `target_info` (always present, no business-metric
 * dependency) so the dashboard never goes blank when an app metric is renamed.
 */
const dashboard = {
  annotations: [
    {
      kind: 'AnnotationQuery',
      spec: {
        builtIn: true,
        enable: true,
        hide: true,
        iconColor: 'rgba(0, 211, 255, 1)',
        name: 'Annotations & Alerts',
        query: {
          datasource: { name: '-- Grafana --' },
          group: 'grafana',
          kind: 'DataQuery',
          spec: {},
          version: 'v0',
        },
      },
    },
  ],
  cursorSync: 'Crosshair',
  editable: true,
  elements,
  layout: { kind: 'RowsLayout', spec: { rows } },
  links: [],
  liveNow: false,
  preload: false,
  tags: ['airi', 'observability', 'grafana-cloud'],
  timeSettings: {
    autoRefresh: '',
    autoRefreshIntervals: ['5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h', '2h', '1d'],
    fiscalYearStartMonth: 0,
    from: 'now-1h',
    hideTimepicker: false,
    timezone: 'browser',
    to: 'now',
  },
  title: 'AIRI Server Overview',
  variables,
}

const here = dirname(fileURLToPath(import.meta.url))
const outPath = join(here, 'airi-server-overview-cloud.json')
writeFileSync(outPath, `${JSON.stringify(dashboard, null, 2)}\n`)
console.info(`wrote ${outPath}`)

// Cross-check elements ↔ layout references
const elementNames = new Set(Object.keys(dashboard.elements))
const refs = new Set<string>()
function walk(o: unknown): void {
  if (!o || typeof o !== 'object')
    return
  const node = o as { kind?: unknown, name?: unknown }
  if (node.kind === 'ElementReference' && typeof node.name === 'string')
    refs.add(node.name)
  for (const v of Object.values(o)) walk(v)
}
walk(dashboard.layout)
const orphanRefs = [...refs].filter(r => !elementNames.has(r))
const unusedElems = [...elementNames].filter(e => !refs.has(e))
console.info(`panels defined: ${elementNames.size}, referenced: ${refs.size}, orphans: ${orphanRefs.length}, unused: ${unusedElems.length}`)
if (orphanRefs.length || unusedElems.length) {
  console.error('orphans:', orphanRefs)
  console.error('unused:', unusedElems)
  exit(1)
}
