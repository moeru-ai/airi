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

interface TablePanelOpts {
  unit?: string
  decimals?: number
  noValue?: string
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

function tablePanel(id: number, title: string, description: string, queries: PanelQuery[], opts: TablePanelOpts = {}) {
  const { unit = 'short', decimals, noValue = '0' } = opts
  return {
    kind: 'Panel',
    spec: {
      data: { kind: 'QueryGroup', spec: { queries, queryOptions: {}, transformations: [] } },
      description,
      id,
      links: [],
      title,
      vizConfig: {
        group: 'table',
        kind: 'VizConfig',
        spec: {
          fieldConfig: {
            defaults: {
              color: { mode: 'thresholds' },
              custom: {
                align: 'auto',
                cellOptions: { type: 'auto' },
                inspect: false,
              },
              thresholds: thresholds([{ color: 'green', value: 0 }]),
              unit,
              ...(decimals != null && { decimals }),
              ...(noValue != null && { noValue }),
            },
            overrides: [],
          },
          options: {
            cellHeight: 'sm',
            footer: { countRows: false, fields: '', reducer: ['sum'], show: false },
            showHeader: true,
            sortBy: [{ desc: true, displayName: 'Value' }],
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

// Row 1: Service Health — answers "is anything broken **right now**?"
//
// Time-window policy for this row: all rate / ratio queries use a fixed
// `[5m]` window and DO NOT follow the dashboard time picker. Reason:
// these panels are designed for on-call glance ("is the service healthy
// at this instant"), and we want the number to be stable across whatever
// time range the viewer happened to pick. If we used `$__rate_interval`,
// the same panel would show different numbers depending on whether the
// time picker is set to "last 1 hour" vs "last 7 days", which is
// confusing for an at-a-glance health board.
//
// To see trends over the time-picker range, use the Row 3 timeseries
// (HTTP / LLM / WS by-* panels) which DO follow the time picker.
// Panels titled "(range)" (Distribution donuts, Business stats) also
// follow the time picker by design.
//
// Mix of stats (absolute counts) and gauges (bounded ratios with thresholds).
elements['panel-1'] = statPanel(
  1,
  'New Users 24h',
  'Rolling 24h `increase(user.registered)` — counts the Better Auth `databaseHooks.user.create.after` fires over the last 24 hours. This is the operational signup signal; for DAU / WAU / MAU / cohort retention, query PostHog (`event = session_started`, emitted from `databaseHooks.session.create.after`).',
  [query(`sum(increase(user_registered_total{${SERVICE_FILTER}}[24h]))`, 'new users')],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1000 }] },
)

elements['panel-15'] = statPanel(
  15,
  'Active Sessions',
  'COUNT(*) over the Better Auth `session` table where `expires_at > now()`. Counts session **rows**, not users — see `panel-1` for the de-duplicated user count. Useful as a denominator to spot row inflation: divide by panel-1 to get rows-per-user, watch for sustained growth.',
  [query(`avg(user_active_sessions{${SERVICE_FILTER}})`, 'sessions')],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 5000 }] },
)

// WS Connections stat was removed — its sparkline duplicated the
// timeseries in Row 3 (`panel-13`), which already shows the live
// connection count over time with the same `sum(ws_connections_active)`
// query. Keeping both meant the same number rendered twice on first
// look. The Row 3 timeseries wins because it lets you actually read off
// a value at a specific timestamp instead of squinting at the sparkline.

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
  '5xx responses ÷ all responses over the last 5m. **Fixed 5m window — intentionally does not follow the dashboard time picker**: this is an on-call glance ("is the service failing right now"). For range-aware triage use panel-9 donut and panel-44 timeseries. Spikes correlate with deploys, upstream outages, or DB problems. >1% warns, >5% pages.',
  [query(
    `100 * sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_response_status_code=~"5.."}[5m])) / clamp_min(sum(rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS"}[5m])), 1)`,
    'fail %',
  )],
  { steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1 }, { color: 'red', value: 5 }], max: 10, decimals: 2 },
)

elements['panel-5'] = statPanel(
  5,
  'LLM Req/s (5m)',
  '5-minute average LLM gateway request rate (chat + tts). **Fixed 5m window — see row-level note.** For trends and per-model breakdown see panel-11.',
  [query(`sum(rate(gen_ai_client_operation_count_total{${SERVICE_FILTER}}[5m]))`, 'req/s')],
  { unit: 'reqps', decimals: 2 },
)

