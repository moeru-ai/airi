/**
 * Minimal safetensors reading + dtype normalization for the web-rwkv worker.
 *
 * web-rwkv's wasm `Tensor(name, shape, buffer)` API carries no dtype — its
 * loader hardcodes `Dtype::F16` (see web-rwkv `crates/web-rwkv-wasm/src/loader.rs`).
 * So every tensor we hand it must be little-endian **f16** bytes. RWKV-7 "World"
 * checkpoints published as safetensors are commonly **bf16** (and some are f32),
 * which would be silently misread as f16 → garbage output. We therefore read the
 * real dtype from the safetensors header and cast to f16 before building tensors.
 *
 * The same loader also hardcodes the *converted* tensor layout: RWKV-7 low-rank
 * adapter matrices must be stored `(out, in)`, which is what
 * `convert_safetensors.py` produces by transposing them. Raw HuggingFace
 * checkpoints store them transposed (`(in, out)`), and the published wasm loader
 * does no reorientation (the upstream fix is unreleased — see
 * `orient_lora_matrix` in web-rwkv `src/runtime/loader.rs`). So we detect
 * raw-HF adapters by shape and transpose them here, matching that native logic.
 *
 * These helpers are pure (no DOM/wasm) so they can be unit-tested directly.
 */

/** Per-tensor entry from a safetensors header (the fields we use). */
export interface SafetensorsTensorInfo {
  /** Source dtype, e.g. `"F16"`, `"BF16"`, `"F32"`. */
  dtype: string
  /** Tensor shape. */
  shape: number[]
  /** `[start, end)` byte range within the data block (after the header). */
  data_offsets: [number, number]
}

/** Parsed safetensors header plus where the tensor data block begins. */
export interface SafetensorsHeader {
  /** Tensor name → info (the `__metadata__` entry is stripped). */
  tensors: Record<string, SafetensorsTensorInfo>
  /** Byte offset where tensor data starts (`8 + headerLen`). */
  dataStart: number
  /** Length of the JSON header in bytes. */
  headerLen: number
}

// Scratch buffers for bit-level float reinterpretation. Module-level (not
// per-call) to avoid allocating on every element during a large cast.
const f32Scratch = new Float32Array(1)
const i32Scratch = new Int32Array(f32Scratch.buffer)

/**
 * Convert an `f32` value to its IEEE-754 binary16 (half) bit pattern.
 *
 * Round-to-nearest-even, with subnormal and overflow handling. This is the
 * classic float→half conversion; model weights never contain NaN/Inf, but those
 * are still mapped to half NaN/Inf for completeness.
 *
 * Before:
 * - `1.0` (f32)
 *
 * After:
 * - `0x3C00` (half)
 */
export function f32ToHalfBits(value: number): number {
  f32Scratch[0] = value
  const x = i32Scratch[0]

  let bits = (x >> 16) & 0x8000 // sign
  let mantissa = (x >> 12) & 0x07FF // top mantissa bits + rounding bit
  const exp = (x >> 23) & 0xFF // biased f32 exponent

  // Too small to represent (underflow to signed zero).
  if (exp < 103)
    return bits

  // Overflow / Inf / NaN.
  if (exp > 142) {
    bits |= 0x7C00
    // Preserve NaN-ness (non-zero mantissa) vs Inf (zero mantissa).
    bits |= (exp === 255 && (x & 0x007FFFFF)) ? 0x0200 : 0
    return bits
  }

  // Subnormal half: shift the implicit leading 1 in and round.
  if (exp < 113) {
    mantissa |= 0x0800
    bits |= (mantissa >> (114 - exp)) + ((mantissa >> (113 - exp)) & 1)
    return bits
  }

  // Normal half.
  bits |= ((exp - 112) << 10) | (mantissa >> 1)
  bits += mantissa & 1
  return bits
}

/**
 * Convert a `bf16` bit pattern to an `f16` bit pattern.
 *
 * `bf16` is the high 16 bits of an `f32`, so widening is exact (`bits << 16`);
 * only the f32→f16 narrowing rounds.
 *
 * Before:
 * - `0x3F80` (bf16 `1.0`)
 *
 * After:
 * - `0x3C00` (f16 `1.0`)
 */
export function bf16BitsToF16Bits(bf16: number): number {
  i32Scratch[0] = bf16 << 16
  return f32ToHalfBits(f32Scratch[0])
}

/**
 * Return a fresh, 4-byte-aligned copy of `src` when its backing buffer is offset
 * or shared, so it is safe to view as `Uint16Array`/`Float32Array`. Returns the
 * input unchanged when it already owns an aligned buffer.
 */
