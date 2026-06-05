import type { NormalizedActPayload } from './payloads'
import type {
  LlmStreamingControlParser,
  LlmStreamingControlSignal,
} from './types'

import { tokenAct, tokenCall, tokenDelay } from './parsers'
import { normalizeActPayload } from './payloads'

type IssueSeverity = 'error' | 'warning' | 'info'
type SegmentKind = 'speech' | 'silence'

/**
 * Character range inside the original LLM response.
 */
export interface StreamingControlSourceRange {
  /** Inclusive zero-based start offset. */
  start: number
  /** Exclusive zero-based end offset. */
  end: number
}

/**
 * Diagnostic emitted while scanning a full model response.
 */
export interface StreamingControlTurnPlanDiagnostic {
  /** Severity used by callers to decide whether to discard or keep a plan. */
  severity: IssueSeverity
  /** Stable machine-readable issue code. */
  code: string
  /** Human-readable explanation. */
  message: string
  /** Original source range related to the issue when available. */
  range?: StreamingControlSourceRange
  /** Raw token text related to the issue when available. */
  token?: string
}

/**
 * Speech or silence segment in one model response.
 */
export interface StreamingControlTurnSegment {
  /** Segment kind. Speech segments should be sent to TTS; silence segments should wait. */
  kind: SegmentKind
  /** Clean text without streaming-control tokens. Empty for silence segments. */
  text: string
  /** Zero-based segment order in the generated plan. */
  index: number
  /** Source range in the original response. */
  range: StreamingControlSourceRange
  /** Approximate start time after applying preceding DELAY tokens. */
  startSeconds: number
  /** Approximate end time after applying segment estimates and explicit silence. */
  endSeconds: number
  /** Active ACT payload at the start of this segment. */
  act?: NormalizedActPayload
}

/**
 * Parsed control signal embedded in one model response.
 */
export interface StreamingControlTurnSignal {
  /** Parsed signal value returned by the matching low-level parser. */
  signal: LlmStreamingControlSignal
  /** Parser name that matched the token. */
  parserName: string
  /** Original token including `<|` and `|>`. */
  raw: string
  /** Signal order among all parsed control tokens. */
  index: number
  /** Source range in the original response. */
  range: StreamingControlSourceRange
  /** Timeline cursor when the signal is encountered. */
  atSeconds: number
  /** Normalized ACT payload for ACT tokens when supported by AIRI emotions. */
  act?: NormalizedActPayload
}

/**
 * Full turn plan produced from one LLM response.
 */
export interface StreamingControlTurnPlan {
  /** Original response supplied by the caller. */
  source: string
  /** Response text with recognized streaming-control tokens removed. */
  text: string
  /** Speech and silence segments in playback order. */
  segments: StreamingControlTurnSegment[]
  /** Parsed control signals in source order. */
  signals: StreamingControlTurnSignal[]
  /** Scanner diagnostics. Plans can still be usable when this list has warnings. */
  diagnostics: StreamingControlTurnPlanDiagnostic[]
  /** Aggregate counts and timing estimates. */
  summary: StreamingControlTurnPlanSummary
}

/**
 * Aggregate counts and timing estimates for one turn plan.
 */
export interface StreamingControlTurnPlanSummary {
  /** Number of speech segments in the response. */
  speechSegmentCount: number
  /** Number of explicit silence segments introduced by DELAY tokens. */
  silenceSegmentCount: number
  /** Number of parsed ACT tokens. */
  actSignalCount: number
  /** Number of parsed DELAY tokens. */
  delaySignalCount: number
  /** Number of parsed CALL tokens. */
  callSignalCount: number
  /** Number of diagnostics grouped by severity. */
  diagnosticCount: Record<IssueSeverity, number>
  /** Total response text length after recognized control tokens are removed. */
  textLength: number
  /** Sum of explicit DELAY seconds. */
  explicitDelaySeconds: number
  /** Approximate total timeline length. */
  estimatedDurationSeconds: number
}

/**
 * Options for full-response streaming-control planning.
 */
export interface StreamingControlTurnPlanOptions {
  /** Optional parser list. Defaults to ACT, DELAY, and CALL. */
  parsers?: LlmStreamingControlParser<LlmStreamingControlSignal>[]
  /**
   * Approximate TTS speech rate used to place later signals on a timeline.
   *
   * @default 12
   */
  charactersPerSecond?: number
  /**
   * Include unrecognized `<|...|>` markers in clean text instead of stripping them.
   *
   * @default true
   */
  preserveUnknownTokens?: boolean
  /**
   * Keep empty speech segments created by adjacent control tokens.
   *
   * @default false
   */
  includeEmptySegments?: boolean
  /**
   * Add silence segments for DELAY tokens.
   *
   * @default true
   */
  includeDelaySegments?: boolean
}

