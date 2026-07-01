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
import { argv, exit } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PROM = { name: 'grafanacloud-projairi-prom' }
const LOKI = { name: 'grafanacloud-projairi-logs' }
const SCHEMA_VERSION = '13.0.0-23630096546'

// Service / env filter applied to every Prom query. Pulled into a helper so
// the variable name only appears once.
const SERVICE_FILTER = 'service_name=~"$service", deployment_environment=~"$env"'
const PRODUCT_EVENT_FILTER = `${SERVICE_FILTER}, feature!="", action!=""`

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
  /**
   * Stat visual language:
   *   - 'health' (default) — traffic-light colour driven by `steps`, no trend
   *     delta. For numbers that are good or bad (req/s, 5xx, unbilled flux).
   *   - 'count' — neutral fixed colour + period-over-period % delta. For pure
   *     informational counts/totals with no good/bad threshold (active users,
   *     DAU/WAU, revenue, tokens consumed).
   */
  variant?: 'health' | 'count'
  /** Fixed colour for the 'count' variant. Ignored by 'health'. @default 'blue' */
  color?: string
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
  const { unit = 'short', steps = [{ color: 'green', value: 0 }], decimals, noValue, graphMode = 'area', variant = 'health', color = 'blue' } = opts
  const isCount = variant === 'count'

  // 'count' stats drop the traffic-light colouring (the value is neither good
  // nor bad) and instead surface a period-over-period % delta so the trend is
  // readable at a glance. 'health' keeps threshold colouring and no delta.
  const defaults = isCount
    ? {
        color: { mode: 'fixed', fixedColor: color },
        fieldMinMax: false,
        thresholds: thresholds([{ color, value: 0 }]),
        unit,
        ...(decimals != null && { decimals }),
        ...(noValue != null && { noValue }),
      }
    : defaultsBlock({ unit, steps, decimals, noValue })

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
          fieldConfig: { defaults, overrides: [] },
          options: {
            colorMode: isCount ? 'none' : 'value',
            graphMode,
            justifyMode: 'auto',
            orientation: 'auto',
            percentChangeColorMode: 'standard',
            reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
            showPercentChange: isCount,
            textMode: isCount ? 'value_and_name' : 'auto',
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

interface HeatmapPanelOpts {
  unit?: string
}

// Status-code-over-time heatmap: each `sum by (label)` series becomes a Y-axis
// row, colour encodes the rate at each time bucket. `calculate: false` means
// the series are treated as pre-bucketed rows (one row per status code) rather
// than re-binned by value. Reads the traffic mix at a glance — a sudden 5xx
// row lighting up is obvious in a way a stacked line chart hides.
function heatmapPanel(id: number, title: string, description: string, queries: PanelQuery[], opts: HeatmapPanelOpts = {}) {
  const { unit = 'short' } = opts
  return {
    kind: 'Panel',
    spec: {
      data: { kind: 'QueryGroup', spec: { queries, queryOptions: {}, transformations: [] } },
      description,
      id,
      links: [],
      title,
      vizConfig: {
        group: 'heatmap',
        kind: 'VizConfig',
        spec: {
          fieldConfig: {
            defaults: {
              custom: { hideFrom: { legend: false, tooltip: false, viz: false }, scaleDistribution: { type: 'linear' } },
              unit,
            },
            overrides: [],
          },
          options: {
            annotations: { clustering: -1, multiLane: false },
            calculate: false,
            cellGap: 1,
            color: { exponent: 0.5, fill: 'dark-orange', mode: 'scheme', reverse: false, scale: 'exponential', scheme: 'RdYlBu', steps: 64 },
            exemplars: { color: 'rgba(255,0,255,0.7)' },
            filterValues: { le: 1e-9 },
            legend: { show: false },
            rowsFrame: { layout: 'auto' },
            tooltip: { mode: 'single', showColorScale: false, yHistogram: false },
            yAxis: { axisPlacement: 'left', reverse: false },
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
  'Total Users',
  'Current Better Auth user table size from `user.total` (cluster-wide DB gauge, aggregate with `max()`) plus rolling 24h signup delta from `increase(user.registered)`. Use the delta as today/new-user growth, and DAU / WAU / MAU below for returning-user engagement.',
  [
    query(`max(user_total{${SERVICE_FILTER}})`, 'total users', 'A'),
    query(`sum(increase(user_registered_total{${SERVICE_FILTER}}[24h]))`, 'new today', 'B'),
  ],
  { unit: 'short', variant: 'count' },
)

elements['panel-15'] = statPanel(
  15,
  'Active Sessions',
  'COUNT(*) over the Better Auth `session` table where `expires_at > now()`, aggregated with `avg()` (cluster-wide gauge). Counts session **rows**, not users — compare against DAU to spot session-row inflation.',
  [query(`avg(user_active_sessions{${SERVICE_FILTER}})`, 'sessions')],
  { unit: 'short', variant: 'count' },
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

// --- Users & Engagement: DAU/WAU/MAU + sessions + live WebSocket presence ---
// DAU/WAU/MAU come from the `user.active_rolling` gauge (COUNT(*) over `user`
// filtered by last_seen_at; one series per window). Cluster-wide gauge — every
// replica reports the same value, so aggregate with max(), NOT sum().
const ROLLING_USERS = [
  { id: 80, window: '24h', title: 'DAU', label: 'Daily', span: 'last 24h' },
  { id: 81, window: '7d', title: 'WAU', label: 'Weekly', span: 'last 7d' },
  { id: 82, window: '30d', title: 'MAU', label: 'Monthly', span: 'last 30d' },
] as const
for (const { id, window, title, label, span } of ROLLING_USERS) {
  elements[`panel-${id}`] = statPanel(
    id,
    title,
    `${label} active users — distinct users with activity in the ${span}. Sourced from \`user.last_seen_at\` (touched on sign-in and every OIDC token refresh) via the \`user.active_rolling\` gauge. Cluster-wide gauge aggregated with \`max()\`.`,
    [query(`max(user_active_rolling{${SERVICE_FILTER}, window="${window}"})`, title)],
    { unit: 'short', variant: 'count', noValue: '0' },
  )
}

elements['panel-93'] = statPanel(
  93,
  'WS Online',
  'Current concurrent WebSocket connections across all replicas (`sum` — each replica holds its own connections). The live-presence counterpart to the rolling DAU/WAU windows.',
  [query(`sum(ws_connections_active{${SERVICE_FILTER}})`, 'online')],
  { unit: 'short', variant: 'count', color: 'purple', noValue: '0' },
)

elements['panel-92'] = timeseriesPanel(
  92,
  'WS Connections',
  'Concurrent WebSocket connections over time (`sum` across replicas). A cliff to zero with no matching deploy = mass disconnect (LB drop, network blackhole); a slow ramp without disconnects = connection leak.',
  [query(`sum(ws_connections_active{${SERVICE_FILTER}})`, 'connections')],
  { unit: 'short', fillOpacity: 30 },
)

// --- Product Analytics — event volume + server-side TTS health -------------
// Prometheus deliberately does not carry user_id. These panels answer
// "which product actions are happening and failing"; DB-side product_events
// queries answer "how many distinct users used each feature".
elements['panel-95'] = statPanel(
  95,
  'Product Events (range)',
  'Total first-party product analytics events over the dashboard range. This is event volume, not distinct users — distinct-user counts come from the Postgres `product_events` table.',
  [
    query(`sum(increase(airi_product_events_total{${PRODUCT_EVENT_FILTER}}[$__range]))`, 'events'),
  ],
  { unit: 'short', variant: 'count', noValue: '0', graphMode: 'none' },
)

elements['panel-96'] = gaugePanel(
  96,
  'Product Failure %',
  'Failed product events ÷ all product events over the dashboard range. Uses only bounded labels (`feature`, `action`, `status`, `source`); no user/session/request identifiers are present in Prometheus.',
  [query(
    `100 * sum(increase(airi_product_events_total{${PRODUCT_EVENT_FILTER}, status="failed"}[$__range])) / clamp_min(sum(increase(airi_product_events_total{${PRODUCT_EVENT_FILTER}}[$__range])), 1)`,
    'failed %',
  )],
  { steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 2 }, { color: 'red', value: 10 }], max: 20, decimals: 2, noValue: '0' },
)

elements['panel-97'] = barGaugePanel(
  97,
  'Top Product Actions (range)',
  'Top product actions by event count over the dashboard range. Use this to see which features are actually being exercised after deployment; pair with DB `count(distinct user_id)` for user counts.',
  [query(
    `topk(12, sum by (feature, action, status) (increase(airi_product_events_total{${PRODUCT_EVENT_FILTER}}[$__range])))`,
    '{{feature}} · {{action}} · {{status}}',
    'A',
    PROM,
    { instant: true },
  )],
  { unit: 'short', noValue: '0' },
)

elements['panel-98'] = timeseriesPanel(
  98,
  'Product Event Rate',
  'Product event rate by feature/action/status. This is the Prometheus-safe trend view; user-level analysis remains in Postgres `product_events`.',
  [query(
    `sum by (feature, action, status) (rate(airi_product_events_total{${PRODUCT_EVENT_FILTER}}[$__rate_interval]))`,
    '{{feature}} · {{action}} · {{status}}',
  )],
  { unit: 'eps', fillOpacity: 15 },
)

elements['panel-99'] = gaugePanel(
  99,
  'TTS Success %',
  'Server-side TTS successes divided by TTS requests over the dashboard range. Includes REST and WS TTS product events. Drops here mean users are asking for speech but not receiving audio; inspect failed/blocked panels next.',
  [query(
    `100 * sum(increase(airi_product_events_total{${PRODUCT_EVENT_FILTER}, feature="tts", action="speech_succeeded", status="succeeded"}[$__range])) / clamp_min(sum(increase(airi_product_events_total{${PRODUCT_EVENT_FILTER}, feature="tts", action="speech_requested", status="started"}[$__range])), 1)`,
    'success %',
  )],
  { steps: [{ color: 'red', value: 0 }, { color: 'yellow', value: 90 }, { color: 'green', value: 98 }], max: 100, decimals: 2, noValue: '0' },
)

elements['panel-100'] = barGaugePanel(
  100,
  'TTS Failed / Blocked (range)',
  'TTS user-impacting failures over the dashboard range, split by action/status/source. `speech_failed` usually means upstream/runtime failure; `speech_blocked` usually means balance/preflight blocked. Keep voice/model drilldown in Postgres metadata, not Prometheus labels.',
  [query(
    `topk(12, sum by (action, status, source) (increase(airi_product_events_total{${PRODUCT_EVENT_FILTER}, feature="tts", action=~"speech_failed|speech_blocked"}[$__range])))`,
    '{{action}} · {{status}} · {{source}}',
    'A',
    PROM,
    { instant: true },
  )],
  { unit: 'short', noValue: '0' },
)

elements['panel-101'] = timeseriesPanel(
  101,
  'TTS Event Rate by Source',
  'TTS product event rate by source and action. Use this to distinguish chat auto-TTS, manual previews/settings tests, and API audio.speech traffic when speech health changes.',
  [query(
    `sum by (source, action, status) (rate(airi_product_events_total{${PRODUCT_EVENT_FILTER}, feature="tts"}[$__rate_interval]))`,
    '{{source}} · {{action}} · {{status}}',
  )],
  { unit: 'eps', fillOpacity: 15 },
)

elements['panel-102'] = barGaugePanel(
  102,
  'TTS Blocked by Reason',
  'Blocked TTS events over the dashboard range, grouped by bounded product reason and source. Today this mostly shows insufficient balance; new policy/provider/preflight buckets can be added without exposing user, voice, or model labels.',
  [query(
    `topk(12, sum by (reason, source) (increase(airi_product_events_total{${PRODUCT_EVENT_FILTER}, feature="tts", action="speech_blocked", status="blocked"}[$__range])))`,
    '{{reason}} · {{source}}',
    'A',
    PROM,
    { instant: true },
  )],
  { unit: 'short', noValue: '0' },
)

elements['panel-103'] = barGaugePanel(
  103,
  'TTS Blocked by Flux Bucket',
  'Blocked TTS events over the dashboard range, grouped by coarse Flux balance bucket. This helps separate truly empty accounts from low-balance accounts without exposing exact user balances.',
  [query(
    `topk(8, sum by (flux_balance_bucket, source) (increase(airi_product_events_total{${PRODUCT_EVENT_FILTER}, feature="tts", action="speech_blocked", status="blocked", flux_balance_bucket!=""}[$__range])))`,
    '{{flux_balance_bucket}} · {{source}}',
    'A',
    PROM,
    { instant: true },
  )],
  { unit: 'short', noValue: '0' },
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

elements['panel-40'] = heatmapPanel(
  40,
  'Error Rate %',
  'HTTP status-code mix over time, one row per status code, colour = request rate in each time bucket. The 200 row dominates in steady state; a 5xx / 4xx row suddenly lighting up flags an incident at a glance. Non-OPTIONS traffic only.',
  [query(
    `sum by (http_response_status_code) (rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[$__rate_interval]))`,
    '{{http_response_status_code}}',
  )],
  { unit: 'short' },
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

elements['panel-94'] = timeseriesPanel(
  94,
  'Errors by Route',
  'Error responses per route, broken out by status code. Excludes success (2xx/3xx) and the expected-client-error codes 401/402/404 (auth-required / payment-required / not-found noise) so the curve isolates real failures: 4xx like 400/403/422/429 and all 5xx. The per-route companion to the aggregate Error Rate % stat.',
  [query(
    `sum by (http_route, http_response_status_code) (increase(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_response_status_code!~"2..|3..|401|402|404"}[$__rate_interval]))`,
    '{{http_response_status_code}} {{http_route}}',
  )],
  { unit: 'short' },
)

// --- Row 3: LLM Gateway — request mix + latency ----------------------------
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

// --- Row: Provider Upstreams — our gateway's view of each upstream so the
// per-provider consoles (OpenRouter / Volcengine 豆包 / DashScope 阿里) don't
// have to be checked one by one. `provider` is the upstream the router
// actually used (winning upstream on success, last-tried on exhaustion);
// it's the URL hostname, so legends read e.g. `openrouter.ai`,
// `dashscope.aliyuncs.com`. Note: provider-only truths (real $ spend, account
// quota / balance) are NOT here — those need the provider billing APIs.
elements['panel-66'] = timeseriesPanel(
  66,
  'Requests/s by Provider',
  'Outbound request rate to each upstream provider (chat + tts), as our gateway sees it. The RPM / 调用次数 screens on the provider consoles, unified. provider = upstream hostname the router used.',
  [query(
    `sum by (provider) (rate(gen_ai_client_operation_count_total{${SERVICE_FILTER}, provider!=""}[$__rate_interval]))`,
    '{{provider}}',
  )],
  { unit: 'reqps' },
)

elements['panel-67'] = timeseriesPanel(
  67,
  'Provider Latency P95',
  'P95 upstream call duration per provider (chat + tts), across models. Mirrors each provider console\'s 调用时长 p95/p99 panel — but here every provider is on one axis.',
  [query(
    `histogram_quantile(0.95, sum by (le, provider) (rate(gen_ai_client_operation_duration_seconds_bucket{${SERVICE_FILTER}, provider!=""}[$__rate_interval])))`,
    '{{provider}}',
  )],
  { unit: 's' },
)

elements['panel-68'] = timeseriesPanel(
  68,
  'Provider Failure %',
  '4xx + 5xx ÷ all requests per provider, our side of the call. Matches each provider 失败率 panel. Pair with Upstream Errors by Status Code (LLM Router Health) to see which codes drive it.',
  [query(
    `100 * sum by (provider) (rate(gen_ai_client_operation_count_total{${SERVICE_FILTER}, provider!="", http_response_status_code=~"4..|5.."}[$__rate_interval])) / clamp_min(sum by (provider) (rate(gen_ai_client_operation_count_total{${SERVICE_FILTER}, provider!=""}[$__rate_interval])), 1)`,
    '{{provider}}',
  )],
  { unit: 'percent' },
)

elements['panel-69'] = timeseriesPanel(
  69,
  'TTS Characters/s by Model',
  'Billed TTS characters per second by model (from `airi.billing.tts.chars`). The 用量统计「字数」screen on the TTS consoles (豆包 / 阿里), unified. Integrate over the range for a window total.',
  [query(
    `sum by (model) (rate(airi_billing_tts_chars_total{${SERVICE_FILTER}}[$__rate_interval]))`,
    '{{model}}',
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
  { unit: 'short', variant: 'count', noValue: '0', graphMode: 'none' },
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
  { unit: 'short', variant: 'count', color: 'green', decimals: 2, noValue: '—' },
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
  { unit: 'short', variant: 'count', noValue: '—', graphMode: 'none' },
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
  // Row 1: Service Health — two rows of glance stats + the status-code heatmap
  // standing tall on the right, with the live WS-connections trend full-width
  // underneath. counts (New Users / Active Sessions / WS Online) read blue with
  // a trend delta; req-rate + 5xx stay traffic-light.
  row('Service Health', [
    item('panel-1', 0, 0, 6, 4),
    item('panel-3', 6, 0, 6, 4),
    item('panel-4', 12, 0, 6, 4),
    item('panel-40', 18, 0, 6, 8),
    item('panel-15', 0, 4, 6, 4),
    item('panel-5', 6, 4, 6, 4),
    item('panel-93', 12, 4, 6, 4),
    item('panel-92', 0, 8, 24, 5),
  ]),
  // Row 2: User Engagement — rolling-window active users (DAU/WAU/MAU) from
  // user.last_seen_at. Kept its own row so it can grow (retention, cohorts)
  // without crowding the health glance above.
  row('User Engagement', [
    item('panel-80', 0, 0, 8, 4),
    item('panel-81', 8, 0, 8, 4),
    item('panel-82', 16, 0, 8, 4),
  ]),
  // Row 3: Product Analytics — Prom-safe event volume and server TTS health.
  // Distinct-user analytics stay in Postgres `product_events`; this row
  // intentionally never uses user_id/session/request labels.
  row('Product Analytics', [
    item('panel-95', 0, 0, 6, 5),
    item('panel-96', 6, 0, 6, 5),
    item('panel-99', 12, 0, 6, 5),
    item('panel-100', 18, 0, 6, 5),
    item('panel-97', 0, 5, 12, 8),
    item('panel-98', 12, 5, 12, 4),
    item('panel-101', 12, 9, 12, 4),
    item('panel-102', 0, 13, 12, 5),
    item('panel-103', 12, 13, 12, 5),
  ]),
  // Row 3: HTTP — full-width error breakdown on top, then traffic ranking +
  // latency trend side by side.
  row('HTTP', [
    item('panel-94', 0, 0, 24, 8),
    item('panel-16', 0, 8, 7, 11),
    item('panel-20', 7, 8, 17, 11),
  ]),
  // Row 4: LLM gateway — request mix + latency side by side.
  row('LLM Gateway', [
    item('panel-11', 0, 0, 12, 8),
    item('panel-21', 12, 0, 12, 8),
  ]),
  // Row 5: Provider Upstreams — per-provider rollup so the vendor consoles
  // don't have to be opened one by one. Four wide, one screen line.
  row('Provider Upstreams', [
    item('panel-66', 0, 0, 6, 7),
    item('panel-67', 6, 0, 6, 7),
    item('panel-68', 12, 0, 6, 7),
    item('panel-69', 18, 0, 6, 7),
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
 *   1. Service Health — signup/sessions/WS counts, req-rate, 5xx, status-code
 *      heatmap, live WS trend: "is anything broken right now?"
 *   2. User Engagement — rolling DAU/WAU/MAU from user.last_seen_at
 *   3. Product Analytics — Prom-safe product event volume + server TTS health
 *   4. HTTP — error breakdown by route, request ranking, latency by route
 *   5. LLM Gateway — per-model request rate + latency (TTFB + end-to-end)
 *   6. Provider Upstreams — per-provider rate/latency/failure + TTS chars
 *   7. LLM Tokens & Quality — token totals/throughput, revenue-leak alerts
 *   8. LLM Router Health — key/decrypt/fallback "wake someone up" signals
 *   9. Business — Stripe / Flux money flow
 *  10. Infrastructure (collapsed) — DB / runtime health for triage
 *  11. Logs — Loki for live debugging
 *
 * One metric, one panel: we deliberately do not duplicate a metric across
 * stat/trend/bar/pie forms. Counter conventions: rate() for "now" trends,
 * increase($__range) for "total over window", never raw sum() on a counter.
 *
 * Variables source from `target_info` (always present, no business-metric
 * dependency) so the dashboard never goes blank when an app metric is renamed.
 */
export const dashboard = {
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
    autoRefresh: '30s',
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

export interface DashboardLayoutCheckResult {
  orphanRefs: string[]
  unusedElems: string[]
}

/**
 * Validates that every dashboard layout reference points to a defined element.
 *
 * Use when:
 * - Regenerating the Grafana JSON from this dashboard builder.
 * - Testing that row changes did not orphan panels or leave panels unused.
 *
 * Expects:
 * - A Grafana dashboard object shaped like {@link dashboard}.
 *
 * Returns:
 * - Orphan layout references and unused element names.
 */
export function checkDashboardLayoutReferences(targetDashboard: typeof dashboard): DashboardLayoutCheckResult {
  const elementNames = new Set(Object.keys(targetDashboard.elements))
  const refs = new Set<string>()
  collectElementReferences(targetDashboard.layout, refs)
  return {
    orphanRefs: [...refs].filter(r => !elementNames.has(r)),
    unusedElems: [...elementNames].filter(e => !refs.has(e)),
  }
}

/**
 * Recursively collects Grafana row element references from the layout tree.
 */
function collectElementReferences(node: unknown, refs: Set<string>): void {
  if (!node || typeof node !== 'object')
    return
  const layoutNode = node as { kind?: unknown, name?: unknown }
  if (layoutNode.kind === 'ElementReference' && typeof layoutNode.name === 'string')
    refs.add(layoutNode.name)
  for (const value of Object.values(node)) collectElementReferences(value, refs)
}

/**
 * Writes the generated dashboard JSON and fails the CLI on layout drift.
 */
function writeDashboard(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const outPath = join(here, 'airi-server-overview-cloud.json')
  writeFileSync(outPath, `${JSON.stringify(dashboard, null, 2)}\n`)
  console.info(`wrote ${outPath}`)

  const { orphanRefs, unusedElems } = checkDashboardLayoutReferences(dashboard)
  const definedCount = Object.keys(dashboard.elements).length
  const referencedCount = definedCount - unusedElems.length + orphanRefs.length
  console.info(`panels defined: ${definedCount}, referenced: ${referencedCount}, orphans: ${orphanRefs.length}, unused: ${unusedElems.length}`)
  if (orphanRefs.length || unusedElems.length) {
    console.error('orphans:', orphanRefs)
    console.error('unused:', unusedElems)
    exit(1)
  }
}

if (import.meta.url === pathToFileURL(argv[1] ?? '').href)
  writeDashboard()
