/**
 * Utility functions for optimizing WebGPU and WebAssembly usage
 */

export interface WebGPUContext {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
}

export interface WASMModule {
  // WASM module interface - this would be specific to the actual WASM module
  // For now, we'll use a generic approach
  [key: string]: any
}

export async function initWebGPU(canvas: HTMLCanvasElement): Promise<WebGPUContext> {
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported on this browser.')
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
    forceFallbackAdapter: false,
  })

  if (!adapter) {
    throw new Error('No appropriate GPUAdapter found.')
  }

  const device = await adapter.requestDevice({
    requiredFeatures: ['texture-compression-bc', 'float32-filterable'],
    requiredLimits: {
      maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
    },
  })

  const context = canvas.getContext('webgpu') as GPUCanvasContext
  if (!context) {
    throw new Error('WebGPU context not available.')
  }

  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  })

  return { device, context, format }
}

/**
 * Optimizes WebGPU texture creation
 */
export async function createOptimizedTexture(
  device: GPUDevice,
  width: number,
  height: number,
  usage: GPUTextureUsageFlags,
  format: GPUTextureFormat = 'rgba8unorm'
): Promise<GPUTexture> {
  const texture = device.createTexture({
    size: { width, height },
    format,
    usage,
    // Use appropriate sample count for performance
    sampleCount: 1, // Use 1 for most textures to avoid multisample overhead
  })

  return texture
}

/**
 * Creates efficient compute pipeline
 */
export async function createComputePipeline(
  device: GPUDevice,
  code: string,
  entryPoint = 'main'
): Promise<GPUComputePipeline> {
  const shaderModule = device.createShaderModule({
    code,
  })

  return device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shaderModule,
      entryPoint,
    },
  })
}

/**
 * Implements WebGPU buffer pooling for optimal memory usage
 */
export class WebGPUBufferPool {
  private pool: GPUBuffer[] = []
  private device: GPUDevice
  private readonly maxSize: number

  constructor(device: GPUDevice, maxSize = 100) {
    this.device = device
    this.maxSize = maxSize
  }

  acquire(size: number, usage: GPUBufferUsageFlags, options: GPUBufferDescriptor = {}): GPUBuffer {
    // Look for an available buffer of the right size
    const index = this.pool.findIndex(buffer => 
      buffer.size === size && (buffer.usage & usage) === usage
    )

    if (index !== -1) {
      const buffer = this.pool[index]
      this.pool.splice(index, 1)
      return buffer
    }

    // Create new buffer if none available
    return this.device.createBuffer({
      size,
      usage,
      ...options,
    })
  }

  release(buffer: GPUBuffer): void {
    if (this.pool.length >= this.maxSize) {
      // Dispose of the oldest buffer if pool is full
      const oldBuffer = this.pool.shift()
      if (oldBuffer) {
        oldBuffer.destroy()
      }
    }

    this.pool.push(buffer)
  }

  clear(): void {
    this.pool.forEach(buffer => buffer.destroy())
    this.pool = []
  }
}

/**
 * Loads WASM module with caching and optimal settings
 */
export async function loadWASM(
  wasmUrl: string,
  imports?: WebAssembly.Imports,
  shouldCache = true
): Promise<WASMModule> {
  // Check for cached version first
  if (shouldCache && typeof window !== 'undefined' && window.location) {
    const cacheKey = `wasm_cache_${wasmUrl}`
    const cached = sessionStorage.getItem(cacheKey)
    
    if (cached) {
      try {
        const wasmBytes = Uint8Array.from(atob(cached), c => c.charCodeAt(0))
        const result = await WebAssembly.instantiate(wasmBytes, imports || {})
        return result.instance.exports as WASMModule
      } catch (e) {
        console.warn('Failed to load cached WASM module:', e)
      }
    }
  }

  const response = await fetch(wasmUrl)
  const wasmBytes = await response.arrayBuffer()
  
  // Cache the WASM bytes for future use
  if (shouldCache) {
    try {
      const base64Wasm = btoa(String.fromCharCode(...new Uint8Array(wasmBytes)))
      sessionStorage.setItem(`wasm_cache_${wasmUrl}`, base64Wasm)
    } catch (e) {
      console.warn('Failed to cache WASM module:', e)
    }
  }

  const result = await WebAssembly.instantiate(wasmBytes, imports || {})
  return result.instance.exports as WASMModule
}

/**
 * Optimizes WASM memory usage
 */