/**
 * Stateful planner facade for repeatedly parsing LLM responses with the same options.
 */
export interface StreamingControlTurnPlanner {
  /**
   * Parses one full model response into speech segments and control signals.
   *
   * Use when:
   * - A runtime receives complete text and needs one deterministic playback plan
   * - A UI wants to preview how ACT, DELAY, and CALL tokens will affect a turn
   *
   * Expects:
   * - The input is one assistant response, not an infinite stream
   *
   * Returns:
   * - A pure data plan with no dispatch side effects
   */
  plan: (source: string) => StreamingControlTurnPlan
}

interface PlannerSettings {
  parsers: LlmStreamingControlParser<LlmStreamingControlSignal>[]
  charactersPerSecond: number
  preserveUnknownTokens: boolean
  includeEmptySegments: boolean
  includeDelaySegments: boolean
}

interface ExtractedMarker {
  raw: string
  body: string
  range: StreamingControlSourceRange
}

interface TextSlice {
  text: string
  range: StreamingControlSourceRange
}

interface ParsedMarker {
  marker: ExtractedMarker
  signal?: LlmStreamingControlSignal
  parserName?: string
}

interface PlanBuilderState {
  source: string
  cleanParts: string[]
  segments: StreamingControlTurnSegment[]
  signals: StreamingControlTurnSignal[]
  diagnostics: StreamingControlTurnPlanDiagnostic[]
  activeAct?: NormalizedActPayload
  cursorSeconds: number
  explicitDelaySeconds: number
  segmentIndex: number
  signalIndex: number
  lastOffset: number
}

const markerPrefix = '<|'
const markerSuffix = '|>'

const defaultPlannerSettings: PlannerSettings = {
  parsers: [tokenAct(), tokenDelay(), tokenCall()],
  charactersPerSecond: 12,
  preserveUnknownTokens: true,
  includeEmptySegments: false,
  includeDelaySegments: true,
}

/**
 * Creates a full-response planner for LLM streaming-control tokens.
 *
 * Use when:
 * - The same runtime repeatedly receives complete assistant responses
 * - Parser options should be shared across many turns
 *
 * Expects:
 * - Parsers are pure and side-effect free
 *
 * Returns:
 * - A planner object whose `plan` method returns deterministic data
 */
export function createStreamingControlTurnPlanner(
  options: StreamingControlTurnPlanOptions = {},
): StreamingControlTurnPlanner {
  const settings = resolvePlannerSettings(options)

  return {
    plan(source) {
      return planStreamingControlTurn(source, settings)
    },
  }
}

/**
 * Parses a complete LLM response into speech segments and control signals.
 *
 * Use when:
 * - A caller wants a one-shot parse without keeping a planner instance
 * - Tests, devtools, or preview panels need deterministic token planning
 *
 * Expects:
 * - `source` may contain zero or more `<|ACT ...|>`, `<|DELAY ...|>`, or `<|CALL ...|>` tokens
 *
 * Returns:
 * - Clean text, parsed control signals, timeline segments, and diagnostics
 */
export function planStreamingControlTurn(
  source: string,
  options: StreamingControlTurnPlanOptions | PlannerSettings = {},
): StreamingControlTurnPlan {
  const settings = isPlannerSettings(options)
    ? options
    : resolvePlannerSettings(options)
  const markers = extractMarkers(source)
  const state: PlanBuilderState = {
    source,
    cleanParts: [],
    segments: [],
    signals: [],
    diagnostics: [],
    cursorSeconds: 0,
    explicitDelaySeconds: 0,
    segmentIndex: 0,
    signalIndex: 0,
    lastOffset: 0,
  }

  for (const marker of markers) {
    appendTextSlice(state, settings, {
      text: source.slice(state.lastOffset, marker.range.start),
      range: {
        start: state.lastOffset,
        end: marker.range.start,
      },
    })

    const parsed = parseMarker(marker, settings.parsers)
    if (!parsed.signal || !parsed.parserName) {
      handleUnknownMarker(state, settings, marker)
    }
    else {
      appendSignal(state, settings, parsed.marker, parsed.signal, parsed.parserName)
    }

    state.lastOffset = marker.range.end
  }

  appendTextSlice(state, settings, {
    text: source.slice(state.lastOffset),
    range: {
      start: state.lastOffset,
      end: source.length,
    },
  })

  if (hasDanglingMarkerPrefix(source, markers)) {
    state.diagnostics.push({
      severity: 'warning',
      code: 'dangling-marker-prefix',
      message: 'The response contains a marker prefix without a closing marker suffix.',
    })
  }

  return {
    source,
    text: normalizeCleanText(state.cleanParts.join('')),
    segments: state.segments,
    signals: state.signals,
    diagnostics: sortDiagnostics(state.diagnostics),
    summary: buildSummary(state),
  }
}

