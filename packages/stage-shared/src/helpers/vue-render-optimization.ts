import { defineAsyncComponent, markRaw, shallowRef, triggerRef } from 'vue'

export function createMemoizedComponent<Props>(
  component: (props: Props) => any,
  dependencies: () => any[]
) {
  let lastDeps: any[] | null = null
  let cachedResult: any = null

  return (props: Props) => {
    const currentDeps = dependencies()

    const depsChanged = !lastDeps || lastDeps.length !== currentDeps.length ||
      currentDeps.some((dep, i) => dep !== lastDeps![i])

    if (depsChanged) {
      lastDeps = currentDeps
      cachedResult = component(props)
    }

    return cachedResult
  }
}

/**
 * Creates a virtualized list component for efficient rendering of large lists
 */
export function createVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
}: {
  items: T[]
  itemHeight: number
  containerHeight: number
  renderItem: (item: T, index: number) => any
}) {
  const visibleStart = shallowRef(0)
  const visibleEnd = shallowRef(Math.ceil(containerHeight / itemHeight))

  const updateVisibleRange = (scrollTop: number) => {
    const start = Math.floor(scrollTop / itemHeight)
    const visibleCount = Math.ceil(containerHeight / itemHeight)
    
    visibleStart.value = Math.max(0, start - 5) // Buffer 5 items
    visibleEnd.value = Math.min(items.length, start + visibleCount + 10) // Buffer 10 items
  }

  const visibleItems = () => {
    return items.slice(visibleStart.value, visibleEnd.value).map((item, index) => {
      return renderItem(item, visibleStart.value + index)
    })
  }

  const containerStyle = () => ({
    height: `${items.length * itemHeight}px`,
    position: 'relative',
  })

  const contentStyle = () => ({
    position: 'absolute',
    top: `${visibleStart.value * itemHeight}px`,
  })

  return {
    updateVisibleRange,
    visibleItems,
    containerStyle,
    contentStyle,
    totalItems: items.length,
  }
}

/**
 * Debounces component updates to prevent excessive re-renders
 */
export function createDebouncedUpdater(delay = 16) {
  let timeoutId: number | null = null
  let pendingUpdate: (() => void) | null = null

  const update = (callback: () => void) => {
    pendingUpdate = callback

    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }

    timeoutId = window.setTimeout(() => {
      if (pendingUpdate) {
        pendingUpdate()
        pendingUpdate = null
      }
      timeoutId = null
    }, delay)
  }

  return update
}

/**
 * Creates a stable component instance that doesn't re-render unnecessarily
 */
export function createStableComponent<Props, T extends Record<string, any>>(
  factory: (props: Props) => T
) {
  const cache = new Map<string, T>()
  
  return (props: Props) => {
    // Create a simple hash of props for caching
    const propsHash = JSON.stringify(props, (key, value) => 
      typeof value === 'function' ? value.toString() : value
    )
    
    if (cache.has(propsHash)) {
      return cache.get(propsHash)!
    }
    
    const instance = markRaw(factory(props))
    cache.set(propsHash, instance)
    
    return instance
  }
}

/**
 * Implements shouldComponentUpdate logic for Vue components
 */
export function createOptimizedComponent<Props extends Record<string, any>>(
  render: (props: Props) => any,
  areEqual: (prevProps: Props, nextProps: Props) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)
) {
  let currentProps: Props | null = null
  let cachedVNode: any = null

  return (props: Props) => {
    if (currentProps && areEqual(currentProps, props)) {
      return cachedVNode
    }

    currentProps = { ...props }
    cachedVNode = render(props)
    return cachedVNode
  }
}

/**
 * Provides a reactive state that batches updates for performance
 */
export function createBatchedState<T>(initialValue: T) {
  let value = shallowRef(initialValue)
  let pendingValue: T | null = null
  let batchTimeout: number | null = null

  const update = (newValue: T) => {
    pendingValue = newValue

    if (batchTimeout !== null) {
      clearTimeout(batchTimeout)
    }

    batchTimeout = window.setTimeout(() => {
      if (pendingValue !== null) {
        value.value = pendingValue
        pendingValue = null
        batchTimeout = null
      }
    }, 16) // ~60fps
  }

  return {
    get value() {
      return value.value
    },
    set: update,
    triggerImmediate: () => {
      if (pendingValue !== null) {
        value.value = pendingValue
        pendingValue = null
        if (batchTimeout !== null) {
          clearTimeout(batchTimeout)
          batchTimeout = null
        }
      }
    }
  }
}