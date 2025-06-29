import type {
  DisplayInfo,
  Monitor,
  Point,
  Size,
} from './tauri'

import { useThrottleFn, watchThrottled } from '@vueuse/core'
import { computed, readonly, ref } from 'vue'

import { useAppRuntime } from './runtime'
import { useTauriCore } from './tauri'
import { useTauriPointAndWindowFrame } from './tauri-click-through'

export interface WindowPersistenceConfig {
  autoSave?: boolean
  autoRestore?: boolean
  savePeriod?: number // milliseconds
  constrainToDisplays?: boolean
  centerPointConstraint?: boolean // Use center point for boundary checks
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
  } = config

  const { platform } = useAppRuntime()
  const { invoke } = useTauriCore()
  const { windowFrame } = useTauriPointAndWindowFrame()

  // Debounced save function (declare early to avoid usage before definition)
  const throttledSave = useThrottleFn(() => savePosition(), savePeriod)

  // Reactive state
  const displayInfo = ref<DisplayInfo>()
  const currentWindowPosition = computed(() => windowFrame.value.origin)
  const currentWindowSize = computed(() => windowFrame.value.size)
  const isPositioning = ref(false)
  const isRestoring = ref(false)

  // State tracking (using Tauri plugins only)
  const isStateRestored = ref<boolean>(false)

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

  const isWindowOutOfBounds = computed(() => {
    if (!currentWindowPosition.value || !displayInfo.value)
      return false

    // Check if window center is within any monitor's work area
    const center = getWindowCenterPoint(currentWindowPosition.value, currentWindowSize.value)
    const isInAnyMonitor = displayInfo.value.monitors.some((monitor) => {
      const workArea = monitor.workArea
      return (
        center.x >= workArea.position.x
        && center.x <= workArea.position.x + workArea.size.width
        && center.y >= workArea.position.y
        && center.y <= workArea.position.y + workArea.size.height
      )
    })

    return !isInAnyMonitor
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

      // Success - using console.warn to comply with linting rules
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to initialize:', error)
    }
  }

  function setupEventListeners() {
    watchThrottled(windowFrame, () => {
      if (!isPositioning.value && !isRestoring.value && autoSave) {
        throttledSave()
      }
    }, { deep: true, throttle: savePeriod })
  }

  // Core positioning functions
  function savePosition(): boolean {
    if (!currentWindowPosition.value || !displayInfo.value) {
      return false
    }

    try {
      invoke('plugins_window_persistence_save')

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
        if (isWindowOutOfBounds.value) {
          console.warn('[WindowPersistence] Restored position is not valid for current displays')
          await moveToNearestValidPosition()
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
        throttledSave()
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

  async function centerOnNearestMonitor(): Promise<boolean> {
    if (!displayInfo.value || !currentWindowPosition.value || !currentWindowSize.value)
      return false

    // Find the nearest monitor to current window center
    const currentCenter = getWindowCenterPoint(currentWindowPosition.value, currentWindowSize.value)
    let nearestMonitor = displayInfo.value.monitors[0]
    let shortestDistance = Infinity

    displayInfo.value.monitors.forEach((monitor) => {
      const monitorCenter = {
        x: monitor.workArea.position.x + monitor.workArea.size.width / 2,
        y: monitor.workArea.position.y + monitor.workArea.size.height / 2,
      }

      const distance = Math.sqrt(
        (currentCenter.x - monitorCenter.x) ** 2
        + (currentCenter.y - monitorCenter.y) ** 2,
      )

      if (distance < shortestDistance) {
        shortestDistance = distance
        nearestMonitor = monitor
      }
    })

    // Center window on the nearest monitor
    const centerPosition: Point = {
      x: nearestMonitor.workArea.position.x + (nearestMonitor.workArea.size.width - currentWindowSize.value.width) / 2,
      y: nearestMonitor.workArea.position.y + (nearestMonitor.workArea.size.height - currentWindowSize.value.height) / 2,
    }

    return await applyPosition(centerPosition)
  }

  async function moveToNearestValidPosition(): Promise<boolean> {
    if (!displayInfo.value || !currentWindowPosition.value || !currentWindowSize.value)
      return false

    // If window is already in bounds, no need to move
    if (!isWindowOutOfBounds.value)
      return true

    // First try to constrain to nearest valid position
    const constrainedPosition = constrainPositionToBounds(
      currentWindowPosition.value,
      currentWindowSize.value,
    )

    // If constraining worked, apply the position
    if (constrainedPosition.x !== currentWindowPosition.value.x
      || constrainedPosition.y !== currentWindowPosition.value.y) {
      return await applyPosition(constrainedPosition)
    }

    // If constraining didn't work, center on nearest monitor
    return await centerOnNearestMonitor()
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

  return {
    // State
    displayInfo: readonly(displayInfo),

    // Computed properties for external use
    isWindowOutOfBounds,
    currentMonitor,
    boundaryConstraints,

    // Core functions
    initialize,

    // Position correction functions
    moveToNearestValidPosition,
    centerOnNearestMonitor,
    ensureWindowInBounds,
    applyPosition,

    // Utilities
    refreshDisplayInfo,

    // Manual control functions
    manualSave: () => savePosition(),
    manualRestore: () => restorePosition(),
  }
}
