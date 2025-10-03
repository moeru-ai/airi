import type { Ref } from 'vue'

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export interface ProgressInfoItem {
  filename: string
  progress: number
  currentSize?: number
  totalSize?: number
}

export interface Component {
  files: Map<string, ProgressInfoItem>
  loading: boolean
}

export interface Module {
  components: Map<string, {
    files: Map<string, ProgressInfoItem>
    loading: boolean
  }>
  loading: boolean
  reason?: string
}

export type Resources = Map<string, Ref<Module>>

function refDelayed<T>(outRef: Ref<T>, delay: number, options?: { immediate?: boolean }) {
  const delayedRef = ref<T>(outRef.value)
  let isFirstRun = true

  watch(outRef, (newVal) => {
    if (isFirstRun && options?.immediate) {
      delayedRef.value = newVal
      isFirstRun = false
      return
    }

    setTimeout(() => {
      delayedRef.value = newVal
    }, delay)
  })

  return delayedRef
}

export const useResourcesStore = defineStore('resources', () => {
  const resources = ref<Resources>(new Map())

  const pendingResources = computed(() => {
    const pending: Resources = new Map()
    for (const [moduleName, module] of resources.value.entries()) {
      if (module.value.loading || Array.from(module.value.components.values()).some(component => component.loading)) {
        pending.set(moduleName, module)
      }
    }

    return pending
  })

  const atLeastOneLoading = computed(() => {
    return Array.from(resources.value.values()).some((moduleInfo) => {
      if (moduleInfo.value.loading) {
        return true
      }

      return Array.from(moduleInfo.value.components.values()).some(componentInfo => componentInfo.loading)
    })
  })

  const atLeastOneLoadingDelay5s = refDelayed(atLeastOneLoading, 5000, { immediate: true })
  const atLeastOneLoadingDelay10s = refDelayed(atLeastOneLoading, 10000, { immediate: true })

  function updateResourceProgress(module: string, component: string, progress: { filename: string, progress: number, currentSize?: number, totalSize?: number }) {
    registerModule(module)
    registerComponent(module, component)

    const moduleRef = moduleOf(module)!
    const componentRef = componentOf(module, component)!

    componentRef.files.set(progress.filename, {
      filename: progress.filename,
      progress: progress.progress,
      currentSize: progress.currentSize,
      totalSize: progress.totalSize,
    })

    componentRef.loading = Array.from(componentRef.files.values()).some(file => file.progress < 100)
    moduleRef.loading = Array.from(moduleRef.components.values()).some(c => c.loading)

    if (progress.progress >= 100) {
      setTimeout(() => {
        componentRef.files.delete(progress.filename)

        if (componentRef.files.size === 0) {
          componentRef.loading = false
          moduleRef.loading = Array.from(moduleRef.components.values()).some(c => c.loading)
        }
      }, 2000)
    }
  }

  function registerModule(module: string) {
    if (!resources.value.has(module)) {
      resources.value.set(module, ref({ components: new Map(), loading: false }))
    }
  }

  function registerComponent(module: string, component: string) {
    if (!resources.value.has(module)) {
      registerModule(module)
    }
    if (!resources.value.get(module)?.value.components.has(component)) {
      resources.value.get(module)?.value.components.set(component, { files: new Map(), loading: false })
    }
  }

  function moduleOf(module: string) {
    return resources.value.get(module)?.value
  }

  function componentOf(module: string, component: string) {
    return resources.value.get(module)?.value.components.get(component)
  }

  function setModuleLoading(module: string, loading: boolean) {
    registerModule(module)

    const m = moduleOf(module)
    if (m) {
      m.loading = loading
    }
  }

  function setComponentLoading(module: string, component: string, loading: boolean, options?: { cascadingForModule?: boolean }) {
    registerModule(module)
    registerComponent(module, component)

    if (options?.cascadingForModule) {
      setModuleLoading(module, loading)
    }

    const c = componentOf(module, component)
    if (c) {
      c.loading = loading
    }
  }

  return {
    resources,
    atLeastOneLoading,
    atLeastOneLoadingDelay5s,
    atLeastOneLoadingDelay10s,
    pendingResources,

    updateResourceProgress,

    moduleOf,
    registerModule,
    setModuleLoading,
    componentOf,
    registerComponent,
    setComponentLoading,
  }
})