export class WASMMemoryOptimizer {
  private memory: WebAssembly.Memory
  private readonly initialPages: number
  private readonly maxPages: number

  constructor(memory: WebAssembly.Memory, initialPages = 256, maxPages = 1024) {
    this.memory = memory
    this.initialPages = initialPages
    this.maxPages = maxPages

    // Grow memory incrementally to avoid allocation overhead
    this.growToInitialSize()
  }

  private growToInitialSize(): void {
    const pagesToGrow = this.initialPages - this.memory.buffer.byteLength / (64 * 1024)
    if (pagesToGrow > 0) {
      this.memory.grow(Math.min(pagesToGrow, this.maxPages))
    }
  }

  /**
   * Efficiently allocates memory in WASM
   */
  malloc(size: number): number {
    // In a real implementation, this would call a malloc function in the WASM module
    // For now, we'll provide a conceptual example
    throw new Error('Not implemented: This would call WASM malloc function')
  }

  /**
   * Efficiently deallocates memory in WASM
   */
  free(ptr: number): void {
    // In a real implementation, this would call a free function in the WASM module
    throw new Error('Not implemented: This would call WASM free function')
  }

  /**
   * Checks if there's enough memory available
   */
  hasMemoryAvailable(size: number): boolean {
    return this.memory.buffer.byteLength >= size
  }
}

/**
 * Creates a WebGPU command encoder with optimal settings
 */
export function createOptimizedCommandEncoder(
  device: GPUDevice,
  descriptor?: GPUCommandEncoderDescriptor
): GPUCommandEncoder {
  return device.createCommandEncoder(descriptor)
}

/**
 * Submits WebGPU commands with batching for performance
 */
export class WebGPUCommandBatcher {
  private device: GPUDevice
  private commandEncoders: GPUCommandEncoder[] = []
  private batchSize: number

  constructor(device: GPUDevice, batchSize = 10) {
    this.device = device
    this.batchSize = batchSize
  }

  addCommandEncoder(encoder: GPUCommandEncoder): void {
    this.commandEncoders.push(encoder)

    // Submit batch if we've reached the limit
    if (this.commandEncoders.length >= this.batchSize) {
      this.submitBatch()
    }
  }

  submitBatch(): void {
    if (this.commandEncoders.length === 0) return

    const commandBuffer = this.commandEncoders.map(encoder => encoder.finish())
    this.device.queue.submit(commandBuffer)
    this.commandEncoders = []
  }

  flush(): void {
    this.submitBatch()
  }
}

/**
 * Initializes WebGPU with fallback options for maximum compatibility
 */
export async function initWebGPUWithFallbacks(
  canvas: HTMLCanvasElement,
  options: {
    powerPreference?: GPUPowerPreference
    forceFallbackAdapter?: boolean
  } = {}
): Promise<WebGPUContext | null> {
  try {
    // Try to initialize WebGPU with high-performance settings
    return await initWebGPU(canvas)
  } catch (error) {
    console.warn('Failed to initialize WebGPU with high-performance settings:', error)

    try {
      // Try with low-power settings as fallback
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: options.powerPreference || 'low-power',
        forceFallbackAdapter: options.forceFallbackAdapter || false,
      })

      if (!adapter) {
        throw new Error('No GPU adapter found even with fallback settings.')
      }

      const device = await adapter.requestDevice({
        requiredFeatures: [],
        requiredLimits: {},
      })

      const context = canvas.getContext('webgpu') as GPUCanvasContext
      if (!context) {
        throw new Error('WebGPU context not available.')
      }

      const format = navigator.gpu.getPreferredCanvasFormat()
      context.configure({
        device,
        format,
        alphaMode: 'premultiplied',
      })

      return { device, context, format }
    } catch (fallbackError) {
      console.error('WebGPU not available even with fallback settings:', fallbackError)
      return null
    }
  }
}

/**
 * Utility for WebGPU texture format optimization
 */
export function getOptimalTextureFormat(adapter: GPUAdapter): GPUTextureFormat {
  // Select the best texture format based on adapter capabilities
  const supportedFormats = adapter.features
  if (supportedFormats.has('texture-compression-bc')) {
    return 'bc7-rgba-unorm' // High quality BC7 compression
  } else if (supportedFormats.has('texture-compression-astc')) {
    return 'astc-8x8-unorm' // Good quality ASTC compression
  } else if (supportedFormats.has('texture-compression-etc2')) {
    return 'etc2-rgba8unorm' // ETC2 compression
  }
  return 'rgba8unorm' // Fallback to standard format
}