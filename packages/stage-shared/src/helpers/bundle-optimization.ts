import type { AsyncComponentLoader, Component } from 'vue'

export function createLazyComponent<T extends Component = Component>(
  loader: AsyncComponentLoader<T>,
  options: {
    errorComponent?: Component
    loadingComponent?: Component
    delay?: number
    timeout?: number
  } = {}
) {
  return {
    component: loader,
    errorComponent: options.errorComponent,
    loadingComponent: options.loadingComponent,
    delay: options.delay || 200,
    timeout: options.timeout || 30000,
  }
}

/**
 * Async component loader with retry mechanism
 */
export async function lazyLoadWithRetry<T extends Component = Component>(
  loader: AsyncComponentLoader<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await loader()
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error
      }
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
    }
  }
  throw new Error('Failed to load component after retries')
}

/**
 * Preloads components that are likely to be needed soon
 */
export function preloadComponents(components: Array<AsyncComponentLoader<any>>) {
  return Promise.all(
    components.map(async (loader) => {
      try {
        return await loader()
      } catch (error) {
        console.warn('Preload failed for component:', error)
        return null
      }
    })
  )
}

/**
 * Detects if user prefers reduced data usage
 */
export function prefersReducedData(): boolean {
  return (navigator as any).connection?.saveData || false
}

/**
 * Conditionally loads heavy components based on device capabilities
 */
export function createConditionalComponent<T extends Component = Component>(
  heavyLoader: AsyncComponentLoader<T>,
  lightLoader?: AsyncComponentLoader<T>
) {
  return () => {
    // If user prefers reduced data or has slow connection, load lighter version
    if (prefersReducedData() || (navigator as any).connection?.effectiveType === 'slow-2g') {
      return lightLoader ? lightLoader() : heavyLoader()
    }
    return heavyLoader()
  }
}