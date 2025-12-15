// Bundle and lazy loading optimizations
export * from './bundle-optimization'

// Vue rendering performance optimizations
export * from './vue-render-optimization'

// Asset and image optimization
export * from './asset-optimization'

// WebGPU and WebAssembly optimizations
export * from './webgpu-wasm-optimization'

// Database and caching optimizations
export * from './db-cache-optimization'

// Network and API call optimizations
export * from './network-optimization'

export class PerformanceOptimizer {
  private static instance: PerformanceOptimizer

  static getInstance(): PerformanceOptimizer {
    if (!PerformanceOptimizer.instance) {
      PerformanceOptimizer.instance = new PerformanceOptimizer()
    }
    return PerformanceOptimizer.instance
  }

  async initialize(): Promise<void> {
    console.log('Performance optimizations initialized')
  }

  getRecommendations(): string[] {
    const recommendations: string[] = []

    if (typeof window !== 'undefined') {
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency > 4) {
        recommendations.push('High CPU core count detected - optimize for parallel processing')
      }

      if ((navigator as any).connection) {
        recommendations.push('Network connection API available - enable adaptive loading')
      }
    }

    return recommendations
  }
}

// Initialize the performance optimizer when this module is loaded
PerformanceOptimizer.getInstance().initialize().catch(console.error)