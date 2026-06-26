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

const _logger = (..._a: unknown[]) => void 0

const context = createContext()

const changeState = defineInvoke(context, beatSyncStateChangedInvokeEventa)
const signalBeat = defineInvoke(context, beatSyncBeatSignaledInvokeEventa)

const detector = createBeatSyncDetector({
  env: StageEnvironment.Tamagotchi,
})

detector.on('stateChange', (state) => changeState(state))
detector.on('beat', (e) => {
  _logger('[beat]', e) // This could be noisy.
  signalBeat(e)
})

defineInvokeHandler(context, beatSyncToggleInvokeEventa, (enabled) => {
  _logger('[toggle]', enabled)
  if (enabled) {
    detector.startScreenCapture()
  } else {
    detector.stop()
  }
})
defineInvokeHandler(context, beatSyncGetStateInvokeEventa, () => Promise.resolve(detector.state))
defineInvokeHandler(context, beatSyncUpdateParametersInvokeEventa, (params) => {
  _logger('[update-params]', params)
  detector.updateParameters(params)
})
defineInvokeHandler(context, beatSyncGetInputByteFrequencyDataInvokeEventa, () => {
  _logger('[get-input-byte-frequency-data]') // This could be noisy.
  return Promise.resolve(detector.getInputByteFrequencyData())
})
