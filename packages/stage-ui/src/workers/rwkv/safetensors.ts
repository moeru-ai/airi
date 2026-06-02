/**
 * Pure `safetensors` parsing + quantization planning for web-rwkv.
 *
 * web-rwkv consumes f16 `safetensors` via a `TensorReader`, and quantizes by
 * layer count from layer 0 at `Session.from_reader` time. Both of those need
 * facts that live in the file header (the tensor table) and the catalog (the
 * quantization intent) — neither needs the GPU or the wasm runtime. Keeping
 * that logic here, free of any `@cryscan/web-rwkv-wasm` import, makes it unit
 * testable and keeps the wasm-touching code in `engine.ts` thin.
 */

import type { RwkvQuantization } from './constants'

/** One tensor entry from a parsed `safetensors` header. */
export interface SafetensorsEntry {
  /** Tensor name, e.g. `blocks.0.att.key.weight`. */
  name: string
  /** Tensor shape (row-major). */
  shape: number[]
  /** Start byte offset of the tensor, relative to the data segment. */
  start: number
  /** End byte offset (exclusive) of the tensor, relative to the data segment. */
  end: number
}

/** Result of parsing a `safetensors` header. */
export interface SafetensorsHeader {
  /** Tensor table, excluding the `__metadata__` pseudo-entry. */
  entries: SafetensorsEntry[]
  /** Absolute byte offset where tensor data begins (`8 + headerLength`). */
  dataStart: number
}

/**
 * Parse the leading header of a `safetensors` buffer.
 *
 * Use when:
 * - You have the raw `.safetensors` bytes and need the tensor table + the
 *   offset where tensor data starts (to slice tensors or count layers).
 *
 * Expects:
 * - `buffer` is a complete `safetensors` file: an 8-byte little-endian u64
 *   header length, then that many bytes of JSON, then the tensor data.
 *
 * Returns:
 * - `entries` in header order (minus `__metadata__`) and the absolute
 *   `dataStart` offset.
 */
export function parseSafetensorsHeader(buffer: ArrayBuffer): SafetensorsHeader {
  const view = new DataView(buffer)
  // safetensors prefixes the file with a little-endian u64 header length.
  const headerLength = Number(view.getBigUint64(0, true))
  const json = new TextDecoder().decode(new Uint8Array(buffer, 8, headerLength))
  const header = JSON.parse(json) as Record<string, { shape: number[], data_offsets: [number, number] }>

  const entries: SafetensorsEntry[] = []
  for (const [name, info] of Object.entries(header)) {
    if (name === '__metadata__')
      continue
    const [start, end] = info.data_offsets
    entries.push({ name, shape: info.shape, start, end })
  }

  return { entries, dataStart: 8 + headerLength }
}

/**
 * Derive the transformer layer count from a checkpoint's tensor names.
 *
 * web-rwkv needs the layer count *up front* to quantize "all layers"
 * (`Session.from_reader` takes layer counts, but `ModelInfo.num_layer` only
 * exists after a `Session` is built — a chicken-and-egg). RWKV checkpoints name
 * every per-layer weight `blocks.{i}.…`, so the count is `max(i) + 1`.
 *
 * Before:
 * - ['emb.weight', 'blocks.0.att.key.weight', 'blocks.1.att.key.weight', 'head.weight']
 *
 * After:
 * - 2
 */
export function deriveNumLayer(tensorNames: Iterable<string>): number {
  let maxIndex = -1
  for (const name of tensorNames) {
    const match = /^blocks\.(\d+)\./.exec(name)
    if (!match)
      continue
    const index = Number(match[1])
    if (index > maxIndex)
      maxIndex = index
  }
  return maxIndex + 1
}

/**
 * web-rwkv layer counts for `Session.from_reader(reader, quant, quant_nf4, quant_sf4, ty)`.
 *
 * Each field is the number of layers (from layer 0) to quantize with that
 * scheme; the rest stay f16. `0/0/0` is full f16.
 */
export interface QuantLayerCounts {
  /** `quant`: number of `Int8` layers. */
  int8: number
  /** `quant_nf4`: number of `NF4` layers. */
  nf4: number
  /** `quant_sf4`: number of `SF4` layers. */
  sf4: number
}

/**
 * Resolve a catalog quantization *intent* to concrete web-rwkv layer counts.
 *
 * The catalog records `'fp16' | 'int8' | 'nf4'`; web-rwkv wants per-scheme
 * layer counts. We quantize the whole model uniformly, so the chosen scheme
 * gets `numLayer` and the others get `0`.
 *
 * Before:
 * - ('int8', 24)
 *
 * After:
 * - { int8: 24, nf4: 0, sf4: 0 }
 */
export function resolveQuantLayerCounts(quantization: RwkvQuantization, numLayer: number): QuantLayerCounts {
  switch (quantization) {
    case 'int8':
      return { int8: numLayer, nf4: 0, sf4: 0 }
    case 'nf4':
      return { int8: 0, nf4: numLayer, sf4: 0 }
    case 'fp16':
      return { int8: 0, nf4: 0, sf4: 0 }
  }
}
