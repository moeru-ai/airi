/**
 * web-rwkv (WebGPU RWKV) Web Worker entry point.
 *
 * Speaks the Eventa inference contract (see `libs/inference/contract.ts`): load
 * is a server-streaming invoke (download/convert/compile progress then a terminal
 * `ready`); generate is a server-streaming invoke that emits decoded text chunks.
 *
 * web-rwkv is **WebGPU-only** (the wasm calls `navigator.gpu`; there is no CPU
 * fallback) and its loader reads every tensor as f16, so this worker casts
 * bf16/f32 safetensors to f16 at load (see `./safetensors`). The inference loop
 * mirrors the upstream `web-rwkv-wasm` usage: run → sampler.transform → softmax →
 * sampler.sample, stopping on the end-of-text token (0).
 */

import type { ModelInfo, Session as SessionInstance } from '@cryscan/web-rwkv-wasm'

import type {
  LoadStreamItem,
  WebRwkvGenerateChunk,
  WebRwkvGenerateRequest,
  WebRwkvLoadRequest,
} from '../../libs/inference/contract'
import type { ModelCacheWriter } from './cache'

import init, {

  NucleusSampler,

  Session,
  SessionType,
  Tensor,
  TensorReader,
  Tokenizer,
} from '@cryscan/web-rwkv-wasm'
import wasmUrl from '@cryscan/web-rwkv-wasm/web_rwkv_wasm_bg.wasm?url'

import { defineInvokeHandler, defineStreamInvokeHandler, toStreamHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers/worker'

import { DEFAULT_VOCAB_URL } from '../../libs/inference/constants'
import {
  webRwkvGenerateEvent,
  webRwkvLoadEvent,
  webRwkvUnloadEvent,
} from '../../libs/inference/contract'
import { cacheKeyForModel, createCacheWriter, readCachedModel } from './cache'
import { countRwkvLayers, orientAdapterMatrix, readSafetensorsHeader, readSafetensorsHeaderLen, toF16Bytes } from './safetensors'
import { applyTopK } from './sampling'
import { createStopScanner } from './stop'

const { context } = createContext()

let wasmReady: Promise<unknown> | null = null
/** Initialize the wasm once (idempotent). */
function ensureWasm(): Promise<unknown> {
  wasmReady ??= init({ module_or_path: wasmUrl })
  return wasmReady
}

interface LoadedModel {
  session: SessionInstance
  tokenizer: Tokenizer
  info: ModelInfo
  /** The model + vocab URLs this session was built from (to skip redundant reloads). */
  modelUrl: string
  vocabUrl: string
}

let loaded: LoadedModel | null = null

/**
 * Max retry attempts for a single Range request before giving up.
 *
 * A model is fetched as hundreds of small ranges; one transient network blip
 * (`TypeError: Failed to fetch`) or a CDN 5xx/429 would otherwise fail the whole
 * load. The signed CDN URL is stable for ~1h (see {@link buildReader}), so
 * re-issuing the same range is safe.
 */
const RANGE_FETCH_MAX_RETRIES = 4
/** Base backoff between Range-request retries; grows linearly per attempt. */
const RANGE_FETCH_RETRY_BASE_MS = 300

/** Linear backoff sleep between retries, rejected immediately if `signal` aborts. */
function delayBeforeRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, RANGE_FETCH_RETRY_BASE_MS * (attempt + 1))
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Fetch a byte range `[start, end]` (inclusive) as bytes, retrying transient
 * failures with linear backoff (up to {@link RANGE_FETCH_MAX_RETRIES}). Network
 * errors (`TypeError: Failed to fetch`) and 5xx/429 responses are retried; an
 * explicit abort or any other non-2xx status is fatal.
 */
async function fetchRange(url: string, start: number, end: number, signal?: AbortSignal): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted)
      throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal })
      if (res.status !== 206 && res.status !== 200) {
        // 5xx (CDN hiccup) and 429 (rate limit) may clear on retry; others are fatal.
        if ((res.status >= 500 || res.status === 429) && attempt < RANGE_FETCH_MAX_RETRIES) {
          await delayBeforeRetry(attempt, signal)
          continue
        }
        throw new Error(`web-rwkv: ${url} range request -> HTTP ${res.status}`)
      }
      return new Uint8Array(await res.arrayBuffer())
    }
    catch (error) {
      if ((error as Error)?.name === 'AbortError' || attempt >= RANGE_FETCH_MAX_RETRIES)
        throw error
      await delayBeforeRetry(attempt, signal)
    }
  }
}

