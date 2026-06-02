/**
 * web-rwkv worker entry point.
 *
 * Thin wiring only: resolve the catalog model, hand the engine's
 * load/generate/unload to the transport binding, and let the transport route
 * inbound messages. When PR #1917's `@moeru/eventa` contract lands, swap
 * {@link createMessagePortTransport} for an eventa binding here — the engine
 * and ops below stay exactly as they are.
 *
 * Call stack:
 *
 * (main thread) Worker.postMessage
 *   -> {@link createMessagePortTransport}.serve
 *     -> ops.load    -> {@link RwkvEngine.load}
 *     -> ops.generate-> {@link RwkvEngine.generate}
 *     -> ops.unload  -> {@link RwkvEngine.unload}
 */

import type { RwkvEngine } from './engine'
import type { MessageEndpoint } from './transport'

import { RWKV_MODELS, RWKV_VOCAB_URL } from './constants'
import { createRwkvEngine } from './engine'
import { createMessagePortTransport } from './transport'

const engine: RwkvEngine = createRwkvEngine()

// `globalThis` in a dedicated worker is the `postMessage`/`addEventListener`
// endpoint; the cast narrows it to the minimal surface the transport uses.
const transport = createMessagePortTransport(globalThis as unknown as MessageEndpoint)

transport.serve({
  async load(request, context) {
    const model = RWKV_MODELS.find(entry => entry.id === request.modelId)
    if (!model)
      throw new Error(`Unknown RWKV model: ${request.modelId}`)

    const info = await engine.load(
      { modelUrl: model.modelUrl, vocabUrl: RWKV_VOCAB_URL, quantization: model.quantization },
      { signal: context.signal, onProgress: context.emit },
    )

    return { modelId: model.id, quantization: model.quantization, info }
  },

  generate(request, context) {
    return engine.generate(request, { signal: context.signal, onToken: context.emit })
  },

  unload() {
    return engine.unload()
  },
})
