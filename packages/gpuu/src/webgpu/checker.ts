export interface WebGPUCheckResult {
  supported: boolean
  fp16Supported: boolean
  isNode: boolean
  reason: string
  adapter?: GPUAdapter
}

export async function check(): Promise<WebGPUCheckResult> {
  try {
    if (isInNodejsRuntime())
      return { supported: false, isNode: true, reason: '', fp16Supported: false }

    if (typeof navigator === 'undefined' || !navigator.gpu)
      return { supported: false, isNode: false, reason: 'WebGPU is not available (navigator.gpu is undefined)', fp16Supported: false }

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter)
      return { supported: false, isNode: false, reason: 'WebGPU is not supported (no adapter found)', fp16Supported: false }

    return { supported: true, isNode: false, reason: '', adapter, fp16Supported: adapter.features.has('shader-f16') }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.toString() : String(error)
    return { supported: false, isNode: false, reason: errorMessage, fp16Supported: false }
  }
}

function isInNodejsRuntime() {
  // eslint-disable-next-line node/prefer-global/process
  return typeof process !== 'undefined'
    // eslint-disable-next-line node/prefer-global/process
    && 'versions' in process && process.versions != null && typeof process.versions === 'object'
    // eslint-disable-next-line node/prefer-global/process
    && 'node' in process.versions && process.versions.node != null
}
