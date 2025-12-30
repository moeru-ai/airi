import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { StageEnvironment } from '@proj-airi/stage-shared'
import {
  beatSyncBeatSignaledInvokeEventa,
  beatSyncGetInputByteFrequencyDataInvokeEventa,
  beatSyncGetStateInvokeEventa,
  beatSyncStateChangedInvokeEventa,
  beatSyncToggleInvokeEventa,
  beatSyncUpdateParametersInvokeEventa,
  createBeatSyncDetector,
  createContext,
} from '@proj-airi/stage-shared/beat-sync'

const { ipcRenderer } = window.electron

const context = createContext()

const changeState = defineInvoke(context, beatSyncStateChangedInvokeEventa)
const signalBeat = defineInvoke(context, beatSyncBeatSignaledInvokeEventa)

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

detector.on('stateChange', state => changeState(state))
detector.on('beat', (e) => {
  // eslint-disable-next-line no-console
  console.debug('[beat]', e) // This could be noisy.
  signalBeat(e)
})

defineInvokeHandler(context, beatSyncToggleInvokeEventa, async (enabled) => {
  // eslint-disable-next-line no-console
  console.log('[toggle]', enabled)
  if (enabled) {
    detector.startScreenCapture()
  }
  else {
    detector.stop()
  }
})
defineInvokeHandler(context, beatSyncGetStateInvokeEventa, async () => detector.state)
defineInvokeHandler(context, beatSyncUpdateParametersInvokeEventa, async (params) => {
  // eslint-disable-next-line no-console
  console.log('[update-params]', params)
  detector.updateParameters(params)
})
defineInvokeHandler(context, beatSyncGetInputByteFrequencyDataInvokeEventa, async () => {
  // eslint-disable-next-line no-console
  console.debug('[get-input-byte-frequency-data]') // This could be noisy.
  return detector.getInputByteFrequencyData()
})
