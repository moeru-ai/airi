import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { createDetector, StageEnvironment } from '@proj-airi/stage-shared'

import { beatSyncSignalBeat, beatSyncToggle } from '../shared/eventa'

const { ipcRenderer } = window.electron

const context = createContext(ipcRenderer).context
const signalBeat = defineInvoke(context, beatSyncSignalBeat)

function enableLoopbackAudio() {
  // electron-audio-loopback currently registers this handler internally
  return ipcRenderer.invoke('enable-loopback-audio')
}

function disableLoopbackAudio() {
  // electron-audio-loopback currently registers this handler internally
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

detector.startScreenCapture()
