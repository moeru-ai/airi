import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { StageEnvironment } from '@proj-airi/stage-shared'
import { createBeatSyncDetector } from '@proj-airi/stage-shared/beat-sync/browser'

import {
  beatSyncElectronChangeState,
  beatSyncElectronGetInputByteFrequencyData,
  beatSyncElectronGetState,
  beatSyncElectronSignalBeat,
  beatSyncElectronToggle,
  beatSyncElectronUpdateParameters,
} from '../shared/eventa'

const { ipcRenderer } = window.electron

const context = createContext(ipcRenderer).context

// [renderer] beat-sync -> [main] -> [renderer] index
const changeState = defineInvoke(context, beatSyncElectronChangeState)
const signalBeat = defineInvoke(context, beatSyncElectronSignalBeat)

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

defineInvokeHandler(context, beatSyncElectronToggle, async (enabled) => {
  // eslint-disable-next-line no-console
  console.log('[toggle]', enabled)
  if (enabled) {
    detector.startScreenCapture()
  }
  else {
    detector.stop()
  }
})
defineInvokeHandler(context, beatSyncElectronGetState, async () => detector.state)
defineInvokeHandler(context, beatSyncElectronUpdateParameters, async (params) => {
  // eslint-disable-next-line no-console
  console.log('[update-params]', params)
  detector.updateParameters(params)
})
defineInvokeHandler(context, beatSyncElectronGetInputByteFrequencyData, async () => {
  // eslint-disable-next-line no-console
  console.debug('[get-input-byte-frequency-data]') // This could be noisy.
  return detector.getInputByteFrequencyData()
})
