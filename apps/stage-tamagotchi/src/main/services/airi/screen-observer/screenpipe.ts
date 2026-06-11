import type { ScreenObserverAppSummary } from '@proj-airi/server-sdk-shared'

/**
 * Minimal HTTP client for a locally running screenpipe service.
 *
 * screenpipe captures the screen 24/7 on the user's machine and exposes OCR
 * results over a localhost REST API. This client only ever talks to that
 * local endpoint, and it enforces the whitelist capture boundary at the type
 * level: OCR text queries REQUIRE an app name, and the focused-window probe
 * materializes window metadata only — non-whitelisted OCR body text never
 * enters this process as data.
 */

export interface ScreenpipeClientOptions {
  /** @default 'http://127.0.0.1:3030' */
  baseUrl?: string
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch
  /** Per-request timeout. @default 5000 */
  requestTimeoutMs?: number
}

/** One OCR capture as returned by screenpipe's `/search` endpoint, reduced to the fields the observer consumes. */
export interface ScreenpipeOcrItem {
  appName: string
  windowName?: string
  text: string
  timestamp: string
}

/** App name and window title of the most recent capture — deliberately carries no OCR text. */
export interface FocusedWindowMeta {
  appName: string
  windowTitle?: string
}

export interface SearchOcrParams {
  /**
   * The whitelisted app to query. Required by design: the client cannot
   * express an unscoped OCR text query, so non-whitelisted apps' text can
   * never be requested in the first place.
   */
  appName: string
  /** ISO timestamp, inclusive window start. */
  startTime: string
  /** ISO timestamp, inclusive window end. */
  endTime: string
  /** @default 100 */
  limit?: number
}

export interface ScreenpipeClient {
  /** True when the local screenpipe service answers its health endpoint. */
  health: () => Promise<boolean>
  /** OCR captures within a time window, always scoped to a single whitelisted app. */
  searchOcr: (params: SearchOcrParams) => Promise<ScreenpipeOcrItem[]>
  /**
   * App name / window title of the most recent capture, for meeting and
   * fullscreen heuristics. Metadata only: the mapper never reads OCR text,
   * so this probe is safe to run regardless of the whitelist.
   */
  focusedWindow: () => Promise<FocusedWindowMeta | undefined>
}

interface ScreenpipeSearchResponse {
  data?: {
    type?: string
    content?: {
      text?: string
      timestamp?: string
      app_name?: string
      window_name?: string
      focused?: boolean
    }
  }[]
}

/**
 * Creates a screenpipe REST client bound to one base URL.
 *
 * Use when:
 * - The screen observer runtime needs health checks, whitelisted OCR queries,
 *   or the focused-window metadata probe from the local screenpipe service.
 *
 * Expects:
 * - screenpipe is reachable on localhost; every call resolves (never throws)
 *   so the poll loop can degrade to "screenpipe unavailable" without try/catch
 *   at each call site.
 *
 * Returns:
 * - `health()` false and empty results on any network/parse failure.
 */
export function createScreenpipeClient(options?: ScreenpipeClientOptions): ScreenpipeClient {
  const baseUrl = (options?.baseUrl ?? 'http://127.0.0.1:3030').replace(/\/$/, '')
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch
  const requestTimeoutMs = options?.requestTimeoutMs ?? 5000

  async function request(path: string): Promise<unknown | undefined> {
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        signal: AbortSignal.timeout(requestTimeoutMs),
      })
      if (!response.ok)
        return undefined
      return await response.json()
    }
    catch {
      return undefined
    }
  }

  function toItems(payload: unknown): ScreenpipeOcrItem[] {
    const data = (payload as ScreenpipeSearchResponse | undefined)?.data
    if (!Array.isArray(data))
      return []

    return data.flatMap((entry) => {
      const content = entry?.content
      if (!content?.app_name || !content.timestamp)
        return []
      return [{
        appName: content.app_name,
        windowName: content.window_name,
        text: content.text ?? '',
        timestamp: content.timestamp,
      }]
    })
  }

  // Privacy boundary: this mapper reads ONLY app_name / window_name. The
  // response body may carry OCR text from any app (transient transport bytes,
  // discarded with the parsed payload), but no text field is ever copied into
  // an object this process keeps.
  function toFocusedWindowMeta(payload: unknown): FocusedWindowMeta | undefined {
    const data = (payload as ScreenpipeSearchResponse | undefined)?.data
    const content = Array.isArray(data) ? data[0]?.content : undefined
    if (!content?.app_name)
      return undefined
    return {
      appName: content.app_name,
      windowTitle: content.window_name,
    }
  }

  return {
    health: async () => {
      const payload = await request('/health')
      return payload !== undefined
    },
    searchOcr: async (params) => {
      const query = new URLSearchParams({
        content_type: 'ocr',
        app_name: params.appName,
        start_time: params.startTime,
        end_time: params.endTime,
        limit: String(params.limit ?? 100),
      })
      return toItems(await request(`/search?${query.toString()}`))
    },
    focusedWindow: async () => {
      // `focused=true` narrows to the focused capture where screenpipe
      // supports it; `limit=1` keeps the transport payload minimal either way.
      return toFocusedWindowMeta(await request('/search?content_type=ocr&limit=1&focused=true'))
    },
  }
}

