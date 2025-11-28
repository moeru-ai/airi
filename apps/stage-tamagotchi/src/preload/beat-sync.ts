import { electronAPI } from '@electron-toolkit/preload'
import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { createDetector, StageEnvironment } from '@proj-airi/stage-shared'
import { ipcRenderer } from 'electron'

import { beatSyncSignalBeat, beatSyncToggle } from '../shared/eventa'
import { exposeWithCustomAPI } from './shared'

const context = createContext(electronAPI.ipcRenderer).context
const signalBeat = defineInvoke(context, beatSyncSignalBeat)

function enableLoopbackAudio() {
  return ipcRenderer.invoke('enable-loopback-audio')
}

function disableLoopbackAudio() {
  return ipcRenderer.invoke('disable-loopback-audio')
}

const detector = createDetector({
  env: StageEnvironment.Tamagotchi,
  enableLoopbackAudio,
  disableLoopbackAudio,
})

detector.on('beat', () => signalBeat())

defineInvokeHandler(context, beatSyncToggle, async (enabled) => {
  if (enabled) {
    detector.startScreenCapture()
  }
  else {
    detector.stop()
  }
})

exposeWithCustomAPI({
  enableLoopbackAudio,
  disableLoopbackAudio,
  detector,
})
