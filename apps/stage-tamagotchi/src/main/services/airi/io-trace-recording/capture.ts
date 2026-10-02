import type { FileHandle } from 'node:fs/promises'

import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { array, boolean, literal, number, object, optional, parse, record, string, unknown } from 'valibot'

const CAPTURE_VERSION = 1 as const
const MANIFEST_FILE = 'manifest.json'
const SPANS_FILE = 'spans.jsonl'
const LATEST_FILE = 'latest.json'

const serializedIOSpanSchema = object({
  attributes: record(string(), unknown()),
  ended: boolean(),
  endTimeNano: string(),
  events: array(object({
    attributes: record(string(), unknown()),
    name: string(),
    timeNano: string(),
  })),
  kind: number(),
  name: string(),
  parentSpanId: string(),
  spanId: string(),
  startTimeNano: string(),
  status: object({
    code: number(),
    message: string(),
  }),
  traceId: string(),
})

const captureSpanSchema = object({
  recordedAt: string(),
  span: serializedIOSpanSchema,
})

const captureManifestSchema = object({
  captureId: string(),
  spanCount: number(),
  startedAt: string(),
  stoppedAt: optional(string()),
  version: literal(CAPTURE_VERSION),
})

const latestCaptureSchema = object({
  active: boolean(),
  captureDirectory: string(),
  captureId: string(),
  version: literal(CAPTURE_VERSION),
})

export interface IOTraceCaptureSpan {
  recordedAt: string
  span: SerializedIOSpan
}

export interface IOTraceCaptureManifest {
  captureId: string
  spanCount: number
  startedAt: string
  stoppedAt?: string
  version: typeof CAPTURE_VERSION
}

export interface IOTraceCapture {
  manifest: IOTraceCaptureManifest
  spans: IOTraceCaptureSpan[]
}

export interface LatestIOTraceCapture extends IOTraceCaptureManifest {
  active: boolean
  captureDirectory: string
}

interface StartCaptureOptions {
  capturesDirectory: string
  captureId: string
  now?: () => Date
}

function parseJson<T>(text: string, schema: Parameters<typeof parse>[0], source: string): T {
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch (error) {
    throw new SyntaxError(`Invalid JSON in ${source}`, { cause: error })
  }
  return parse(schema, value) as T
}

async function writeJsonAtomic(path: string, value: unknown) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporaryPath, path)
}

export class IOTraceCaptureWriter {
  readonly captureId: string
  readonly captureDirectory: string

  private readonly manifest: IOTraceCaptureManifest
  private readonly now: () => Date
  private readonly spansFile: FileHandle
  private stopped = false
  private writes = Promise.resolve()

  private constructor(options: {
    captureDirectory: string
    manifest: IOTraceCaptureManifest
    now: () => Date
    spansFile: FileHandle
  }) {
    this.captureId = options.manifest.captureId
    this.captureDirectory = options.captureDirectory
    this.manifest = options.manifest
    this.now = options.now
    this.spansFile = options.spansFile
  }

  static async start(options: StartCaptureOptions) {
    if (!/^[\w.-]+$/.test(options.captureId))
      throw new TypeError(`Invalid IO trace capture ID: ${options.captureId}`)

    const now = options.now ?? (() => new Date())
    const captureDirectory = join(options.capturesDirectory, options.captureId)
    await mkdir(options.capturesDirectory, { mode: 0o700, recursive: true })
    await mkdir(captureDirectory, { mode: 0o700, recursive: false })

    const manifest: IOTraceCaptureManifest = {
      captureId: options.captureId,
      spanCount: 0,
      startedAt: now().toISOString(),
      version: CAPTURE_VERSION,
    }
    await writeJsonAtomic(join(captureDirectory, MANIFEST_FILE), manifest)
    const spansFile = await open(join(captureDirectory, SPANS_FILE), 'a', 0o600)
    await writeJsonAtomic(join(options.capturesDirectory, LATEST_FILE), {
      active: true,
      captureDirectory,
      captureId: options.captureId,
      version: CAPTURE_VERSION,
    })

    return new IOTraceCaptureWriter({ captureDirectory, manifest, now, spansFile })
  }

  async appendSpan(span: SerializedIOSpan): Promise<void> {
    if (this.stopped)
      throw new Error('Cannot append to a stopped IO trace capture')
    if (!span.ended || span.endTimeNano === '0')
      throw new TypeError('Only ended IO spans can be recorded')

    const record: IOTraceCaptureSpan = {
      recordedAt: this.now().toISOString(),
      span,
    }
    const append = async () => {
      await this.spansFile.appendFile(`${JSON.stringify(record)}\n`)
      this.manifest.spanCount++
    }
    this.writes = this.writes.then(append)
    await this.writes
  }

  async read(): Promise<IOTraceCapture> {
    await this.writes
    return readIOTraceCapture(this.captureDirectory)
  }

  async stop(): Promise<void> {
    if (this.stopped)
      return

    this.stopped = true
    await this.writes
    await this.spansFile.close()
    this.manifest.stoppedAt = this.now().toISOString()
    await writeJsonAtomic(join(this.captureDirectory, MANIFEST_FILE), this.manifest)
    await writeJsonAtomic(join(this.captureDirectory, '..', LATEST_FILE), {
      active: false,
      captureDirectory: this.captureDirectory,
      captureId: this.manifest.captureId,
      version: CAPTURE_VERSION,
    })
  }
}

export async function readIOTraceCapture(captureDirectory: string): Promise<IOTraceCapture> {
  const manifest = await readIOTraceCaptureManifest(captureDirectory)
  const rawSpans = await readFile(join(captureDirectory, SPANS_FILE), 'utf8')
  const spans = rawSpans
    .split('\n')
    .filter(line => line.length > 0)
    .map((line, index) => parseJson<IOTraceCaptureSpan>(line, captureSpanSchema, `${join(captureDirectory, SPANS_FILE)}:${index + 1}`))

  return {
    manifest: { ...manifest, spanCount: spans.length },
    spans,
  }
}

export async function readIOTraceCaptureManifest(captureDirectory: string): Promise<IOTraceCaptureManifest> {
  return parseJson<IOTraceCaptureManifest>(
    await readFile(join(captureDirectory, MANIFEST_FILE), 'utf8'),
    captureManifestSchema,
    join(captureDirectory, MANIFEST_FILE),
  )
}

export async function readLatestIOTraceCapture(capturesDirectory: string): Promise<LatestIOTraceCapture> {
  const pointer = parseJson<{
    active: boolean
    captureDirectory: string
    captureId: string
    version: typeof CAPTURE_VERSION
  }>(await readFile(join(capturesDirectory, LATEST_FILE), 'utf8'), latestCaptureSchema, join(capturesDirectory, LATEST_FILE))
  const capture = await readIOTraceCapture(pointer.captureDirectory)
  if (capture.manifest.captureId !== pointer.captureId)
    throw new Error(`Latest IO trace pointer refers to ${pointer.captureId}, but the capture manifest contains ${capture.manifest.captureId}`)

  return {
    ...capture.manifest,
    active: pointer.active,
    captureDirectory: pointer.captureDirectory,
  }
}
