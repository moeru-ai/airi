/** Binary or large data, stored outside the record. */
export interface TraceAssetRef {
  $asset: string
  mediaType: string
  bytes: number
}

export type TraceValue = string | number | boolean | string[] | number[] | TraceAssetRef

export type TraceAttributes = Record<string, TraceValue>

/** Domain IDs by defined ID key, for example `{ turn: 't_1', actor: 'user' }`. */
export type TraceIds = Record<string, string | number>

/** Identifies one record of the stream. */
export interface TraceRef {
  source: string
  epoch: string
  seq: number
}

/**
 * A typed relation from one record to another record, a span, or a domain ID.
 *
 * A link to a domain ID lets a producer link to work of another module without the `seq` of its record.
 */
export interface TraceLink {
  to: TraceRef | { spanId: string } | { key: string, id: string | number }
  /** A relation that `defineLink` declares, for example `caused-by` or `retry-of`. */
  rel: string
}

/** Fields of a record without a track: a system record or an annotation. */
export interface TraceUntrackedRecordBase {
  /**
   * Stable ID of one producer, for example `window:main`, `main`, `collector`, `plugin:minecraft`, or `server:api`.
   * It must not contain `/`, because record, span, and epoch keys join their parts with `/`.
   */
  source: string
  /** One run of the source. A window reload or a plugin reconnect starts a new epoch. It must not contain `/`. */
  epoch: string
  /** Emit order in the epoch, from 0. */
  seq: number
  /** The raw value of `clock` when the event happened. It is not the emit time, so a producer can backdate it. */
  ts: number
  clock: string
  /** The collector sets it on its own monotonic clock when it receives the record. */
  observedTs?: number
  /** A stream uses it to name its actor. */
  ids?: TraceIds
  attrs?: TraceAttributes
}

/** Fields of a record about domain activity. */
export interface TraceRecordBase extends TraceUntrackedRecordBase {
  /** A track path that matches a track definition, for example `participants/user/speech`. */
  track: string
  links?: TraceLink[]
  /** `reported` by the producer, or `observed` from outside, for example from audio. The default is `reported`. */
  evidence?: 'reported' | 'observed'
}

/** `status` is closed. The open `reason` gives the detail, for example `interrupted`. */
export type TraceStatus = 'ok' | 'error' | 'cancelled'

/** Who or what produced an annotation. */
export interface TraceAnnotator {
  /** `rule`: deterministic code. `model`: an LLM or another model. `human`: a reviewer. */
  kind: 'rule' | 'model' | 'human'
  /** Stable name of the annotator, for example `wer` or `turn-judge`. */
  id?: string
  /** The model ID when `kind` is `model`. */
  model?: string
  /** A prompt hash, a rule set version, or a package version. */
  version?: string
}

export type TraceSourceLostReason = 'ipc-closed' | 'heartbeat-timeout' | 'epoch-replaced'

export interface TraceSourceStarted extends TraceUntrackedRecordBase {
  type: 'source.started'
  format: number
  /** For example `electron-renderer`, `electron-main`, `browser`, or `node`. */
  runtime: string
  profiles: { key: string, version: string }[]
}

export interface TraceSourceStopped extends TraceUntrackedRecordBase {
  type: 'source.stopped'
}

/** The collector writes it with its own identity. `of` names the lost epoch, so no `seq` of the lost source is used. */
export interface TraceSourceLost extends TraceUntrackedRecordBase {
  type: 'source.lost'
  of: { source: string, epoch: string, lastSeq: number }
  reason: TraceSourceLostReason
}

/** The values of two or more clocks at one instant. */
export interface TraceClockSnapshot extends TraceUntrackedRecordBase {
  type: 'clock.snapshot'
  values: { clock: string, value: number }[]
  uncertaintyMs: number
}

/**
 * A clock jumped or stopped, for example on sleep, a device change, or an audio context suspend.
 *
 * Values after a forward jump use only the later snapshots, and a backdated value from before the jump still uses the
 * earlier ones. A backward reset makes old and new values overlap, so a value cannot tell its segment. A source whose
 * clock goes back starts a new clock name, for example `mono:window#2`. It writes this record for the old name and a
 * `clock.snapshot` for the new name.
 */
export interface TraceClockDiscontinuity extends TraceUntrackedRecordBase {
  type: 'clock.discontinuity'
  of: string
  reason: string
}

/** A media stream. It has its own clock. A recorded stream has a URI. */
export interface TraceStreamStarted extends TraceUntrackedRecordBase {
  type: 'stream.started'
  streamId: string
  mediaType: string
  rate?: number
  channels?: number
  uri?: string
}