/** Coerce a Uint8Array to an exact-fit ArrayBuffer (copying only when it's a partial view). */
function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength)
    return bytes.buffer as ArrayBuffer
  return bytes.slice().buffer as ArrayBuffer
}

interface BuiltReader {
  reader: TensorReader
  numLayer: number
}

/**
 * Max concurrent chunk Range requests on the streaming load path.
 *
 * A safetensors RWKV model is hundreds of small tensors; the load is otherwise
 * round-trip-latency bound (each request waits a full RTT to the HF CDN before
 * the next starts), which on a high-latency link can exceed the load timeout. The
 * HF CDN serves over HTTP/2, so several ranges multiplex over one connection — 8
 * in flight saturates typical bandwidth without tripping per-host stream limits
 * or rate limiting.
 */
const TENSOR_FETCH_CONCURRENCY = 8

/**
 * Target max bytes per coalesced Range request.
 *
 * safetensors stores tensors contiguously, so adjacent ones are merged into a
 * single Range request up to this size — turning hundreds of tiny per-tensor
 * fetches into a handful of larger ones (far less per-request overhead, better
 * throughput, and fewer billable requests against the model host). A tensor
 * larger than this still gets its own (oversized) chunk. Kept well under the
 * ~2 GiB ArrayBuffer cap so each request stays allocatable; with
 * {@link TENSOR_FETCH_CONCURRENCY} in flight, peak resident bytes stay bounded
 * at ~`TENSOR_FETCH_CONCURRENCY × MAX_CHUNK_BYTES` (~1 GiB) rather than the
 * whole model.
 */
const MAX_CHUNK_BYTES = 128 * 1024 * 1024

/**
 * Build a {@link TensorReader} from a safetensors model URL, casting each tensor
 * to f16. Streams the data block over HTTP Range in contiguous chunks (up to
 * {@link MAX_CHUNK_BYTES} each, {@link TENSOR_FETCH_CONCURRENCY} in flight) when
 * the host supports it — so models larger than the ~2 GiB ArrayBuffer cap still
 * load — else falls back to a single whole-file fetch.
 */