elements['panel-6'] = gaugePanel(
  6,
  'Email Failure %',
  'Email failures ÷ total attempts over the last 5m. **Fixed 5m window — see row-level note.** >5% means Resend / DNS / suppression-list problems blocking auth flows.',
  [query(
    `100 * sum(rate(airi_email_failures_total{${SERVICE_FILTER}}[5m])) / clamp_min(sum(rate(airi_email_send_total{${SERVICE_FILTER}}[5m])) + sum(rate(airi_email_failures_total{${SERVICE_FILTER}}[5m])), 1)`,
    'fail %',
  )],
  { steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 1 }, { color: 'red', value: 5 }], max: 20, decimals: 1, noValue: '0' },
)

// Row 2: Distribution — range-aware breakdowns over the selected time window.
// Donuts answer the "what share of traffic" question better than stacked area.
// Use `topk(N, ...)` so a long-tail label set doesn't render an unreadable
// 30-slice pie.
elements['panel-8'] = piePanel(
  8,
  'LLM Models (range)',
  'Share of LLM gateway calls by model, summed over the dashboard time range. Follows the time picker — pick 1h to see the last hour\'s model mix, pick 7d to see this week\'s.',
  [query(
    `topk(8, sum by (gen_ai_request_model) (increase(gen_ai_client_operation_count_total{${SERVICE_FILTER}, gen_ai_request_model!=""}[$__range])))`,
    '{{gen_ai_request_model}}',
  )],
)

// Row 3: Traffic Trends — transport / model / websocket changes over time.
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

elements['panel-13'] = timeseriesPanel(
  13,
  'WS Connections',
  'Live WebSocket connection count over time. Use this to correlate connection-count changes with deploys, network blips, or message throughput spikes.',
  [query(`sum(ws_connections_active{${SERVICE_FILTER}})`, 'connections')],
  { unit: 'short' },
)

// Row 3.5: Top Endpoints — route-level traffic over time.
elements['panel-14'] = timeseriesPanel(
  14,
  'HTTP Request Rate by Route (top 10)',
  'Per-route request rate, top 10 by current rate. Pair with Row 4 P95 to spot hot endpoints that are also slow. Cardinality is the Hono-matched route pattern (e.g. `/api/v1/openai/v1/chat/completions`), not the concrete URL.',
  [query(
    `topk(10, sum by (http_route) (rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!=""}[$__rate_interval])))`,
    '{{http_route}}',
  )],
  { unit: 'reqps' },
)

// Row 3.6: Route Triage — tables answer "which routes should I inspect first?"
elements['panel-16'] = tablePanel(
  16,
  'Top Routes by Requests (range)',
  'Top Hono-matched routes by request count over the selected dashboard range. This is the main traffic list: start here to see which API surfaces are hottest before checking latency or errors.',
  [query(
    `topk(20, sum by (http_route) (increase(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!=""}[$__range])))`,
    '{{http_route}}',
    'A',
    PROM,
    { instant: true },
  )],
  { unit: 'short' },
)

elements['panel-17'] = tablePanel(
  17,
  'Top Routes by Errors (range)',
  'Top route + status-code pairs by 4xx/5xx count over the selected dashboard range. This answers both "which route errors most" and "what error class/status is it".',
  [query(
    `topk(20, sum by (http_route, http_response_status_code) (increase(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!="", http_response_status_code=~"4..|5.."}[$__range])))`,
    '{{http_route}} {{http_response_status_code}}',
    'A',
    PROM,
    { instant: true },
  )],
  { unit: 'short' },
)

elements['panel-18'] = tablePanel(
  18,
  'Top Routes by Error Rate (range)',
  'Top Hono-matched routes by 4xx/5xx percentage over the selected dashboard range. Use this next to the error-count table so low-traffic routes with severe failure ratios do not get hidden behind high-volume endpoints.',
  [query(
    `topk(20, 100 * sum by (http_route) (increase(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!="", http_response_status_code=~"4..|5.."}[$__range])) / clamp_min(sum by (http_route) (increase(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!=""}[$__range])), 1))`,
    '{{http_route}}',
    'A',
    PROM,
    { instant: true },
  )],
  { unit: 'percent', decimals: 2 },
)

