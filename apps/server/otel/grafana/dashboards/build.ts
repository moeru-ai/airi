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
 * Visual language (intentional, see "AIRI Server Overview" docstring):
 *   - stat (with sparkline) — absolute counts that change continuously
 *   - gauge — bounded ratios (%) where thresholds tell a story (5xx %, heap %)
 *   - piechart (donut) — current-state breakdown ("what KIND of traffic now")
 *   - timeseries — trends over time, always with rich legend calcs so the
 *     viewer sees current/max values without clicking the panel
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

function query(expr: string, legend: string, refId = 'A', datasource: DataSource = PROM) {
  return {
    kind: 'PanelQuery',
    spec: {
      hidden: false,
      query: {
        datasource,
        group: datasource === LOKI ? 'loki' : 'prometheus',
        kind: 'DataQuery',
        spec: { expr, legendFormat: legend },
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

interface PiePanelOpts {
  unit?: string
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

// Donut for distribution-at-a-glance. Each query result becomes a slice;
// percentages render automatically. Use over stacked-area when the question
// is "what's the current breakdown" rather than "how is it changing".
function piePanel(id: number, title: string, description: string, queries: PanelQuery[], opts: PiePanelOpts = {}) {
  const { unit = 'short', noValue = 'no traffic' } = opts
  return {
    kind: 'Panel',
    spec: {
      data: { kind: 'QueryGroup', spec: { queries, queryOptions: {}, transformations: [] } },
      description,
      id,
      links: [],
      title,
      vizConfig: {
        group: 'piechart',
        kind: 'VizConfig',
        spec: {
          fieldConfig: {
            defaults: {
              color: { mode: 'palette-classic' },
              custom: { hideFrom: { legend: false, tooltip: false, viz: false } },
              unit,
              ...(noValue != null && { noValue }),
            },
            overrides: [],
          },
          options: {
            displayLabels: ['percent'],
            legend: {
              calcs: ['lastNotNull'],
              displayMode: 'table',
              placement: 'right',
              showLegend: true,
              values: ['value', 'percent'],
            },
            pieType: 'donut',
            reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
            tooltip: { hideZeros: false, mode: 'single', sort: 'none' },
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

// Row 1: Service Health — answers "is anything broken right now?"
// Mix of stats (absolute counts) and gauges (bounded ratios with thresholds).
elements['panel-1'] = statPanel(
  1,
  'Active Users',
  'Currently active sessions in Postgres (Better Auth `session.expires_at > now()`). Cluster-wide gauge — every replica polls the same DB on a 10s cache. We aggregate with `avg()` (not `sum()`, which would multiply by replica count; not `max()`, which biases high when one replica\'s cache is fresher than another\'s after a logout).',
  [query(`avg(user_active_sessions{${SERVICE_FILTER}})`, 'sessions')],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1000 }] },
)

elements['panel-2'] = statPanel(
  2,
  'WS Connections',
  'Live registry size from chat-ws (ObservableGauge, scraped each export interval).',
  [query(`sum(ws_connections_active{${SERVICE_FILTER}})`, 'connections')],
  { unit: 'short' },
)

elements['panel-3'] = statPanel(
  3,
  'Req/s (5m)',
  '5-minute average inbound HTTP request rate. /health (Railway probe) is excluded at the @hono/otel middleware level so this reflects real user traffic.',
  [query(`sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[5m]))`, 'req/s')],
  { unit: 'reqps', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 100 }, { color: 'red', value: 500 }], decimals: 2 },
)

elements['panel-4'] = gaugePanel(
  4,
  '5xx Rate %',
  '5xx responses ÷ all responses over the last 5m. Spikes correlate with deploys, upstream outages, or DB problems. >1% warns, >5% pages.',
  [query(
    `100 * sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_response_status_code=~"5.."}[5m])) / clamp_min(sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[5m])), 1)`,
    'fail %',
  )],
  { steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1 }, { color: 'red', value: 5 }], max: 10, decimals: 2 },
)

elements['panel-5'] = statPanel(
  5,
  'LLM Req/s (5m)',
  '5-minute average LLM gateway request rate (chat + tts).',
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

// Row 2: Distribution — "what KIND of traffic right now?"
// Donuts answer the current breakdown question better than stacked area.
// Use `topk(N, ...)` so a long-tail label set doesn't render an unreadable
// 30-slice pie.
elements['panel-7'] = piePanel(
  7,
  'HTTP Methods (last 5m)',
  'Share of inbound HTTP requests by method. Skew toward POST often signals a misbehaving client; surprise PUT/DELETE may indicate stale clients.',
  [query(
    `sum by (http_request_method) (increase(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[5m]))`,
    '{{http_request_method}}',
  )],
)

elements['panel-8'] = piePanel(
  8,
  'LLM Models (last 5m)',
  'Share of LLM gateway calls by model. Quickly shows which model is doing the heavy lifting.',
  [query(
    `topk(8, sum by (gen_ai_request_model) (increase(gen_ai_client_operation_count_total{${SERVICE_FILTER}, gen_ai_request_model!=""}[5m])))`,
    '{{gen_ai_request_model}}',
  )],
)

elements['panel-9'] = piePanel(
  9,
  'HTTP Status Codes (last 5m)',
  'Distribution of response codes. A healthy server is ~95%+ 2xx — yellow/red slices stand out instantly.',
  [query(
    `sum by (http_response_status_code) (increase(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[5m]))`,
    '{{http_response_status_code}}',
  )],
)

// Row 3: Traffic Trends — same data as Row 2, but answering "how is it changing"
elements['panel-10'] = timeseriesPanel(
  10,
  'HTTP Request Rate by Method',
  'Inbound rate split by HTTP method, showing the time evolution of the donut in row 2.',
  [query(
    `sum by (http_request_method) (rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[$__rate_interval]))`,
    '{{http_request_method}}',
  )],
  { unit: 'reqps' },
)

elements['panel-11'] = timeseriesPanel(
  11,
  'LLM Request Rate by Model',
  'Per-model request rate. Useful for capacity planning and spotting model-routing regressions.',
  [query(
    `sum by (gen_ai_request_model) (rate(gen_ai_client_operation_count_total{${SERVICE_FILTER}, gen_ai_request_model!=""}[$__rate_interval]))`,
    '{{gen_ai_request_model}}',
  )],
  { unit: 'reqps' },
)

elements['panel-12'] = timeseriesPanel(
  12,
  'WS Messages I/O',
  'WebSocket message throughput in both directions. Sent = server → client; received = client → server.',
  [
    query(`sum(rate(ws_messages_sent_total{${SERVICE_FILTER}}[$__rate_interval]))`, 'sent/s', 'A'),
    query(`sum(rate(ws_messages_received_total{${SERVICE_FILTER}}[$__rate_interval]))`, 'received/s', 'B'),
  ],
  { unit: 'ops' },
)

// Row 4: Latency — how slow we are
elements['panel-20'] = timeseriesPanel(
  20,
  'HTTP P95 by Route',
  'P95 latency per Hono-matched route, excluding /api/v1/openai/* (LLM gateway latency lives in row 4 right). Routes are the route patterns @hono/otel sees AFTER Hono matches — concrete URLs collapse cleanly into one series per route.',
  [query(
    `histogram_quantile(0.95, sum by (le, http_route) (rate(http_server_request_duration_seconds_bucket{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!~"/api/v1/openai/.*", http_response_status_code!="404"}[$__rate_interval])))`,
    '{{http_route}}',
  )],
  { unit: 's' },
)

elements['panel-21'] = timeseriesPanel(
  21,
  'LLM TTFB P95 by Model',
  'Time from request start to first streamed token. Tracks streaming chat experience independently from total operation duration.',
  [query(
    `histogram_quantile(0.95, sum by (le, gen_ai_request_model) (rate(gen_ai_client_first_token_duration_seconds_bucket{${SERVICE_FILTER}, gen_ai_request_model!=""}[$__rate_interval])))`,
    '{{gen_ai_request_model}}',
  )],
  { unit: 's' },
)

// Row 5: Errors / Quality — what's failing
elements['panel-40'] = timeseriesPanel(
  40,
  '4xx / 5xx Rate',
  'Stacked error response rates. 4xx surfaces client-side issues (validation, auth); 5xx is server-side. 200/3xx are intentionally excluded so a small absolute number isn\'t hidden behind a wall of green.',
  [query(
    `sum by (http_response_status_code) (rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_response_status_code=~"4..|5.."}[$__rate_interval]))`,
    '{{http_response_status_code}}',
  )],
  { unit: 'reqps', stack: true, fillOpacity: 60 },
)

elements['panel-41'] = statPanel(
  41,
  'Stream Interruptions (range)',
  'LLM streams that died mid-flight over the dashboard time range. before_first_chunk = upstream blew up; mid_stream = partial delivery (user saw a broken response).',
  [query(
    `sum(increase(airi_gen_ai_stream_interrupted_total{${SERVICE_FILTER}}[$__range]))`,
    'interruptions',
  )],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1 }, { color: 'red', value: 10 }], noValue: '0', graphMode: 'none' },
)

elements['panel-43'] = statPanel(
  43,
  '⚠ Flux Unbilled (range)',
  'Flux value owed by users but never debited (post-stream debit failed AFTER the LLM response was already sent). Real revenue leak — DB latency and HTTP 5xx alerts do NOT cover this, because the response was 2xx and the catch path is silent. Any sustained >0 should page on-call.',
  [query(
    `sum(increase(airi_billing_flux_unbilled_total{${SERVICE_FILTER}}[$__range]))`,
    'flux',
  )],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'red', value: 1 }], noValue: '0', graphMode: 'none' },
)