export interface TraceStreamStopped extends TraceUntrackedRecordBase {
  type: 'stream.stopped'
  streamId: string
}

export interface TraceSpanBegin extends TraceRecordBase {
  type: 'span.begin'
  spanId: string
  /** Real nesting only. Any other relation is a link. */
  parentSpanId?: string
  name: string
  /** The viewer marks the open span as overdue after this many milliseconds. It does not end the span. */
  deadlineMs?: number
}

/** Adds attributes to an open span. They merge shallowly in `seq` order, and the last write of a key wins. */
export interface TraceSpanUpdate extends TraceRecordBase {
  type: 'span.update'
  spanId: string
}

export interface TraceSpanEnd extends TraceRecordBase {
  type: 'span.end'
  spanId: string
  status: TraceStatus
  reason?: string
  message?: string
}

/** A span that the producer measures after it ends. Chrome trace `X`. */
export interface TraceSpanComplete extends TraceRecordBase {
  type: 'span.complete'
  spanId: string
  parentSpanId?: string
  name: string
  durationMs: number
  status: TraceStatus
  reason?: string
}

/** With `spanId`, the instant belongs to that span. Without it, the instant belongs to its track only. */
export interface TraceInstant extends TraceRecordBase {
  type: 'instant'
  name: string
  spanId?: string
}

/** A state change. `from` is the state that it leaves. The trigger is a `caused-by` link. */
export interface TraceState extends TraceRecordBase {
  type: 'state'
  value: string
  from?: string
}

/** Values that change rarely. A frequent series uses `sample.chunk`. */
export interface TraceSample extends TraceRecordBase {
  type: 'sample'
  values: Record<string, number>
}

/**
 * About one second of a series. `ts` is the time of the first point.
 * A regular series gives `intervalMs`. An irregular series gives `offsetsMs` from `ts`.
 */
export interface TraceSampleChunk extends TraceRecordBase {
  type: 'sample.chunk'
  intervalMs?: number
  offsetsMs?: number[]
  values: Record<string, number[]>
}

export interface TraceLog extends TraceRecordBase {
  type: 'log'
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
}

/** Announces one definition before the first record that uses it, and again when it changes. */
export interface TraceDefinitionRecord extends TraceUntrackedRecordBase {
  type: 'definition'
  kind: TraceDefinitionKind
  key: string
  data: unknown
}

/** A label, score, or evaluation that is added later. A producer decision is not an annotation. */
export interface TraceAnnotation extends TraceUntrackedRecordBase {
  type: 'annotation'
  target: { ref?: TraceRef, spanId?: string, ids?: TraceIds }
  name: string
  value?: TraceValue
  label?: string
  explanation?: string
  annotator: TraceAnnotator
}

export type TraceRecord
  = | TraceSourceStarted
    | TraceSourceStopped
    | TraceSourceLost
    | TraceClockSnapshot
    | TraceClockDiscontinuity
    | TraceStreamStarted
    | TraceStreamStopped
    | TraceSpanBegin
    | TraceSpanUpdate
    | TraceSpanEnd
    | TraceSpanComplete
    | TraceInstant
    | TraceState
    | TraceSample
    | TraceSampleChunk
    | TraceLog
    | TraceDefinitionRecord
    | TraceAnnotation

export type TraceRecordType = TraceRecord['type']

/** A record with a track. */
export type TraceTrackedRecord = Extract<TraceRecord, { track: string }>

/** A record that describes the trace itself. */
export type TraceSystemRecord = Extract<TraceRecord, { type: 'source.started' | 'source.stopped' | 'source.lost' | 'clock.snapshot' | 'clock.discontinuity' | 'stream.started' | 'stream.stopped' | 'definition' }>

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * A record as a producer emits it. The source stamps `source`, `epoch`, and `seq`. The collector sets `observedTs`.
 * `clock` is optional: the source fills in its own monotonic clock.
 */
export type TraceRecordInput = DistributiveOmit<TraceRecord, 'source' | 'epoch' | 'seq' | 'observedTs' | 'clock'> & { clock?: string }

/** One string, or one string for each BCP 47 locale. */
export type Localizable = string | Record<string, string>

export type TraceDefinitionKind
  = | 'track'
    | 'attribute'
    | 'id-key'
    | 'link'
    | 'end-reason'
    | 'clock'
    | 'metric'
    | 'score'
    | 'pipeline'
    | 'preset'
    | 'profile'