/**
 * Caps how much OCR text survives into an app digest. Only whitelisted apps
 * are ever queried, but even their raw text should not travel as-is — the
 * digest is what the observation log and downstream summarization consume.
 */
const APP_DIGEST_TEXT_LIMIT = 160

/**
 * Normalizes raw screenpipe OCR items into per-app observation summaries,
 * dropping anything outside the whitelist.
 *
 * Before:
 * - 37 OCR items for whitelisted app "Code" plus 4 items for "Slack",
 *   whitelist = ["Code"]
 *
 * After:
 * - one entry: { appId: 'code', appName: 'Code', windowTitle: 'main.ts — airi',
 *   observedSeconds: 21, summary: 'windows: main.ts — airi · …', matchedWhitelist: true }
 * - "Slack" is absent: non-whitelisted items are discarded before any
 *   aggregation, never emitted with `matchedWhitelist: false`.
 *
 * The whitelist is re-enforced here even though the poller only queries
 * whitelisted apps, so no future caller can widen the capture scope through
 * this function.
 */
export function aggregateAppSummaries(items: ScreenpipeOcrItem[], allowedApps: string[]): ScreenObserverAppSummary[] {
  const allowed = new Set(allowedApps.map(app => app.toLowerCase()))
  const byApp = new Map<string, ScreenpipeOcrItem[]>()

  for (const item of items) {
    const key = item.appName.toLowerCase()
    // Second enforcement of the capture boundary: anything that slipped past
    // the per-app queries is dropped here, not flagged and passed along.
    if (!allowed.has(key))
      continue
    const bucket = byApp.get(key)
    if (bucket)
      bucket.push(item)
    else
      byApp.set(key, [item])
  }

  return Array.from(byApp.values(), (bucket) => {
    const appName = bucket[0]!.appName

    const titleCounts = new Map<string, number>()
    for (const item of bucket) {
      if (item.windowName)
        titleCounts.set(item.windowName, (titleCounts.get(item.windowName) ?? 0) + 1)
    }
    const windowTitle = [...titleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

    // NOTICE:
    // screenpipe's default vision cadence is ~1 capture per second, so the
    // number of distinct capture timestamps approximates seconds on screen.
    // Root cause: the /search response carries no explicit duration field.
    // Source: screenpipe docs (https://docs.screenpi.pe) on capture FPS.
    // Removal condition: switch to a real duration once the poller reads
    // screenpipe's frame metadata or a future duration field.
    const observedSeconds = new Set(bucket.map(item => item.timestamp)).size

    const latestText = [...bucket]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .find(item => item.text.trim().length > 0)
      ?.text
      .trim() ?? ''
    const snippet = latestText.length > APP_DIGEST_TEXT_LIMIT
      ? `${latestText.slice(0, APP_DIGEST_TEXT_LIMIT)}…`
      : latestText

    const titles = [...titleCounts.keys()].slice(0, 3).join(', ')
    const summary = [titles && `windows: ${titles}`, snippet].filter(Boolean).join(' · ')

    return {
      appId: appName.toLowerCase(),
      appName,
      windowTitle,
      observedSeconds,
      summary,
      matchedWhitelist: true,
    }
  })
}
