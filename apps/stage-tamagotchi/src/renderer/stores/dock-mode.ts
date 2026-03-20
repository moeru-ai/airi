import type { DesktopWindowInfo, DockModeConfig, DockModeStatus, DockPosition } from '@proj-airi/electron-eventa'

import { dockModeStatusChanged } from '@proj-airi/electron-eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { electron } from '../../shared/eventa'

export const useDockModeStore = defineStore('tamagotchi-dock-mode', () => {
  const context = useElectronEventaContext()
  const listWindowsInvoke = useElectronEventaInvoke<DesktopWindowInfo[]>(electron.dockMode.listWindows)
  const startDockInvoke = useElectronEventaInvoke<DockModeStatus, DockModeConfig>(electron.dockMode.start)
  const stopDockInvoke = useElectronEventaInvoke<DockModeStatus>(electron.dockMode.stop)
  const getStatusInvoke = useElectronEventaInvoke<DockModeStatus>(electron.dockMode.getStatus)

  const status = ref<DockModeStatus>({ active: false })
  const availableWindows = ref<DesktopWindowInfo[]>([])
  const isLoadingWindows = ref(false)

  // Persisted settings
  const savedPosition = useLocalStorage<DockPosition>('dock-mode-position', 'right')
  const savedOffsetX = useLocalStorage<number>('dock-mode-offset-x', 0)
  const savedOffsetY = useLocalStorage<number>('dock-mode-offset-y', 0)

  // Listen for status changes from main process
  if (context.value) {
    context.value.on(dockModeStatusChanged, (event) => {
      status.value = event.body!
    })
  }

  watch(context, (ctx: typeof context.value) => {
    if (ctx) {
      ctx.on(dockModeStatusChanged, (event) => {
        status.value = event.body!
      })
    }
  })

  async function refreshWindows() {
    isLoadingWindows.value = true
    try {
      const windows = await listWindowsInvoke()
      if (windows)
        availableWindows.value = windows
    }
    finally {
      isLoadingWindows.value = false
    }
  }

  async function startDock(targetWindowId: string) {
    const config: DockModeConfig = {
      targetWindowId,
      position: savedPosition.value,
      offset: { x: savedOffsetX.value, y: savedOffsetY.value },
    }
    const result = await startDockInvoke(config)
    if (result)
      status.value = result
  }

  async function stopDock() {
    const result = await stopDockInvoke()
    if (result)
      status.value = result
  }

  async function fetchStatus() {
    const result = await getStatusInvoke()
    if (result)
      status.value = result
  }

  return {
    status,
    availableWindows,
    isLoadingWindows,
    savedPosition,
    savedOffsetX,
    savedOffsetY,
    refreshWindows,
    startDock,
    stopDock,
    fetchStatus,
  }
})
