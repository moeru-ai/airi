import { electronAPI } from '@electron-toolkit/preload'
import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { createDetector, StageEnvironment } from '@proj-airi/stage-shared'
import { ipcRenderer } from 'electron'

import { beatSyncSignalBeat, beatSyncToggle } from '../shared/eventa'

const context = createContext(electronAPI.ipcRenderer).context
const signalBeat = defineInvoke(context, beatSyncSignalBeat)

const detector = createDetector({
  env: StageEnvironment.Tamagotchi,
  enableLoopbackAudio() {
    return ipcRenderer.invoke('enable-loopback-audio')
  },
  disableLoopbackAudio() {
    return ipcRenderer.invoke('disable-loopback-audio')
  },
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