async function buildReader(
  url: string,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  cacheWriter?: ModelCacheWriter,
): Promise<BuiltReader> {
  // Probe with a tiny range: 206 → server supports Range (stream per tensor);
  // 200 → server ignored Range and sent the whole file (use it directly).
  const probe = await fetch(url, { headers: { Range: 'bytes=0-7' }, signal })
  if (!probe.ok && probe.status !== 206)
    throw new Error(`web-rwkv: failed to fetch model ${url} -> HTTP ${probe.status}`)

  // A safetensors body is binary. A text/HTML/JSON content-type here means the URL
  // resolved to an error/login/landing page (wrong URL, auth wall, or a host that
  // 200s a "not found" page) — catch it before its first 8 bytes (e.g. "<!doctype")
  // get read as an 8-byte header length and fail deep in the parser. Servers that
  // omit content-type or send octet-stream pass through to the header-length guard.
  const contentType = probe.headers.get('content-type') ?? ''
  if (/text\/|application\/(?:json|xml|xhtml)/i.test(contentType))
    throw new Error(`web-rwkv: ${url} returned "${contentType}", not a model file — check the model URL`)

  if (probe.status === 206) {
    // Resolve the signed CDN URL once. HF `resolve/main` URLs 302 to a freshly
    // signed cas-bridge URL (valid ~1h; see X-Amz-Expires). Re-fetching the
    // resolve URL per tensor would issue hundreds of redirect round-trips and
    // re-hit HF's resolver rate limit (RateLimit-Policy q=3000;w=300), which
    // under load returns errors lacking CORS headers — surfacing in the browser
    // as `TypeError: Failed to fetch`. `probe.url` is the final URL after the
    // redirect, so every range goes straight to the CDN.
    const dataUrl = probe.url || url
    const head8 = new Uint8Array(await probe.arrayBuffer())
    const headerLen = readSafetensorsHeaderLen(head8)
    const headBytes = await fetchRange(dataUrl, 0, 8 + headerLen - 1, signal)
    const { tensors, dataStart } = readSafetensorsHeader(headBytes)
    const names = Object.keys(tensors)
    // Embedding width, used to detect raw-HF adapter matrices that need transposing.
    const numEmb = tensors['emb.weight']?.shape[1] ?? Number.NaN

    // Order tensors by data-block offset (header key order isn't guaranteed to
    // match), carrying the original header index so built[] stays in header order.
    const ordered = names
      .map((name, index) => ({ name, index, start: tensors[name].data_offsets[0], end: tensors[name].data_offsets[1] }))
      .sort((a, b) => a.start - b.start)

    // Coalesce strictly-contiguous tensors (safetensors has no gaps) into chunks
    // of at most MAX_CHUNK_BYTES; a single tensor larger than that gets its own
    // oversized chunk. Each chunk becomes one Range request.
    const chunks: typeof ordered[] = []
    for (const entry of ordered) {
      const current = chunks[chunks.length - 1]
      const fits = current
        && entry.start === current[current.length - 1].end
        && entry.end - current[0].start <= MAX_CHUNK_BYTES
      if (fits)
        current.push(entry)
      else
        chunks.push([entry])
    }

    // Slot built[i] by original index so the reader sees tensors in header order
    // regardless of which concurrent fetch finishes first.
    const built: Tensor[] = Array.from({ length: names.length })
    let nextChunk = 0
    let completed = 0

    // Bounded worker pool: each pulls the next chunk index, fetches the whole
    // chunk in one Range request, then slices each tensor out of it and casts to
    // f16. `nextChunk++` is atomic between awaits (single-threaded), so no two
    // workers claim the same chunk. The first fetch to reject aborts the whole
    // Promise.all.
    async function fetchWorker(): Promise<void> {
      while (nextChunk < chunks.length) {
        const chunk = chunks[nextChunk++]
        if (signal?.aborted)
          throw new DOMException('Aborted', 'AbortError')
        const chunkStart = chunk[0].start
        const chunkEnd = chunk[chunk.length - 1].end
        const bytes = chunkEnd > chunkStart
          ? await fetchRange(dataUrl, dataStart + chunkStart, dataStart + chunkEnd - 1, signal)
          : new Uint8Array(0)
        for (const entry of chunk) {
          const info = tensors[entry.name]
          // subarray is a view into the shared chunk buffer; toF16Bytes/exactBuffer
          // copy out of it (see alignedCopy/exactBuffer), so the buffer is freed
          // once the chunk's tensors are built.
          const raw = bytes.subarray(entry.start - chunkStart, entry.end - chunkStart)
          const f16 = toF16Bytes(raw, info.dtype)
          const oriented = orientAdapterMatrix(entry.name, f16, info.shape, numEmb)
          built[entry.index] = new Tensor(entry.name, Uint32Array.from(oriented.shape), exactBuffer(oriented.data))
          // Stream the converted tensor through to the OPFS cache (no-op if caching
          // is disabled). Keyed by header index so the on-disk index stays in header
          // order despite out-of-order concurrent completion.
          cacheWriter?.add(entry.index, { name: entry.name, shape: oriented.shape, data: oriented.data })
          onProgress(++completed, names.length)
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(TENSOR_FETCH_CONCURRENCY, chunks.length) }, () => fetchWorker()),
    )
    return { reader: new TensorReader(built), numLayer: countRwkvLayers(tensors) }
  }

  // Whole-file path.
  const fileBytes = new Uint8Array(await probe.arrayBuffer())
  const { tensors, dataStart } = readSafetensorsHeader(fileBytes)
  const names = Object.keys(tensors)
  // Embedding width, used to detect raw-HF adapter matrices that need transposing.
  const numEmb = tensors['emb.weight']?.shape[1] ?? Number.NaN
  const built: Tensor[] = []
  for (let i = 0; i < names.length; i++) {
    if (signal?.aborted)
      throw new DOMException('Aborted', 'AbortError')
    const info = tensors[names[i]]
    const [start, end] = info.data_offsets
    const raw = fileBytes.subarray(dataStart + start, dataStart + end)
    const f16 = toF16Bytes(raw, info.dtype)
    const oriented = orientAdapterMatrix(names[i], f16, info.shape, numEmb)
    built.push(new Tensor(names[i], Uint32Array.from(oriented.shape), exactBuffer(oriented.data)))
    cacheWriter?.add(i, { name: names[i], shape: oriented.shape, data: oriented.data })
    onProgress(i + 1, names.length)
  }
  return { reader: new TensorReader(built), numLayer: countRwkvLayers(tensors) }
}