function resolvePlannerSettings(options: StreamingControlTurnPlanOptions): PlannerSettings {
  return {
    parsers: options.parsers ?? defaultPlannerSettings.parsers,
    charactersPerSecond: normalizeSpeechRate(options.charactersPerSecond),
    preserveUnknownTokens: options.preserveUnknownTokens ?? defaultPlannerSettings.preserveUnknownTokens,
    includeEmptySegments: options.includeEmptySegments ?? defaultPlannerSettings.includeEmptySegments,
    includeDelaySegments: options.includeDelaySegments ?? defaultPlannerSettings.includeDelaySegments,
  }
}

function isPlannerSettings(options: StreamingControlTurnPlanOptions | PlannerSettings): options is PlannerSettings {
  return Array.isArray((options as PlannerSettings).parsers)
    && typeof (options as PlannerSettings).charactersPerSecond === 'number'
    && typeof (options as PlannerSettings).preserveUnknownTokens === 'boolean'
    && typeof (options as PlannerSettings).includeEmptySegments === 'boolean'
    && typeof (options as PlannerSettings).includeDelaySegments === 'boolean'
}

function normalizeSpeechRate(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return defaultPlannerSettings.charactersPerSecond
  }

  return value
}

function extractMarkers(source: string): ExtractedMarker[] {
  const markers: ExtractedMarker[] = []
  let cursor = 0

  while (cursor < source.length) {
    const start = source.indexOf(markerPrefix, cursor)
    if (start < 0) {
      break
    }

    const end = findMarkerEnd(source, start + markerPrefix.length)
    if (end < 0) {
      break
    }

    const raw = source.slice(start, end + markerSuffix.length)
    markers.push({
      raw,
      body: raw.slice(markerPrefix.length, -markerSuffix.length),
      range: {
        start,
        end: end + markerSuffix.length,
      },
    })
    cursor = end + markerSuffix.length
  }

  return markers
}

function findMarkerEnd(source: string, start: number): number {
  let quote: '"' | '\'' | undefined
  let escapeNext = false
  let braceDepth = 0
  let bracketDepth = 0

  for (let index = start; index < source.length - 1; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\') {
      escapeNext = true
      continue
    }

    if ((char === '"' || char === '\'') && !quote) {
      quote = char
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = undefined
      }
      continue
    }

    if (char === '{') {
      braceDepth += 1
      continue
    }
    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      continue
    }
    if (char === '[') {
      bracketDepth += 1
      continue
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      continue
    }

    if (char === '|' && next === '>') {
      return index
    }
  }

  return -1
}

function parseMarker(
  marker: ExtractedMarker,
  parsers: LlmStreamingControlParser<LlmStreamingControlSignal>[],
): ParsedMarker {
  const candidates = buildParserCandidates(marker.raw)

  for (const parser of parsers) {
    for (const candidate of candidates) {
      if (!parser.match(candidate)) {
        continue
      }

      const signal = parser.parse(candidate)
      if (signal) {
        return {
          marker,
          signal,
          parserName: parser.name,
        }
      }
    }
  }

  return { marker }
}

function buildParserCandidates(raw: string): string[] {
  const candidates = [raw]
  const trimmed = raw.trim()
  const delayBody = readColonPayload(trimmed, 'DELAY')
  if (delayBody) {
    candidates.push(`<|DELAY ${delayBody}|>`)
  }

  const actBody = readColonPayload(trimmed, 'ACT')
  if (actBody?.startsWith('{') && actBody.endsWith('}')) {
    candidates.push(`<|ACT ${actBody}|>`)
  }

  return candidates
}

function readColonPayload(raw: string, name: string): string | undefined {
  const prefix = `<|${name}`
  if (!raw.toUpperCase().startsWith(prefix)) {
    return undefined
  }
  if (!raw.endsWith(markerSuffix)) {
    return undefined
  }

  const body = raw.slice(prefix.length, -markerSuffix.length).trim()
  if (!body.startsWith(':')) {
    return undefined
  }

  const payload = body.slice(1).trim()
  return payload || undefined
}

function appendTextSlice(
  state: PlanBuilderState,
  settings: PlannerSettings,
  slice: TextSlice,
) {
  state.cleanParts.push(slice.text)

  const text = normalizeSpeechText(slice.text)
  if (!text && !settings.includeEmptySegments) {
    return
  }

  const startSeconds = state.cursorSeconds
  const duration = estimateSpeechSeconds(text, settings.charactersPerSecond)
  const endSeconds = startSeconds + duration

  state.segments.push({
    kind: 'speech',
    text,
    index: state.segmentIndex,
    range: slice.range,
    startSeconds,
    endSeconds,
    act: state.activeAct,
  })
  state.segmentIndex += 1
  state.cursorSeconds = endSeconds
}