elements['panel-42'] = timeseriesPanel(
  42,
  'Rate-Limit Blocks',
  'Requests blocked by the in-memory rate limiter, by route + key type. NOTE: limiter is in-memory per replica (`apps/server/src/middlewares/rate-limit.ts`), so the configured limit applies independently on each pod — effective cluster-wide allowance is roughly `limit × replica_count`. The values here are absolute blocks summed across replicas, not a percentage of capacity. Sustained activity = attack, misconfigured client, or limit-too-low for current traffic.',
  [query(
    `sum by (route, key_type) (rate(airi_rate_limit_blocked_total{${SERVICE_FILTER}}[$__rate_interval]))`,
    '{{route}} ({{key_type}})',
  )],
  { unit: 'ops' },
)

// Row 6: Business — money flow
elements['panel-30'] = statPanel(
  30,
  'Revenue (range)',
  'Stripe revenue over dashboard time range, in major currency unit (cents → dollars). Cross-currency sums are meaningless — always grouped by currency. Empty in dev / fresh deploys.',
  [query(
    `sum by (currency) (increase(airi_stripe_revenue_minor_unit_total{${SERVICE_FILTER}, currency!=""}[$__range])) / 100`,
    '{{currency}}',
  )],
  { unit: 'short', decimals: 2, noValue: '—' },
)