defineStreamInvokeHandler(context, webRwkvLoadEvent, toStreamHandler<WebRwkvLoadRequest, LoadStreamItem>(async ({ payload, emit, options }) => {
  const signal = options?.abortController?.signal
  const modelUrl = payload.model
  const vocabUrl = payload.vocab || DEFAULT_VOCAB_URL

  // Already loaded with the same model + vocab — nothing to do.
  if (loaded && loaded.modelUrl === modelUrl && loaded.vocabUrl === vocabUrl) {
    emit({ kind: 'ready', info: { device: 'webgpu', metadata: { model: modelUrl } } })
    return
  }

  console.info('[web-rwkv:worker] initializing wasm…')
  await ensureWasm()

  // Try the OPFS cache first (keyed by the stable model URL, not the signed CDN
  // URL): a hit skips both the download and the f16 cast. The in-memory `loaded`
  // guard above already short-circuits repeat loads within a session; this
  // persists the converted weights across reloads.
  const cacheKey = await cacheKeyForModel(modelUrl)
  let reader: TensorReader
  const cached = await readCachedModel(cacheKey, p => new Tensor(p.name, Uint32Array.from(p.shape), exactBuffer(p.data)))
  if (cached) {
    console.info(`[web-rwkv:worker] loaded ${cached.length} weights from OPFS cache`)
    emit({ kind: 'progress', payload: { phase: 'download', percent: 100, message: `Loaded weights from cache (${cached.length} tensors)` } })
    reader = new TensorReader(cached)
  }
  else {
    console.info('[web-rwkv:worker] wasm ready; downloading + converting weights', modelUrl)
    emit({ kind: 'progress', payload: { phase: 'download', percent: -1, message: 'Downloading + converting model weights…' } })
    const downloadStart = performance.now()
    // Stream the converted weights through to OPFS as they download, so the next
    // load hits the cache. Best-effort: abort discards a partial file on failure.
    const cacheWriter = await createCacheWriter(cacheKey, modelUrl)
    try {
      const built = await buildReader(modelUrl, (done, total) => {
        if (done === 1 || done === total || done % 25 === 0)
          console.info(`[web-rwkv:worker] weights ${done}/${total} (${Math.round((done / total) * 100)}%)`)
        emit({ kind: 'progress', payload: { phase: 'download', percent: Math.round((done / total) * 100), message: `Preparing weights ${done}/${total}` } })
      }, signal, cacheWriter)
      if (signal?.aborted) {
        await cacheWriter.abort()
        return
      }
      await cacheWriter.finalize()
      reader = built.reader
    }
    catch (error) {
      await cacheWriter.abort()
      throw error
    }
    console.info(`[web-rwkv:worker] weights ready in ${Math.round(performance.now() - downloadStart)}ms`)
  }

  if (signal?.aborted)
    return

  emit({ kind: 'progress', payload: { phase: 'compile', percent: -1, message: 'Building session (compiling WebGPU shaders)…' } })
  console.info('[web-rwkv:worker] building session (compiling WebGPU shaders)…')
  const compileStart = performance.now()
  // quant args (Int8 / NF4 / SF4 layer counts) = 0 → full f16, matching the
  // upstream default; quantization can be wired through later if needed.
  const session = await Session.from_reader(reader, 0, 0, 0, SessionType.Chat)
  console.info(`[web-rwkv:worker] session built in ${Math.round(performance.now() - compileStart)}ms`)

  console.info('[web-rwkv:worker] fetching vocab', vocabUrl)
  const vocabRes = await fetch(vocabUrl, { signal })
  if (!vocabRes.ok)
    throw new Error(`web-rwkv: failed to fetch vocab ${vocabUrl} -> HTTP ${vocabRes.status}`)
  const tokenizer = new Tokenizer(await vocabRes.text())

  // Replace any previously loaded model, freeing its GPU resources.
  loaded?.session.free()
  loaded = { session, tokenizer, info: session.info(), modelUrl, vocabUrl }

  console.info('[web-rwkv:worker] model ready')
  emit({ kind: 'ready', info: { device: 'webgpu', metadata: { model: modelUrl } } })
}))

