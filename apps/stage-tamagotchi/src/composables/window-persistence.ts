import type {
  AiriTamagotchiEvents,
  DisplayInfo,
  Monitor,
  Point,
  Size,
  WindowFrame,
  WindowPosition,
} from './tauri'

import { useDebounceFn, useLocalStorage } from '@vueuse/core'
import { computed, nextTick, onUnmounted, readonly, ref } from 'vue'

import { useAppRuntime } from './runtime'
import { PlacementStrategy, useTauriCore, useTauriEvent, useTauriWindowState } from './tauri'

export interface WindowPersistenceConfig {
  storageKey?: string
  autoSave?: boolean
  autoRestore?: boolean
  savePeriod?: number // milliseconds
  constrainToDisplays?: boolean
  centerPointConstraint?: boolean // Use center point for boundary checks
  scaleAware?: boolean
  monitorDisplayChanges?: boolean
}

export interface PersistedWindowState {
  position: WindowPosition
  timestamp: number
  displaySignature: string // Hash of display configuration
  scaleFactor: number
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
    storageKey = 'airi-window-state',
    autoSave = true,
    autoRestore = true,
    savePeriod = 2000,
    constrainToDisplays = true,
    centerPointConstraint = true,
    scaleAware = true,
    monitorDisplayChanges = true,
  } = config

  const { platform } = useAppRuntime()
  const { listen } = useTauriEvent<AiriTamagotchiEvents>()
  const { invoke } = useTauriCore()
  const { saveWindowState: saveNativeState } = useTauriWindowState()

  // Debounced save function (declare early to avoid usage before definition)
  const debouncedSave = useDebounceFn(async () => {
    await savePosition()
  }, savePeriod)

  // Reactive state
  const displayInfo = ref<DisplayInfo | null>(null)
  const currentWindowPosition = ref<WindowPosition | null>(null)
  const windowFrame = ref<WindowFrame | null>(null)
  const isPositioning = ref(false)
  const isRestoring = ref(false)
  const lastValidPosition = ref<WindowPosition | null>(null)

  // Persistence storage
  const persistedState = useLocalStorage<PersistedWindowState | null>(storageKey, null)

  // Display monitoring
  const displaySignature = computed(() => {
    if (!displayInfo.value)
      return ''
    return generateDisplaySignature(displayInfo.value)
  })

  const primaryMonitor = computed(() =>
    displayInfo.value?.monitors.find(m => m.is_primary) || null,
  )

  const currentMonitor = computed(() => {
    if (!currentWindowPosition.value || !displayInfo.value)
      return null
    return findMonitorContainingCenterPoint(
      displayInfo.value.monitors,
      getWindowCenterPoint(currentWindowPosition.value),
    )
  })

  const boundaryConstraints = computed((): WindowBoundaryConstraints | null => {
    if (!displayInfo.value || !currentWindowPosition.value)
      return null

    const allMonitors = displayInfo.value.monitors
    const windowSize = {
      width: currentWindowPosition.value.width,
      height: currentWindowPosition.value.height,
    }

    return calculateBoundaryConstraints(allMonitors, windowSize, centerPointConstraint)
  })

  const isWindowInValidPosition = computed(() => {
    if (!currentWindowPosition.value || !boundaryConstraints.value)
      return false

    const center = getWindowCenterPoint(currentWindowPosition.value)
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
      await refreshDisplayInfo()

      // Get current window position
      await refreshCurrentPosition()

      // Set up event listeners
      setupEventListeners()

      // Auto-restore if enabled
      if (autoRestore) {
        await restorePosition()
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
    // Listen to window position changes
    listen('tauri-app:window-position-changed', (event) => {
      const newPosition = event.payload as WindowPosition
      currentWindowPosition.value = newPosition

      if (!isPositioning.value && !isRestoring.value) {
        lastValidPosition.value = newPosition
        if (autoSave) {
          debouncedSave()
        }
      }
    })

    // Listen to display changes
    listen('tauri-app:display-changed', (event) => {
      const newDisplayInfo = event.payload as DisplayInfo
      handleDisplayChange(newDisplayInfo)
    })

    // Listen to window frame updates from click-through system
    listen('tauri-app:window-click-through:position-cursor-and-window-frame', (event) => {
      const [, frame] = event.payload
      windowFrame.value = frame

      // Sync window position if it differs
      const framePosition: WindowPosition = {
        x: frame.origin.x,
        y: frame.origin.y,
        width: frame.size.width,
        height: frame.size.height,
      }

      if (!positionsEqual(currentWindowPosition.value, framePosition)) {
        currentWindowPosition.value = framePosition
      }
    })
  }

  function setupDisplayMonitoring() {
    // Monitor for display configuration changes
    // This would typically be handled by the Rust backend emitting display-changed events
    // For now, we'll poll periodically as a fallback
    const monitorInterval = setInterval(async () => {
      try {
        const newDisplayInfo = await invoke('get_display_info') as DisplayInfo
        const newSignature = generateDisplaySignature(newDisplayInfo)

        if (newSignature !== displaySignature.value) {
          handleDisplayChange(newDisplayInfo)
        }
      }
      catch (error) {
        console.error('[WindowPersistence] Failed to monitor display changes:', error)
      }
    }, 5000) // Check every 5 seconds

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

    // Invalidate persisted state if display signature changed significantly
    if (oldDisplayInfo && hasSignificantDisplayChange(oldDisplayInfo, newDisplayInfo)) {
      // Significant display change detected, clearing persisted state
      persistedState.value = null
    }
  }

  // Core positioning functions
  async function savePosition(): Promise<boolean> {
    if (!currentWindowPosition.value || !displayInfo.value)
      return false

    try {
      const state: PersistedWindowState = {
        position: { ...currentWindowPosition.value },
        timestamp: Date.now(),
        displaySignature: displaySignature.value,
        scaleFactor: scaleAware ? (currentMonitor.value?.scale_factor || 1) : 1,
      }

      persistedState.value = state

      // Also save to native window state plugin
      await saveNativeState('size' as any) // TODO: Fix type issue

      // Position saved successfully
      return true
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to save position:', error)
      return false
    }
  }

  async function restorePosition(): Promise<boolean> {
    if (!persistedState.value || !displayInfo.value) {
      // No persisted state to restore
      return false
    }

    try {
      isRestoring.value = true

      const saved = persistedState.value
      const currentDisplaySig = displaySignature.value

      // Check if display configuration is still compatible
      if (saved.displaySignature !== currentDisplaySig) {
        // Display configuration changed, validating saved position

        if (!isPositionValidForCurrentDisplays(saved.position)) {
          console.warn('[WindowPersistence] Saved position is not valid for current displays')
          await centerOnPrimaryMonitor()
          return false
        }
      }

      // Apply scale factor adjustments if needed
      let targetPosition = { ...saved.position }
      if (scaleAware && currentMonitor.value) {
        const currentScale = currentMonitor.value.scale_factor
        const savedScale = saved.scaleFactor

        if (Math.abs(currentScale - savedScale) > 0.1) {
          targetPosition = adjustPositionForScale(targetPosition, savedScale, currentScale)
        }
      }

      // Ensure the restored position is within bounds
      if (constrainToDisplays) {
        targetPosition = constrainPositionToBounds(targetPosition)
      }

      await applyPosition(targetPosition)
      // Position restored successfully
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
      const constrainedPosition = constrainPositionToBounds(currentWindowPosition.value)

      if (!positionsEqual(currentWindowPosition.value, constrainedPosition)) {
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

  async function applyPosition(position: WindowPosition): Promise<boolean> {
    if (platform.value === 'web')
      return false

    try {
      isPositioning.value = true
      await invoke('apply_window_position', { position })

      currentWindowPosition.value = position
      lastValidPosition.value = position

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
    if (!primaryMonitor.value || !currentWindowPosition.value)
      return false

    const monitor = primaryMonitor.value
    const windowSize = {
      width: currentWindowPosition.value.width,
      height: currentWindowPosition.value.height,
    }

    const centerPosition: WindowPosition = {
      x: monitor.work_area.origin.x + (monitor.work_area.size.width - windowSize.width) / 2,
      y: monitor.work_area.origin.y + (monitor.work_area.size.height - windowSize.height) / 2,
      width: windowSize.width,
      height: windowSize.height,
    }

    return await applyPosition(centerPosition)
  }

  // Utility functions
  function getWindowCenterPoint(position: WindowPosition): Point {
    return {
      x: position.x + position.width / 2,
      y: position.y + position.height / 2,
    }
  }

  function findMonitorContainingCenterPoint(monitors: Monitor[], center: Point): Monitor | null {
    return monitors.find((monitor) => {
      const bounds = monitor.bounds
      return (
        center.x >= bounds.origin.x
        && center.x <= bounds.origin.x + bounds.size.width
        && center.y >= bounds.origin.y
        && center.y <= bounds.origin.y + bounds.size.height
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
      const workArea = monitor.work_area
      minX = Math.min(minX, workArea.origin.x)
      maxX = Math.max(maxX, workArea.origin.x + workArea.size.width)
      minY = Math.min(minY, workArea.origin.y)
      maxY = Math.max(maxY, workArea.origin.y + workArea.size.height)

      if (monitor.is_primary) {
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

  function constrainPositionToBounds(position: WindowPosition): WindowPosition {
    if (!boundaryConstraints.value)
      return position

    const constraints = boundaryConstraints.value
    const center = getWindowCenterPoint(position)

    // Constrain center point
    const constrainedCenter: Point = {
      x: Math.max(constraints.minCenterX, Math.min(constraints.maxCenterX, center.x)),
      y: Math.max(constraints.minCenterY, Math.min(constraints.maxCenterY, center.y)),
    }

    // Convert back to position
    return {
      x: constrainedCenter.x - position.width / 2,
      y: constrainedCenter.y - position.height / 2,
      width: position.width,
      height: position.height,
    }
  }

  function adjustPositionForScale(
    position: WindowPosition,
    oldScale: number,
    newScale: number,
  ): WindowPosition {
    const scaleFactor = newScale / oldScale

    return {
      x: position.x * scaleFactor,
      y: position.y * scaleFactor,
      width: position.width * scaleFactor,
      height: position.height * scaleFactor,
    }
  }

  function isPositionValidForCurrentDisplays(position: WindowPosition): boolean {
    if (!displayInfo.value)
      return false

    const center = getWindowCenterPoint(position)
    return displayInfo.value.monitors.some((monitor) => {
      const bounds = monitor.bounds
      return (
        center.x >= bounds.origin.x
        && center.x <= bounds.origin.x + bounds.size.width
        && center.y >= bounds.origin.y
        && center.y <= bounds.origin.y + bounds.size.height
      )
    })
  }

  function generateDisplaySignature(displayInfo: DisplayInfo): string {
    // Create a signature based on monitor configuration
    const signature = displayInfo.monitors
      .map(m => `${m.id}:${m.bounds.size.width}x${m.bounds.size.height}@${m.bounds.origin.x},${m.bounds.origin.y}`)
      .sort()
      .join('|')

    return signature
  }

  function hasSignificantDisplayChange(oldInfo: DisplayInfo, newInfo: DisplayInfo): boolean {
    // Check if the number of monitors changed
    if (oldInfo.monitors.length !== newInfo.monitors.length)
      return true

    // Check if primary monitor changed
    if (oldInfo.primary_monitor_id !== newInfo.primary_monitor_id)
      return true

    // Check if any monitor resolution/position changed significantly
    for (const oldMonitor of oldInfo.monitors) {
      const newMonitor = newInfo.monitors.find(m => m.id === oldMonitor.id)
      if (!newMonitor)
        return true

      const oldBounds = oldMonitor.bounds
      const newBounds = newMonitor.bounds

      if (
        Math.abs(oldBounds.size.width - newBounds.size.width) > 50
        || Math.abs(oldBounds.size.height - newBounds.size.height) > 50
        || Math.abs(oldBounds.origin.x - newBounds.origin.x) > 50
        || Math.abs(oldBounds.origin.y - newBounds.origin.y) > 50
      ) {
        return true
      }
    }

    return false
  }

  function positionsEqual(a: WindowPosition | null, b: WindowPosition | null): boolean {
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
      displayInfo.value = await invoke('get_display_info') as DisplayInfo
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to refresh display info:', error)
    }
  }

  async function refreshCurrentPosition(): Promise<void> {
    if (platform.value === 'web')
      return

    try {
      currentWindowPosition.value = await invoke('get_current_window_info') as WindowPosition
    }
    catch (error) {
      console.error('[WindowPersistence] Failed to refresh current position:', error)
    }
  }

  // Remove duplicate debouncedSave declaration since it's defined earlier

  // Manual control functions
  async function manualSave(): Promise<boolean> {
    return await savePosition()
  }

  async function manualRestore(): Promise<boolean> {
    return await restorePosition()
  }

  function clearPersistedState(): void {
    persistedState.value = null
    // Persisted state cleared
  }

  // Cleanup
  onUnmounted(() => {
    // Any cleanup if needed
  })

  return {
    // State
    displayInfo: readonly(displayInfo),
    currentWindowPosition: readonly(currentWindowPosition),
    windowFrame: readonly(windowFrame),
    isPositioning: readonly(isPositioning),
    isRestoring: readonly(isRestoring),
    persistedState: readonly(persistedState),

    // Computed
    primaryMonitor,
    currentMonitor,
    boundaryConstraints,
    isWindowInValidPosition,
    displaySignature,

    // Core functions
    initialize,
    savePosition: manualSave,
    restorePosition: manualRestore,
    ensureWindowInBounds,
    applyPosition,
    centerOnPrimaryMonitor,

    // Utilities
    refreshDisplayInfo,
    refreshCurrentPosition,
    clearPersistedState,
    getWindowCenterPoint,

    // Internal utilities (exposed for debugging)
    constrainPositionToBounds,
    isPositionValidForCurrentDisplays,
  }
}

export { PlacementStrategy }