elements['panel-31'] = gaugePanel(
  31,
  'Checkout Conversion %',
  'Completed checkouts ÷ created checkouts over dashboard time range. Drops can flag price-page bugs or payment-method outages.',
  [query(
    `100 * sum(increase(stripe_checkout_completed_total{${SERVICE_FILTER}}[$__range])) / clamp_min(sum(increase(stripe_checkout_created_total{${SERVICE_FILTER}}[$__range])), 1)`,
    'completed %',
  )],
  { steps: [{ color: 'red', value: 0 }, { color: 'yellow', value: 30 }, { color: 'green', value: 60 }], decimals: 1, noValue: '—' },
)

elements['panel-32'] = piePanel(
  32,
  'Stripe Events (range)',
  'Webhook events grouped by event.type. Pattern shifts (e.g. surge in invoice.payment_failed) indicate billing health.',
  [query(
    `sum by (event_type) (increase(stripe_events_total{${SERVICE_FILTER}, event_type!=""}[$__range]))`,
    '{{event_type}}',
  )],
  { noValue: '—' },
)

// Row 7: Infrastructure — process / DB health (collapsed by default)
elements['panel-50'] = statPanel(
  50,
  'DB Query P95 (5m)',
  'PostgreSQL query duration P95 from PgInstrumentation. Spikes correlate with index misses, connection exhaustion, or backend lock contention.',
  [query(
    `histogram_quantile(0.95, sum by (le) (rate(db_client_operation_duration_seconds_bucket{${SERVICE_FILTER}}[5m])))`,
    'p95',
  )],
  { unit: 's', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 0.05 }, { color: 'red', value: 0.5 }], decimals: 3 },
)