function appendSignal(
  state: PlanBuilderState,
  settings: PlannerSettings,
  marker: ExtractedMarker,
  signal: LlmStreamingControlSignal,
  parserName: string,
) {
  const event: StreamingControlTurnSignal = {
    signal,
    parserName,
    raw: marker.raw,
    index: state.signalIndex,
    range: marker.range,
    atSeconds: state.cursorSeconds,
  }

  if (signal.type === 'act') {
    const normalized = normalizeActPayload(signal.payload)
    event.act = normalized
    state.activeAct = normalized
    if (!normalized.emotion && !normalized.motion) {
      state.diagnostics.push({
        severity: 'info',
        code: 'empty-act-payload',
        message: 'ACT token parsed, but no supported emotion or motion was found.',
        range: marker.range,
        token: marker.raw,
      })
    }
  }

  if (signal.type === 'delay') {
    appendDelaySegment(state, settings, signal.seconds, marker.range)
  }

  state.signals.push(event)
  state.signalIndex += 1
}

function appendDelaySegment(
  state: PlanBuilderState,
  settings: PlannerSettings,
  seconds: number,
  range: StreamingControlSourceRange,
) {
  state.explicitDelaySeconds += seconds

  if (!settings.includeDelaySegments) {
    state.cursorSeconds += seconds
    return
  }

  const startSeconds = state.cursorSeconds
  const endSeconds = startSeconds + seconds
  state.segments.push({
    kind: 'silence',
    text: '',
    index: state.segmentIndex,
    range,
    startSeconds,
    endSeconds,
    act: state.activeAct,
  })
  state.segmentIndex += 1
  state.cursorSeconds = endSeconds
}

function handleUnknownMarker(
  state: PlanBuilderState,
  settings: PlannerSettings,
  marker: ExtractedMarker,
) {
  state.diagnostics.push({
    severity: 'warning',
    code: 'unknown-control-token',
    message: 'The marker uses streaming-control syntax, but no parser accepted it.',
    range: marker.range,
    token: marker.raw,
  })

  if (settings.preserveUnknownTokens) {
    appendTextSlice(state, settings, {
      text: marker.raw,
      range: marker.range,
    })
  }
}

function estimateSpeechSeconds(text: string, charactersPerSecond: number): number {
  if (!text) {
    return 0
  }

  return text.length / charactersPerSecond
}

/**
 * Normalizes text slices before TTS playback.
 *
 * Before:
 * - `"Hello\\n\\n  there"`
 *
 * After:
 * - `"Hello there"`
 */
function normalizeSpeechText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Normalizes the final clean response text.
 *
 * Before:
 * - `"Hello <removed>\\n\\nthere"`
 *
 * After:
 * - `"Hello there"`
 */
function normalizeCleanText(text: string): string {
  return text.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function hasDanglingMarkerPrefix(source: string, markers: ExtractedMarker[]): boolean {
  const lastMarkerEnd = markers.at(-1)?.range.end ?? 0
  const prefix = source.indexOf(markerPrefix, lastMarkerEnd)
  if (prefix < 0) {
    return false
  }

  return !source.slice(prefix + markerPrefix.length).includes(markerSuffix)
}

function sortDiagnostics(
  diagnostics: StreamingControlTurnPlanDiagnostic[],
): StreamingControlTurnPlanDiagnostic[] {
  const severityWeight: Record<IssueSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  }

  return diagnostics.toSorted((left, right) => {
    const severity = severityWeight[left.severity] - severityWeight[right.severity]
    if (severity !== 0) {
      return severity
    }

    return (left.range?.start ?? 0) - (right.range?.start ?? 0)
  })
}

function buildSummary(state: PlanBuilderState): StreamingControlTurnPlanSummary {
  const diagnosticCount: Record<IssueSeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  }

  for (const diagnostic of state.diagnostics) {
    diagnosticCount[diagnostic.severity] += 1
  }

  return {
    speechSegmentCount: state.segments.filter(segment => segment.kind === 'speech').length,
    silenceSegmentCount: state.segments.filter(segment => segment.kind === 'silence').length,
    actSignalCount: state.signals.filter(signal => signal.signal.type === 'act').length,
    delaySignalCount: state.signals.filter(signal => signal.signal.type === 'delay').length,
    callSignalCount: state.signals.filter(signal => signal.signal.type === 'call').length,
    diagnosticCount,
    textLength: normalizeCleanText(state.cleanParts.join('')).length,
    explicitDelaySeconds: state.explicitDelaySeconds,
    estimatedDurationSeconds: state.cursorSeconds,
  }
}