/**
 * Role markers that end an assistant turn. RWKV "World"/G1 chat models are trained
 * to stop at the next `"\n\nUser:"` rather than emitting the end-of-text token, so
 * generation must halt here or the model role-plays past its reply (inventing a
 * user turn + its own next answer) until `maxTokens`. `Assistant:`/`System:` guard
 * the rarer case of the model opening a second turn of either kind directly.
 *
 * Both the blank-line (`"\n\n"`) and single-newline (`"\n"`) forms are listed: the
 * trained boundary is the blank-line form, but the tiny 0.1B model often emits the
 * next turn after a single newline (e.g. `"…answer.\nUser:"`) — or even mid-reply
 * after some preamble — and without the single-newline form generation never halts,
 * so the whole hallucinated dialogue ("Programming Language: Python\nUser: …") gets
 * emitted. The scanner cuts at the earliest match, so a genuine blank-line boundary
 * still cuts on the `"\n\n…"` form (no leftover trailing newline) while the
 * single-newline form is the safety net.
 */
const STOP_ROLES = ['User', 'Assistant', 'System'] as const
const STOP_SEQUENCES = STOP_ROLES.flatMap(role => [`\n\n${role}:`, `\n${role}:`])

defineStreamInvokeHandler(context, webRwkvGenerateEvent, toStreamHandler<WebRwkvGenerateRequest, WebRwkvGenerateChunk>(async ({ payload, emit, options }) => {
  if (!loaded)
    throw new Error('web-rwkv: no model loaded')

  const signal = options?.abortController?.signal
  const { session, tokenizer, info } = loaded

  // Log the exact prompt fed to the model (full chat history + the fake-think
  // assistant opener). Logged as an object so devtools renders it collapsed
  // (the console is already noisy from local-provider port probing); the quoted
  // string value still exposes leading/trailing whitespace and the trailing
  // `<think></think`.
  console.info('[web-rwkv:worker] prompt', { prompt: payload.prompt, length: payload.prompt.length })

  // Reset the recurrent state to zeros so each request is stateless — the
  // provider sends the full chat history every call (OpenAI semantics), so we
  // must not carry state across generations.
  session.load(new Float32Array(session.state_len()))

  // RWKV-native sampling order: the wasm NucleusSampler applies the penalties and
  // top-p, then reshapes by temperature. Request params are fed straight through
  // (no OpenAI-style transform) — see WEB_RWKV_SAMPLING_DEFAULTS.
  const sampler = new NucleusSampler(
    info,
    payload.temperature,
    payload.topP,
    payload.presencePenalty,
    payload.countPenalty,
    payload.penaltyDecay,
  )
  const output = new Float32Array(info.num_vocab)
  const probs = new Float32Array(info.num_vocab)

  let tokens = tokenizer.encode(new TextEncoder().encode(payload.prompt))
  // Streaming UTF-8 decode: a token can be a partial multi-byte char, so keep the
  // decoder stateful across tokens and flush at the end.
  const decoder = new TextDecoder('utf-8')
  // Halt at the next role marker (the model's real turn boundary; see
  // STOP_SEQUENCES), trimming it from the output. Handles a marker split across
  // tokens without emitting a partial match.
  const stopScanner = createStopScanner(STOP_SEQUENCES)

  for (let i = 0; i < payload.maxTokens; i++) {
    if (signal?.aborted)
      return

    // Feed the whole prompt on the first step, then one generated token per step.
    if (tokens.length > 0)
      await session.run(tokens, output)

    sampler.transform(output) // repetition penalties, in place
    await session.softmax(output, probs)
    // Top-k truncation (no-op when payload.topK is 0); the wasm NucleusSampler has
    // no native top-k, so the worker truncates the probabilities before its top-p.
    applyTopK(probs, payload.topK)
    const token = sampler.sample(probs)
    if (token === 0) // end-of-text
      break

    sampler.update(Uint32Array.of(token))
    tokens = Uint32Array.of(token)

    const decoded = decoder.decode(tokenizer.decode(tokens), { stream: true })
    if (decoded) {
      const text = stopScanner.push(decoded)
      if (text)
        emit({ text })
      if (stopScanner.stopped) // hit a role marker — assistant turn is complete
        break
    }
  }

  // Natural end (EOT / maxTokens, not a stop sequence): flush the decoder's held
  // bytes through the scanner, then release any tail it was holding back.
  if (!stopScanner.stopped) {
    const tail = stopScanner.push(decoder.decode())
    if (tail)
      emit({ text: tail })
    if (!stopScanner.stopped) {
      const rest = stopScanner.flush()
      if (rest)
        emit({ text: rest })
    }
  }
}))

defineInvokeHandler(context, webRwkvUnloadEvent, () => {
  loaded?.session.free()
  loaded = null
})
