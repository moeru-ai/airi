import type {
  DisplayInfo,
  Monitor,
  Point,
  Size,
} from './tauri'

import { useDebounceFn } from '@vueuse/core'
import { computed, nextTick, onUnmounted, readonly, ref, watch } from 'vue'

import { useAppRuntime } from './runtime'
import { useTauriCore } from './tauri'
import { useTauriPointAndWindowFrame } from './tauri-click-through'

export interface WindowPersistenceConfig {
  autoSave?: boolean
  autoRestore?: boolean
  savePeriod?: number // milliseconds
  constrainToDisplays?: boolean
  centerPointConstraint?: boolean // Use center point for boundary checks
  monitorDisplayChanges?: boolean
}

export interface WindowBoundaryConstraints {
  minCenterX: number
  maxCenterX: number
  minCenterY: number
  maxCenterY: number
  recommendedMonitor: Monitor | null
}

/**
 * Enhanced window positioning system with persistence and boundary management
 * Integrates with the existing tauri-click-through system
 */
export function useWindowPersistence(config: WindowPersistenceConfig = {}) {
  const {
    autoSave = true,
    autoRestore = true,
    savePeriod = 10000,
    constrainToDisplays = true,
    centerPointConstraint = true,
    monitorDisplayChanges = true,
  } = config

  const { platform } = useAppRuntime()
  const { invoke } = useTauriCore()
  const { windowFrame } = useTauriPointAndWindowFrame()

  // Debounced save function (declare early to avoid usage before definition)
  const debouncedSave = useDebounceFn(() => savePosition(), savePeriod)

  // Reactive state
  const displayInfo = ref<DisplayInfo>()
  const currentWindowPosition = computed(() => windowFrame.value.origin)
  const currentWindowSize = computed(() => windowFrame.value.size)
  const isPositioning = ref(false)
  const isRestoring = ref(false)

  // State tracking (using Tauri plugins only)
  const isStateRestored = ref<boolean>(false)

  const primaryMonitor = computed(() => displayInfo.value?.primaryMonitor)

  const currentMonitor = computed(() => {
    if (!currentWindowPosition.value || !displayInfo.value)
      return null
    return findMonitorContainingCenterPoint(
      displayInfo.value.monitors,
      getWindowCenterPoint({
        x: currentWindowPosition.value.x,
        y: currentWindowPosition.value.y,
      }, {
        width: currentWindowSize.value.width,
        height: currentWindowSize.value.height,
      }),
    )
  })

  const boundaryConstraints = computed((): WindowBoundaryConstraints | null => {
    if (!displayInfo.value || !currentWindowPosition.value)
      return null

    const allMonitors = displayInfo.value.monitors
    const windowSize = {
      width: currentWindowSize.value.width,
      height: currentWindowSize.value.height,
    }

    return calculateBoundaryConstraints(allMonitors, windowSize, centerPointConstraint)
  })

  const isWindowInValidPosition = computed(() => {
    if (!currentWindowPosition.value || !boundaryConstraints.value)
      return false

    const center = getWindowCenterPoint({
      x: currentWindowPosition.value.x,
      y: currentWindowPosition.value.y,
    }, {
      width: currentWindowSize.value.width,
      height: currentWindowSize.value.height,
    })

    const constraints = boundaryConstraints.value

    return (
      center.x >= constraints.minCenterX
      && center.x <= constraints.maxCenterX
      && center.y >= constraints.minCenterY
      && center.y <= constraints.maxCenterY
    )
  })

  // Initialize the system
  async function initialize() {
    if (platform.value === 'web')
      return

    try {
      // Get initial display information
      refreshDisplayInfo()

      // Set up event listeners
      setupEventListeners()

      // Auto-restore if enabled
      if (autoRestore) {
        restorePosition()
      }

      // Set up display change monitoring
      if (monitorDisplayChanges) {
        setupDisplayMonitoring()
      }

      // Success - using console.warn to comply with linting rules
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to initialize:', error)
    }
  }

  function setupEventListeners() {
    watch(windowFrame, () => {
      if (!isPositioning.value && !isRestoring.value) {
        if (autoSave) {
          debouncedSave()
        }
      }
    }, {
      deep: true,
    })
  }

  function setupDisplayMonitoring() {
    // Monitor for display configuration changes
    // This would typically be handled by the Rust backend emitting display-changed events
    // For now, we'll poll periodically as a fallback
    const monitorInterval = setInterval(async () => {
      try {
        const [monitors, primaryMonitor] = (await invoke('plugin_window_get_display_info'))!

        const newDisplayInfo = {
          monitors,
          primaryMonitor,
        }

        // Check for significant display changes using detailed comparison
        if (displayInfo.value && hasSignificantDisplayChange(displayInfo.value, newDisplayInfo)) {
          handleDisplayChange(newDisplayInfo)
        }
      }
      catch (error) {
        console.error('[WindowPersistence] Failed to monitor display changes:', error)
      }
    }, 10000) // Check every 10 seconds

    onUnmounted(() => {
      clearInterval(monitorInterval)
    })
  }

  async function handleDisplayChange(newDisplayInfo: DisplayInfo) {
    // Display configuration changed

    const oldDisplayInfo = displayInfo.value
    displayInfo.value = newDisplayInfo

    // Check if current window position is still valid
    if (currentWindowPosition.value && constrainToDisplays) {
      await nextTick()

      if (!isWindowInValidPosition.value) {
        console.warn('[WindowPersistence] Window is outside valid area after display change, repositioning...')
        await ensureWindowInBounds()
      }
    }

    // For significant display changes, the plugin will handle state invalidation
    if (oldDisplayInfo && hasSignificantDisplayChange(oldDisplayInfo, newDisplayInfo)) {
      console.warn('[WindowPersistence] Significant display change detected')
    }
  }

  // Core positioning functions
  async function savePosition(): Promise<boolean> {
    if (!currentWindowPosition.value || !displayInfo.value)
      return false

    try {
      console.warn('[WindowPersistence] Saving position:', currentWindowPosition.value, currentWindowSize.value)
      await invoke('plugins_window_persistence_save')

      return true
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to save position:', error)
      return false
    }
  }

  async function restorePosition(): Promise<boolean> {
    if (!displayInfo.value) {
      return false
    }

    try {
      isRestoring.value = true

      // Restore window state using Tauri plugin
      await invoke('plugins_window_persistence_restore')

      // Ensure the restored position is within bounds
      if (constrainToDisplays && currentWindowPosition.value) {
        if (!isWindowInValidPosition.value) {
          console.warn('[WindowPersistence] Restored position is not valid for current displays')
          await centerOnPrimaryMonitor()
          return false
        }
      }

      isStateRestored.value = true
      return true
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to restore position:', error)
      return false
    }
    finally {
      isRestoring.value = false
    }
  }

  async function ensureWindowInBounds(): Promise<boolean> {
    if (!currentWindowPosition.value || !constrainToDisplays)
      return true

    try {
      const constrainedPosition = constrainPositionToBounds({
        x: currentWindowPosition.value.x,
        y: currentWindowPosition.value.y,
      }, {
        width: currentWindowSize.value.width,
        height: currentWindowSize.value.height,
      })

      if (!positionsEqual({
        x: currentWindowPosition.value.x,
        y: currentWindowPosition.value.y,
        width: currentWindowSize.value.width,
        height: currentWindowSize.value.height,
      }, {
        x: constrainedPosition.x,
        y: constrainedPosition.y,
        width: currentWindowSize.value.width,
        height: currentWindowSize.value.height,
      })) {
        await applyPosition(constrainedPosition)
        return true
      }

      return true
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to ensure window bounds:', error)
      return false
    }
  }

  async function applyPosition(pos: Point): Promise<boolean> {
    if (platform.value === 'web')
      return false

    try {
      isPositioning.value = true
      await invoke('plugins_window_set_position', { x: pos.x, y: pos.y })

      if (autoSave) {
        debouncedSave()
      }

      return true
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to apply position:', error)
      return false
    }
    finally {
      isPositioning.value = false
    }
  }

  async function centerOnPrimaryMonitor(): Promise<boolean> {
    if (!primaryMonitor.value || !currentWindowSize.value)
      return false

    const monitor = primaryMonitor.value
    const windowSize = {
      width: currentWindowSize.value.width,
      height: currentWindowSize.value.height,
    }

    const centerPosition: Point = {
      x: monitor.workArea.position.x + (monitor.workArea.size.width - windowSize.width) / 2,
      y: monitor.workArea.position.y + (monitor.workArea.size.height - windowSize.height) / 2,
    }

    return await applyPosition(centerPosition)
  }

  // Utility functions
  function getWindowCenterPoint(pos: Point, size: Size): Point {
    return {
      x: pos.x + size.width / 2,
      y: pos.y + size.height / 2,
    }
  }

  function findMonitorContainingCenterPoint(monitors: Monitor[], center: Point): Monitor | null {
    return monitors.find((monitor) => {
      const workArea = monitor.workArea
      return (
        center.x >= workArea.position.x
        && center.x <= workArea.position.x + workArea.size.width
        && center.y >= workArea.position.y
        && center.y <= workArea.position.y + workArea.size.height
      )
    }) || null
  }

  function calculateBoundaryConstraints(
    monitors: Monitor[],
    windowSize: Size,
    useCenterPoint: boolean,
  ): WindowBoundaryConstraints {
    if (monitors.length === 0) {
      return {
        minCenterX: 0,
        maxCenterX: 0,
        minCenterY: 0,
        maxCenterY: 0,
        recommendedMonitor: null,
      }
    }

    // Calculate the combined bounds of all monitors
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let bestMonitor = monitors[0]

    monitors.forEach((monitor) => {
      const workArea = monitor.workArea
      minX = Math.min(minX, workArea.position.x)
      maxX = Math.max(maxX, workArea.position.x + workArea.size.width)
      minY = Math.min(minY, workArea.position.y)
      maxY = Math.max(maxY, workArea.position.y + workArea.size.height)

      // Use primary monitor from displayInfo instead of is_primary field
      if (displayInfo.value && monitor.name === displayInfo.value.primaryMonitor.name) {
        bestMonitor = monitor
      }
    })

    if (useCenterPoint) {
      // Calculate constraints for center point
      return {
        minCenterX: minX + windowSize.width / 2,
        maxCenterX: maxX - windowSize.width / 2,
        minCenterY: minY + windowSize.height / 2,
        maxCenterY: maxY - windowSize.height / 2,
        recommendedMonitor: bestMonitor,
      }
    }
    else {
      // Calculate constraints for top-left corner
      return {
        minCenterX: minX,
        maxCenterX: maxX - windowSize.width,
        minCenterY: minY,
        maxCenterY: maxY - windowSize.height,
        recommendedMonitor: bestMonitor,
      }
    }
  }

  function constrainPositionToBounds(pos: Point, size: Size): Point {
    if (!boundaryConstraints.value)
      return { x: pos.x, y: pos.y }

    const constraints = boundaryConstraints.value
    const center = getWindowCenterPoint(pos, size)

    // Constrain center point
    const constrainedCenter: Point = {
      x: Math.max(constraints.minCenterX, Math.min(constraints.maxCenterX, center.x)),
      y: Math.max(constraints.minCenterY, Math.min(constraints.maxCenterY, center.y)),
    }

    // Convert back to position
    return {
      x: constrainedCenter.x - size.width / 2,
      y: constrainedCenter.y - size.height / 2,
    }
  }

  function isPositionValidForCurrentDisplays(pos: Point, size: Size): boolean {
    if (!displayInfo.value)
      return false

    const center = getWindowCenterPoint(pos, size)
    return displayInfo.value.monitors.some((monitor) => {
      const workArea = monitor.workArea
      return (
        center.x >= workArea.position.x
        && center.x <= workArea.position.x + workArea.size.width
        && center.y >= workArea.position.y
        && center.y <= workArea.position.y + workArea.size.height
      )
    })
  }

  function hasSignificantDisplayChange(oldInfo: DisplayInfo, newInfo: DisplayInfo): boolean {
    // Check if the number of monitors changed
    if (oldInfo.monitors.length !== newInfo.monitors.length)
      return true

    // Check if primary monitor changed
    if (oldInfo.primaryMonitor.name !== newInfo.primaryMonitor.name)
      return true

    // Check if any monitor resolution/position changed significantly
    for (const oldMonitor of oldInfo.monitors) {
      const newMonitor = newInfo.monitors.find(m => m.name === oldMonitor.name)
      if (!newMonitor)
        return true

      const oldWorkArea = oldMonitor.workArea
      const newWorkArea = newMonitor.workArea

      if (
        Math.abs(oldWorkArea.size.width - newWorkArea.size.width) > 50
        || Math.abs(oldWorkArea.size.height - newWorkArea.size.height) > 50
        || Math.abs(oldWorkArea.position.x - newWorkArea.position.x) > 50
        || Math.abs(oldWorkArea.position.y - newWorkArea.position.y) > 50
      ) {
        return true
      }
    }

    return false
  }

  function positionsEqual(a: (Point & Size), b: (Point & Size)): boolean {
    if (!a || !b)
      return a === b

    return (
      Math.abs(a.x - b.x) < 1
      && Math.abs(a.y - b.y) < 1
      && Math.abs(a.width - b.width) < 1
      && Math.abs(a.height - b.height) < 1
    )
  }

  async function refreshDisplayInfo(): Promise<void> {
    if (platform.value === 'web')
      return

    try {
      const [monitors, primaryMonitor] = (await invoke('plugin_window_get_display_info'))!
      displayInfo.value = {
        monitors,
        primaryMonitor,
      }
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to refresh display info:', error)
    }
  }

  // Manual control functions
  async function manualSave(): Promise<boolean> {
    return await savePosition()
  }

  async function manualRestore(): Promise<boolean> {
    return await restorePosition()
  }

  function clearPersistedState(): void {
    isStateRestored.value = false
    // Plugin will handle clearing persisted state internally
    console.warn('[WindowPersistence] State marked as cleared locally')
  }

  return {
    // State
    displayInfo: readonly(displayInfo),
    currentWindowPosition: readonly(currentWindowPosition),
    windowFrame: readonly(windowFrame),
    isPositioning: readonly(isPositioning),
    isRestoring: readonly(isRestoring),
    isStateRestored: readonly(isStateRestored),

    // Computed
    primaryMonitor,
    currentMonitor,
    boundaryConstraints,
    isWindowInValidPosition,

    // Core functions
    initialize,
    savePosition: manualSave,
    restorePosition: manualRestore,
    ensureWindowInBounds,
    applyPosition,
    centerOnPrimaryMonitor,

    // Utilities
    refreshDisplayInfo,
    clearPersistedState,
    getWindowCenterPoint,

    // Internal utilities (exposed for debugging)
    constrainPositionToBounds,
    isPositionValidForCurrentDisplays,
  }
}