elements['panel-19'] = tablePanel(
  19,
  'HTTP P95 by Route (now)',
  'Top Hono-matched routes by current P95 latency. This complements the request and error tables: a hot route with high latency is usually a better optimization target than a cold slow route.',
  [query(
    `topk(20, histogram_quantile(0.95, sum by (le, http_route) (rate(http_server_request_duration_seconds_bucket{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!="", http_response_status_code!="404"}[$__rate_interval]))))`,
    '{{http_route}}',
    'A',
    PROM,
    { instant: true },
  )],
  { unit: 's', decimals: 3 },
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
  'Error Rate %',
  'Error rate as a percentage of total non-OPTIONS HTTP traffic — 4xx (client-side: validation, auth, missing routes) and 5xx (server-side) over the same denominator. Compare against the route error tables to localise spikes.',
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
  { unit: 'percent', stack: false, fillOpacity: 20 },
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
  'Flux value owed by users but never debited for unexpected reasons (excludes `partial_debit_drained`, which is a known partial-balance drain path). Real revenue leak — DB latency and HTTP 5xx alerts do NOT cover this, because the response was 2xx and the catch path is silent.',
  [query(
    `sum(increase(airi_billing_flux_unbilled_total{${SERVICE_FILTER}, reason!="partial_debit_drained"}[$__range]))`,
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

// 5xx by route over time — complements panel-9 (donut: which routes
// are failing right now) and panel-40 (4xx/5xx by status code: what
// kind of error). This is the "when did /foo start blowing up" view.
// topk(10) keeps the legend readable when one bad deploy lights up
// the whole API surface.
elements['panel-44'] = timeseriesPanel(
  44,
  '5xx Rate by Route (top 10)',
  '5xx response rate split by route. Use this to confirm whether a 5xx spike in `panel-4` is concentrated on one endpoint (e.g. a broken deploy of /api/v1/openai/*) or scattered (e.g. DB outage taking down everything). Drill into the Logs row (`panel-91`) for the matching error bodies + trace ids.',
  [query(
    `topk(10, sum by (http_route) (rate(http_server_request_duration_seconds_count{${SERVICE_FILTER}, http_request_method!="OPTIONS", http_route!="", http_response_status_code=~"5.."}[$__rate_interval])))`,
    '{{http_route}}',
  )],
  { unit: 'reqps' },
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

// Rows 6.5 / 6.6 / 6.7: LLM/TTS in-process router (KTD-5 / KTD-6).
// These counters are emitted from `apps/server/src/services/llm-router/router.ts`
// for every chat AND tts dispatch attempt. fallback_count / upstream_errors
// track per-attempt failures inside one user request; key_exhausted /
// same_status_exhaustion fire only on full chain exhaustion. config_* counters
// belong to the admin-plane subscriber and the seed/admin writers — separated
// into a collapsed row because operators only look at them during config
// rollout or post-incident.
//
// Counter → prom name mapping (OTel dot → underscore + `_total` for counters):
//   airi.gen_ai.gateway.fallback.count          → airi_gen_ai_gateway_fallback_count_total
//   airi.gen_ai.gateway.upstream.errors         → airi_gen_ai_gateway_upstream_errors_total
//   airi.gen_ai.gateway.key.exhausted           → airi_gen_ai_gateway_key_exhausted_total
//   airi.gen_ai.gateway.same_status_exhaustion  → airi_gen_ai_gateway_same_status_exhaustion_total
//   airi.gen_ai.gateway.config.reload           → airi_gen_ai_gateway_config_reload_total
//   airi.gen_ai.gateway.decrypt.failures        → airi_gen_ai_gateway_decrypt_failures_total
//   airi.gen_ai.gateway.subscriber_state        → airi_gen_ai_gateway_subscriber_state_total
//   airi.gen_ai.gateway.config.write            → airi_gen_ai_gateway_config_write_total
//   airi.gen_ai.gateway.config.invalid_hmac     → airi_gen_ai_gateway_config_invalid_hmac_total
elements['panel-60'] = statPanel(
  60,
  'Key Exhausted (5m)',
  'Number of (model, upstream) pairs that ran out of usable keys within one user request over the last 5 minutes. Any non-zero value means at least one user request walked an entire upstream\'s key list without a 2xx. Sustained > 0 = a provider account is dead or every stored ciphertext is failing to decrypt — page on-call.',
  [query(`sum(increase(airi_gen_ai_gateway_key_exhausted_total{${SERVICE_FILTER}}[5m]))`, 'events')],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'red', value: 1 }], noValue: '0' },
)

elements['panel-61'] = statPanel(
  61,
  'Decrypt Failures (5m)',
  'Envelope-crypto decrypt failures in the key rotator. A non-zero value here is security-relevant: either the master key was rotated without re-wrapping ciphertexts, or someone forged a config blob. Triages straight to the seed script + master-key audit trail.',
  [query(`sum(increase(airi_gen_ai_gateway_decrypt_failures_total{${SERVICE_FILTER}}[5m]))`, 'events')],
  { unit: 'short', steps: [{ color: 'green', value: 0 }, { color: 'red', value: 1 }], noValue: '0' },
)

elements['panel-62'] = gaugePanel(
  62,
  'Fallback Ratio % (5m)',
  'Fallback attempts ÷ total LLM operations over the last 5m. Sustained > 30% means one provider is degraded and the router is silently masking it for users (but burning quota on the failing upstream). chat + tts share the operation counter so this is a cluster-wide health gauge.',
  [query(
    `100 * sum(rate(airi_gen_ai_gateway_fallback_count_total{${SERVICE_FILTER}}[5m])) / clamp_min(sum(rate(gen_ai_client_operation_count_total{${SERVICE_FILTER}}[5m])), 1)`,
    'fallback %',
  )],
  { steps: [{ color: 'green', value: 0 }, { color: 'yellow', value: 10 }, { color: 'red', value: 30 }], max: 100, decimals: 1, noValue: '0' },
)

// panel-63 (Invalid HMAC Writes) intentionally not built: the producer
// (`config_invalid_hmac` counter) lives in the Plan U9 admin HTTP endpoint
// that hasn't shipped yet. Adding the panel now would surface a permanent
// zero that misleads readers into thinking "no attack" when it actually
// means "no producer". Re-add together with the U9 endpoint PR.

elements['panel-64'] = timeseriesPanel(
  64,
  'Fallback Count by Provider + Reason',
  'Per-provider fallback events broken down by failure reason (HTTP status or `timeout`). A wide spread of reasons under one provider = transient upstream; a single reason dominating = systematic issue (e.g. 429 quota cap, 401 expired key).',
  [query(
    `sum by (provider, reason) (rate(airi_gen_ai_gateway_fallback_count_total{${SERVICE_FILTER}}[$__rate_interval]))`,
    '{{provider}} · {{reason}}',
  )],
  { unit: 'ops' },
)

elements['panel-65'] = timeseriesPanel(
  65,
  'Upstream Errors by Status Code',
  'Per-upstream non-2xx response rate split by status code. Only counts attempts where the upstream actually answered (network timeouts and adapter aborts go to the fallback counter under `reason=timeout`). 401/403 = bad key; 429 = quota; 5xx = upstream outage.',
  [query(
    `sum by (provider, status_code) (rate(airi_gen_ai_gateway_upstream_errors_total{${SERVICE_FILTER}}[$__rate_interval]))`,
    '{{provider}} · {{status_code}}',
  )],
  { unit: 'ops' },
)

elements['panel-66'] = timeseriesPanel(
  66,
  'Same-Status Exhaustion by Provider/Status',
  'Full-chain exhaustions where every attempt returned the same status code (or all timed out). A strong signal that ordinary key fallback cannot recover — points at an account-level cap or a shared backend brownout on the provider side. Each spike is one user request.',
  [query(
    `sum by (provider, status_code) (rate(airi_gen_ai_gateway_same_status_exhaustion_total{${SERVICE_FILTER}}[$__rate_interval]))`,
    '{{provider}} · {{status_code}}',
  )],
  { unit: 'ops' },
)

elements['panel-67'] = timeseriesPanel(
  67,
  'Config Reload Events',
  'Cache invalidations of `LLM_ROUTER_CONFIG` split by source (`pubsub` = Redis fan-out from a peer\'s write; `boot` = first load on startup). Steady low rate is normal. A sudden burst aligned with a deploy = expected. An unexplained burst = someone is writing to the config without auditing.',
  [query(
    `sum by (source) (rate(airi_gen_ai_gateway_config_reload_total{${SERVICE_FILTER}}[$__rate_interval]))`,
    '{{source}}',
  )],
  { unit: 'ops' },
)

// panel-68 (Config Writes) intentionally not built: same reasoning as panel-63
// — the `config_write` counter has no producer until the Plan U9 admin
// endpoint ships. Re-add together with the U9 endpoint PR so the `by result`
// label set (success / etag_mismatch / validation_failed) is meaningful.

elements['panel-69'] = statPanel(
  69,
  'Subscriber State Events (5m)',
  'Lifecycle events for the cross-instance Redis Pub/Sub subscriber (`connected` on initial subscribe, `error` on connection error or subscribe failure, `reconnecting` while ioredis is re-establishing the connection). One `connected` per replica per deploy is normal. Sustained `error` or `reconnecting` without a matching `connected` means an instance is desynced from `configkv:invalidate` — its in-memory router config will drift up to the configCacheTtlMs fallback window.',
  [query(
    `sum by (state, service_instance_id) (increase(airi_gen_ai_gateway_subscriber_state_total{${SERVICE_FILTER}}[5m]))`,
    '{{state}} ({{service_instance_id}})',
  )],
  { unit: 'short', noValue: '0' },
)

// Row 7: Infrastructure — process / DB health (collapsed by default)
elements['panel-50'] = statPanel(
  50,
  'DB Query P95 (5m)',
  'PostgreSQL query duration P95 from PgInstrumentation. **Fixed 5m window — does not follow the dashboard time picker** (same posture as the Service Health row stats: this is a "right now" glance). Spikes correlate with index misses, connection exhaustion, or backend lock contention.',
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

// 5xx-only log stream — paired with the 5xx by-route timeseries and
// donut so on-call goes panel-4 (something is wrong) → panel-9
// (where) → panel-44 (when) → panel-91 (actual error message + trace
// id, click trace_id → Tempo for full request playback). Filters at
// the Loki query level so Grafana doesn't ship the entire log
// firehose to the browser just to client-side filter.
elements['panel-91'] = logsPanel(
  91,
  '5xx Error Logs',
  'Server-side error logs (level=warn|error) from Loki. Loki derived fields turn `trace_id` and `req` into clickable links — `trace_id` jumps to Tempo for full request playback (spans + child calls + DB queries), `req` filters this panel to a single request id. Use this together with panel-9 (which route) and panel-44 (when).',
  `{${SERVICE_FILTER}} | json | level=~"warn|error"`,
)

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const rows = [
  // Row 1: 6 stats/gauges, each 4 wide (4×6=24). Active Users (panel-1)
  // and Active Sessions (panel-15) sit side-by-side so on-call can spot
  // session-row inflation at a glance (panel-15 climbs while panel-1
  // stays flat → Better Auth row leak, not real user growth). WS
  // Connections stat is gone (duplicated by Row 3 timeseries panel-13).
  row('Service Health', [
    item('panel-1', 0, 0, 4, 4),
    item('panel-15', 4, 0, 4, 4),
    item('panel-3', 8, 0, 4, 4),
    item('panel-4', 12, 0, 4, 4),
    item('panel-5', 16, 0, 4, 4),
    item('panel-6', 20, 0, 4, 4),
  ]),
  // Row 2: range-aware distribution. Route traffic/errors live in the table
  // rows below because operators need sortable lists, not pie slices.
  row('Distribution (range)', [
    item('panel-8', 0, 0, 24, 7),
  ]),
  // Row 3: 3 timeseries × 8 wide × 8 high — model and websocket trends.
  // HTTP route traffic gets a dedicated full-width route row below.
  row('Traffic Trends', [
    item('panel-11', 0, 0, 8, 8),
    item('panel-12', 8, 0, 8, 8),
    item('panel-13', 16, 0, 8, 8),
  ]),
  // Row 3.5: 1 timeseries × 24 wide × 7 high — top routes over time.
  row('Top Endpoints', [
    item('panel-14', 0, 0, 24, 7),
  ]),
  // Row 3.6: sortable route tables. These answer the high-value operational
  // questions first: what is hot, what is failing, and whether the failure is
  // absolute volume or ratio.
  row('Route Triage', [
    item('panel-16', 0, 0, 12, 8),
    item('panel-17', 12, 0, 12, 8),
  ]),
  row('Route Risk', [
    item('panel-18', 0, 0, 12, 8),
    item('panel-19', 12, 0, 12, 8),
  ]),
  // Row 4: 2 timeseries × 12 wide × 8 high
  row('Latency', [
    item('panel-20', 0, 0, 12, 8),
    item('panel-21', 12, 0, 12, 8),
  ]),
  // Row 5: 1 stacked area + 2 stats + 1 timeseries × 7 high.
  // Stream Interruptions and ⚠ Flux Unbilled sit next to the 4xx/5xx trend
  // so revenue-leak signal (which doesn't show up in 5xx) gets the same
  // glance-weight as transport-layer errors.
  row('Errors / Quality', [
    item('panel-40', 0, 0, 10, 7),
    item('panel-41', 10, 0, 4, 7),
    item('panel-43', 14, 0, 4, 7),
    item('panel-42', 18, 0, 6, 7),
  ]),
  // Row 5.5: 5xx by-route trend full width. Triage path: panel-4
  // (something wrong) → Route Triage tables (which route/status) → here
  // (when it started) → panel-91 (actual error/warn logs + trace ids).
  row('5xx Triage', [
    item('panel-44', 0, 0, 24, 7),
  ]),
  // Row 6: 1 stat + 1 gauge + 1 donut × 8 wide × 7 high
  row('Business', [
    item('panel-30', 0, 0, 8, 7),
    item('panel-31', 8, 0, 8, 7),
    item('panel-32', 16, 0, 8, 7),
  ]),
  // Row 6.5: LLM router health — 3 stat/gauge × 8 wide × 5 high.
  // These are the "wake someone up" indicators (key exhausted, decrypt
  // failures, fallback storms). Always visible, no collapse, because they
  // answer "is the in-process router healthy right now". The Invalid HMAC
  // panel will join this row when the Plan U9 admin endpoint lands.
  row('LLM Router Health', [
    item('panel-60', 0, 0, 8, 5),
    item('panel-61', 8, 0, 8, 5),
    item('panel-62', 16, 0, 8, 5),
  ]),
  // Row 6.6: LLM router trends — 4 timeseries × 6 wide × 8 high.
  // Same dimensions as Row 6.5 but answers "how is it changing / which
  // provider is contributing". Wider time context for triage.
  row('LLM Router Trends', [
    item('panel-64', 0, 0, 6, 8),
    item('panel-65', 6, 0, 6, 8),
    item('panel-66', 12, 0, 6, 8),
    item('panel-67', 18, 0, 6, 8),
  ]),
  // Row 6.7: Gateway admin plane — 1 stat × 24 wide × 5 high, collapsed by
  // default. Tracks per-instance subscriber lifecycle for cross-instance
  // config consistency triage. Config Writes panel rejoins this row when the
  // Plan U9 admin endpoint lands.
  row('Gateway Admin Plane', [
    item('panel-69', 0, 0, 24, 5),
  ], { collapse: true }),
  // Row 7: 1 stat + 3 by-instance timeseries × 6 wide × 6 high (collapsed by
  // default — only relevant when triaging. By-instance breakdowns catch
  // single-replica issues that cluster aggregates would average away.)
  row('Infrastructure', [
    item('panel-50', 0, 0, 6, 6),
    item('panel-51', 6, 0, 6, 6),
    item('panel-52', 12, 0, 6, 6),
    item('panel-53', 18, 0, 6, 6),
  ], { collapse: true }),
  // Row 8: full-width logs. Two panels stacked: errors-only on top
  // (default focus for triage) and the full firehose below (manual
  // filter when you need broader context).
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
 *   2. Distribution — range share for model traffic
 *   3. Traffic Trends — model / websocket trends
 *   4. Route Triage — top requested routes, error routes/statuses, error-rate
 *      routes, and route P95 table
 *   5. Latency — P95 over routes/models
 *   6. Errors / Quality — what's failing
 *   7. Business — Stripe / Flux money flow
 *   8. Infrastructure (collapsed) — DB / runtime health for triage
 *   9. Logs — Loki for live debugging
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
