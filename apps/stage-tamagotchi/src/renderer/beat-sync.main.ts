import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { beatSyncRequestSignalBeat, beatSyncToggle, createBeatSyncDetector, StageEnvironment } from '@proj-airi/stage-shared'

const { ipcRenderer } = window.electron

const context = createContext(ipcRenderer).context
const requestSignalBeat = defineInvoke(context, beatSyncRequestSignalBeat)

function enableLoopbackAudio() {
  // electron-audio-loopback currently registers this handler internally
  return ipcRenderer.invoke('enable-loopback-audio')
}

function disableLoopbackAudio() {
  // electron-audio-loopback currently registers this handler internally
  return ipcRenderer.invoke('disable-loopback-audio')
}

const detector = createBeatSyncDetector({
  env: StageEnvironment.Tamagotchi,
  enableLoopbackAudio,
  disableLoopbackAudio,
})

detector.on('beat', e => requestSignalBeat(e))

defineInvokeHandler(context, beatSyncToggle, async (enabled) => {
  if (enabled) {
    detector.startScreenCapture()
  }
  else {
    detector.stop()
  }
})
