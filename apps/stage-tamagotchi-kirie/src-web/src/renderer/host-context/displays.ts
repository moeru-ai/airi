import type { AiriDesktopDisplayBounds, AiriDesktopDisplaySnapshot } from '../../shared/eventa'
import type { DisplayArea } from '../../shared/utils/electron/display'

import { defineInvoke } from '@moeru/eventa'
import { electron } from '@proj-airi/electron-eventa'
import { shallowRef } from 'vue'

import { airiGetCurrentDisplaySnapshot } from '../../shared/eventa'
import { initializeHostContext } from './owner'

const displays = shallowRef<DisplayArea[]>([])

let refreshStarted = false
let refreshStopped = false
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let reportedRefreshError = false

async function refreshDisplays() {
  if (refreshStopped)
    return

  const host = initializeHostContext()

  try {
    if (host.runtime === 'kirie') {
      const snapshot = await defineInvoke(host.context, airiGetCurrentDisplaySnapshot)({})
      displays.value = [toDisplayArea(snapshot)]
    }
    else {
      displays.value = await defineInvoke(host.context, electron.screen.getAllDisplays)()
    }

    reportedRefreshError = false
  }
  catch (error) {
    if (!reportedRefreshError) {
      console.error('[host-context] Failed to refresh host displays.', error)
      reportedRefreshError = true
    }
  }

  if (!refreshStopped)
    refreshTimer = setTimeout(refreshDisplays, 5000)
}

function toDisplayArea(snapshot: AiriDesktopDisplaySnapshot): DisplayArea {
  return {
    bounds: toCssPixels(snapshot.bounds, snapshot.scale),
    workArea: toCssPixels(snapshot.workArea, snapshot.scale),
  }
}

function toCssPixels(bounds: AiriDesktopDisplayBounds, scale: number) {
  return {
    x: bounds.x / scale,
    y: bounds.y / scale,
    width: bounds.width / scale,
    height: bounds.height / scale,
  }
}

function startDisplayRefresh() {
  if (refreshStarted)
    return

  refreshStarted = true
  refreshStopped = false
  refreshDisplays()
    .catch(error => console.error('[host-context] Host display refresh stopped.', error))
}

function stopDisplayRefresh() {
  refreshStopped = true
  if (refreshTimer)
    clearTimeout(refreshTimer)
  refreshTimer = undefined
}

if (import.meta.hot)
  import.meta.hot.dispose(stopDisplayRefresh)

export function useHostDisplays() {
  startDisplayRefresh()
  return displays
}