function alignedCopy(src: Uint8Array): Uint8Array {
  if (src.byteOffset % 4 === 0 && src.byteLength === src.buffer.byteLength)
    return src
  return src.slice()
}

/**
 * Normalize a tensor's raw safetensors bytes to little-endian **f16** bytes.
 *
 * Use when:
 * - Building web-rwkv `Tensor`s from a safetensors model whose dtype may be
 *   f16, bf16, or f32.
 *
 * Expects:
 * - `src` is the tensor's raw bytes; `dtype` is its safetensors dtype string.
 *
 * Returns:
 * - f16 bytes. The input is returned as-is for `"F16"`; `"BF16"`/`"F32"` are
 *   cast element-wise. Throws on any other dtype.
 */
export function toF16Bytes(src: Uint8Array, dtype: string): Uint8Array {
  if (dtype === 'F16')
    return src

  if (dtype === 'BF16') {
    const aligned = alignedCopy(src)
    const inU16 = new Uint16Array(aligned.buffer, aligned.byteOffset, aligned.byteLength >> 1)
    const out = new Uint16Array(inU16.length)
    for (let i = 0; i < inU16.length; i++)
      out[i] = bf16BitsToF16Bits(inU16[i])
    return new Uint8Array(out.buffer)
  }

  if (dtype === 'F32') {
    const aligned = alignedCopy(src)
    const inF32 = new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength >> 2)
    const out = new Uint16Array(inF32.length)
    for (let i = 0; i < inF32.length; i++)
      out[i] = f32ToHalfBits(inF32[i])
    return new Uint8Array(out.buffer)
  }

  throw new Error(`web-rwkv: unsupported safetensors dtype "${dtype}" (expected F16, BF16, or F32)`)
}

/**
 * The raw row-major safetensors axis on which `num_emb` must sit for a canonical
 * RWKV low-rank adapter matrix, or `null` if `name` is not such an adapter.
 *
 * Mirrors web-rwkv's `lora_num_emb_axis` (`src/runtime/loader.rs`) but expressed
 * in raw safetensors axes instead of web-rwkv's reversed internal axes:
 * down-projections (`*.w1/.a1/.g1/.v1`, `*time_mix_w1`, `*time_decay_w1`) carry
 * `num_emb` on the last axis; up-projections (`*.w2/.a2/.g2/.v2`,
 * `*time_mix_w2`, `*time_decay_w2`) on the second-to-last axis. The `.wN` match is
 * dot-anchored so the v7 adapters don't also catch the v6 `_wN` tensors, which are
 * matched by their full suffix.
 */
export function loraNumEmbRawAxis(name: string, ndims: number): number | null {
  if (ndims < 2)
    return null
  const endsWithDot = (suffixes: string[]): boolean => suffixes.some(s => name.endsWith(`.${s}`))
  if (endsWithDot(['w1', 'a1', 'g1', 'v1']) || name.endsWith('time_mix_w1') || name.endsWith('time_decay_w1'))
    return ndims - 1
  if (endsWithDot(['w2', 'a2', 'g2', 'v2']) || name.endsWith('time_mix_w2') || name.endsWith('time_decay_w2'))
    return ndims - 2
  return null
}

/**
 * Transpose the inner two axes of a row-major tensor of little-endian **f16**
 * (2-byte) elements, preserving any leading axes (each leading slice is
 * transposed independently). This is the byte-level equivalent of
 * `convert_safetensors.py`'s `v.transpose(dims - 2, dims - 1)` and web-rwkv's
 * `TensorCpu::transpose`.
 */
function transposeInnerAxesF16(data: Uint8Array, shape: number[]): { data: Uint8Array, shape: number[] } {
  const n = shape.length
  const rows = shape[n - 2]
  const cols = shape[n - 1]
  let outer = 1
  for (let k = 0; k < n - 2; k++)
    outer *= shape[k]

  const out = new Uint8Array(data.byteLength)
  for (let o = 0; o < outer; o++) {
    const base = o * rows * cols
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const from = (base + i * cols + j) * 2
        const to = (base + j * rows + i) * 2
        out[to] = data[from]
        out[to + 1] = data[from + 1]
      }
    }
  }

  const shapeOut = shape.slice()
  shapeOut[n - 2] = cols
  shapeOut[n - 1] = rows
  return { data: out, shape: shapeOut }
}