elements['panel-51'] = timeseriesPanel(
  51,
  'DB Pool Connections by Instance',
  'Open PostgreSQL connections, broken down per replica (`service_instance_id`). Each instance has its own pool sized by env `DB_POOL_MAX`. One instance with a permanently-high count = pool leak on that pod.',
  [query(
    `sum by (service_instance_id) (db_client_connection_count{${SERVICE_FILTER}})`,
    '{{service_instance_id}}',
  )],
  { unit: 'short' },
)

elements['panel-52'] = timeseriesPanel(
  52,
  'Heap Used % by Instance',
  'V8 heap used ÷ heap limit, per replica (`service_instance_id`). A single replica trending up while others stay flat = leak on that pod. Cluster-wide average masks that — show by instance.',
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

// Row 8: Logs
elements['panel-90'] = logsPanel(
  90,
  'Application Logs',
  'Live application logs from Loki. Filter via the panel UI; click trace_id field to jump to Tempo.',
  `{${SERVICE_FILTER}} |= \`\``,
)

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const rows = [
  // Row 1: 6 stats/gauges × 4 wide × 4 high (full width)
  row('Service Health', [
    item('panel-1', 0, 0, 4, 4),
    item('panel-2', 4, 0, 4, 4),
    item('panel-3', 8, 0, 4, 4),
    item('panel-4', 12, 0, 4, 4),
    item('panel-5', 16, 0, 4, 4),
    item('panel-6', 20, 0, 4, 4),
  ]),
  // Row 2: 3 donuts × 8 wide × 7 high — current-state distribution
  row('Distribution (now)', [
    item('panel-7', 0, 0, 8, 7),
    item('panel-8', 8, 0, 8, 7),
    item('panel-9', 16, 0, 8, 7),
  ]),
  // Row 3: 3 timeseries × 8 wide × 8 high — same data as Row 2 but over time
  row('Traffic Trends', [
    item('panel-10', 0, 0, 8, 8),
    item('panel-11', 8, 0, 8, 8),
    item('panel-12', 16, 0, 8, 8),
  ]),
  // Row 4: 2 timeseries × 12 wide × 8 high
  row('Latency', [
    item('panel-20', 0, 0, 12, 8),
    item('panel-21', 12, 0, 12, 8),
  ]),
  // Row 5: 1 stacked area + 2 stats + 1 timeseries × 7 high
  // Stream Interruptions and ⚠ Flux Unbilled sit next to the 4xx/5xx trend
  // so revenue-leak signal (which doesn't show up in 5xx) gets the same
  // glance-weight as transport-layer errors.
  row('Errors / Quality', [
    item('panel-40', 0, 0, 10, 7),
    item('panel-41', 10, 0, 4, 7),
    item('panel-43', 14, 0, 4, 7),
    item('panel-42', 18, 0, 6, 7),
  ]),
  // Row 6: 1 stat + 1 gauge + 1 donut × 8 wide × 7 high
  row('Business', [
    item('panel-30', 0, 0, 8, 7),
    item('panel-31', 8, 0, 8, 7),
    item('panel-32', 16, 0, 8, 7),
  ]),
  // Row 7: 1 stat + 3 by-instance timeseries × 6 wide × 6 high (collapsed by
  // default — only relevant when triaging. By-instance breakdowns catch
  // single-replica issues that cluster aggregates would average away.)
  row('Infrastructure', [
    item('panel-50', 0, 0, 6, 6),
    item('panel-51', 6, 0, 6, 6),
    item('panel-52', 12, 0, 6, 6),
    item('panel-53', 18, 0, 6, 6),
  ], { collapse: true }),
  // Row 8: full-width logs
  row('Logs', [
    item('panel-90', 0, 0, 24, 12),
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
 *   2. Distribution — three donuts, "what KIND of traffic now?"
 *   3. Traffic Trends — same data over time
 *   4. Latency — P95 over routes/models
 *   5. Errors / Quality — what's failing
 *   6. Business — Stripe / Flux money flow
 *   7. Infrastructure (collapsed) — DB / runtime health for triage
 *   8. Logs — Loki for live debugging
 *
 * Counter conventions:
 *   - rate() for "what's happening now"
 *   - increase($__range) for "X over visible window"
 *   - never raw sum() on a cumulative counter — counter resets on deploy
 *     would distort the result.
 *
 * Variables source from `target_info` (always present, no business-metric
 * dependency) so dashboard never goes blank when an app metric is renamed.
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