/**
 * Reorient a raw HuggingFace RWKV low-rank adapter matrix to web-rwkv's canonical
 * `(out, in)` on-disk layout, transposing its inner two axes when `num_emb` is not
 * on the expected axis. Non-adapter tensors and already-converted adapters are
 * returned unchanged (same backing bytes and shape).
 *
 * Mirrors web-rwkv's `orient_lora_matrix` (`src/runtime/loader.rs`). The published
 * `@cryscan/web-rwkv-wasm` loader does no reorientation, so a checkpoint converted
 * only for dtype (not transposed by `convert_safetensors.py`) must be reoriented
 * here or it produces garbage output.
 *
 * Use when:
 * - Building web-rwkv `Tensor`s directly from a safetensors checkpoint that may be
 *   raw HuggingFace (adapters stored `(in, out)`) or already converted
 *   (`(out, in)`).
 *
 * Expects:
 * - `data` is the tensor's little-endian f16 bytes (2 bytes/element).
 * - `shape` is the raw row-major safetensors shape.
 * - `numEmb` is the model embedding width (`emb.weight` shape[1]); non-finite
 *   values disable reorientation.
 *
 * Returns:
 * - `{ data, shape }`: the inputs unchanged when no reorientation is needed, or
 *   freshly transposed bytes with the inner two axes swapped.
 */
export function orientAdapterMatrix(
  name: string,
  data: Uint8Array,
  shape: number[],
  numEmb: number,
): { data: Uint8Array, shape: number[] } {
  const axis = loraNumEmbRawAxis(name, shape.length)
  if (axis == null || !Number.isFinite(numEmb) || shape[axis] === numEmb)
    return { data, shape }
  return transposeInnerAxesF16(data, shape)
}

/**
 * Upper bound for the safetensors JSON header length, matching the safetensors
 * reference implementation's 100 MB cap. Real headers are far smaller (KBs–low
 * MBs); a value beyond this means the 8-byte prefix isn't a length at all.
 */
const MAX_HEADER_BYTES = 100_000_000

/**
 * Read and sanity-check the little-endian u64 header length that prefixes a
 * safetensors file.
 *
 * Use when:
 * - You have at least the first 8 bytes and need the JSON header length before
 *   deciding how many more bytes to fetch (the streaming load path), or as the
 *   first step of full-header parsing.
 *
 * Expects:
 * - `head` starts at byte 0 of the file and is at least 8 bytes long.
 *
 * Returns:
 * - The header length in bytes, guaranteed `2 ≤ len ≤ 100 MB`.
 *
 * Throws:
 * - When the prefix is implausible. The common cause is the URL resolving to an
 *   HTML/JSON error or login page whose first 8 bytes (e.g. `"<!doctype"`) parse
 *   as a multi-exabyte u64, rather than a real safetensors file.
 */
export function readSafetensorsHeaderLen(head: Uint8Array): number {
  if (head.byteLength < 8)
    throw new Error('web-rwkv: response too short to contain a safetensors header length')

  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  // Compare as BigInt: an HTML page's first 8 bytes overflow Number's safe range,
  // so bound it before narrowing to avoid a lossy, misleadingly-small length.
  const len = view.getBigUint64(0, true)
  if (len < 2n || len > BigInt(MAX_HEADER_BYTES))
    throw new Error(`web-rwkv: implausible safetensors header length (${len} bytes); the URL likely did not return a safetensors file`)

  return Number(len)
}

/**
 * Parse a safetensors header from a buffer that contains at least the 8-byte
 * length prefix followed by the full JSON header.
 *
 * Expects:
 * - `head` covers bytes `[0, 8 + headerLen)` of the file.
 *
 * Returns:
 * - The tensor map (excluding `__metadata__`) and the data-block start offset.
 */
export function readSafetensorsHeader(head: Uint8Array): SafetensorsHeader {
  const headerLen = readSafetensorsHeaderLen(head)
  if (8 + headerLen > head.byteLength)
    throw new Error(`web-rwkv: safetensors header (${headerLen} bytes) exceeds the provided buffer`)

  const json = new TextDecoder().decode(head.subarray(8, 8 + headerLen))
  const raw = JSON.parse(json) as Record<string, { dtype: string, shape: number[], data_offsets: [number, number] }>

  const tensors: Record<string, SafetensorsTensorInfo> = {}
  for (const [name, info] of Object.entries(raw)) {
    if (name === '__metadata__')
      continue
    tensors[name] = { dtype: info.dtype, shape: info.shape, data_offsets: info.data_offsets }
  }

  return { tensors, dataStart: 8 + headerLen, headerLen }
}

/**
 * Count RWKV layers from tensor names (`blocks.<n>.…`), so quantization flags can
 * target "all layers" without hard-coding a model size.
 */
export function countRwkvLayers(tensors: Record<string, SafetensorsTensorInfo>): number {
  let n = 0
  for (const name of Object.keys(tensors)) {
    const m = /^blocks\.(\d+)\./.exec(name)
    if (m)
      n = Math.max(n, Number(m[1]) + 1)
  }
  return n
}
