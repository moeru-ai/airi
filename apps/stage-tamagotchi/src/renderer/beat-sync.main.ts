import type { Live2DLipSync } from '@proj-airi/model-driver-lipsync'
import type { Profile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createLive2DLipSync } from '@proj-airi/model-driver-lipsync'
import { wlipsyncProfile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { StageEnvironment } from '@proj-airi/stage-shared'
import {
  beatSyncAudioOutputSignaledInvokeEventa,
  beatSyncBeatSignaledInvokeEventa,
  beatSyncGetInputByteFrequencyDataInvokeEventa,
  beatSyncGetStateInvokeEventa,
  beatSyncSetConsumerInvokeEventa,
  beatSyncStateChangedInvokeEventa,
  beatSyncToggleInvokeEventa,
  beatSyncUpdateLipSyncOptionsInvokeEventa,
  beatSyncUpdateParametersInvokeEventa,
  createBeatSyncDetector,
  createContext,
} from '@proj-airi/stage-shared/beat-sync'

const context = createContext()

const changeState = defineInvoke(context, beatSyncStateChangedInvokeEventa)
const signalBeat = defineInvoke(context, beatSyncBeatSignaledInvokeEventa)
const signalAudioOutput = defineInvoke(context, beatSyncAudioOutputSignaledInvokeEventa)

const detector = createBeatSyncDetector({
  env: StageEnvironment.Tamagotchi,
})
const consumers = new Set<import('@proj-airi/stage-shared/beat-sync').BeatSyncConsumer>()
let lipSync: Live2DLipSync | undefined
let outputFrameId = 0
let mouthGateOpen = false
let outputMouthOpen = 0
let lastMouthOutputMs = 0
let highMouthStartedMs = 0
let highMouthDurationMs = 0
let forcedMouthCloseUntilMs = 0
let inputVolumeThreshold = 0.08
let randomCloseDelayMs = 300
let randomCloseProbability = 1

function randomDuration(minimumMs: number, maximumMs: number) {
  return minimumMs + Math.random() * (maximumMs - minimumMs)
}

function polarizeMouthOpen(value: number) {
  if (value <= 0 || value >= 1)
    return value

  const centered = value * 2 - 1
  return (Math.sign(centered) * Math.abs(centered) ** 0.85 + 1) / 2
}

// NOTICE:
// This deliberate short closure breaks up unnaturally sustained system-audio mouth openings.
// The current analyzer can hold a high value across several spoken words without a visible consonant closure.
// This workaround is local to the system-audio lipsync output and does not change phoneme detection.
// Remove it when the lipsync analyzer provides reliable short-term mouth-closure timing.
function applySustainedMouthClosure(mouthOpen: number, timestamp: number) {
  if (timestamp < forcedMouthCloseUntilMs)
    return 0

  if (mouthOpen < 0.72) {
    highMouthStartedMs = 0
    highMouthDurationMs = 0
    return mouthOpen
  }

  if (highMouthStartedMs === 0) {
    highMouthStartedMs = timestamp
    highMouthDurationMs = randomDuration(randomCloseDelayMs / 2, randomCloseDelayMs)
    return mouthOpen
  }

  if (timestamp - highMouthStartedMs < highMouthDurationMs)
    return mouthOpen

  if (Math.random() > randomCloseProbability) {
    highMouthStartedMs = timestamp
    highMouthDurationMs = randomDuration(randomCloseDelayMs / 2, randomCloseDelayMs)
    return mouthOpen
  }

  forcedMouthCloseUntilMs = timestamp + randomDuration(40, 100)
  highMouthStartedMs = 0
  highMouthDurationMs = 0
  return 0
}

function shapeMouthOpen(rawMouthOpen: number) {
  if (mouthGateOpen) {
    if (rawMouthOpen <= 0.035)
      mouthGateOpen = false
  }
  else if (rawMouthOpen >= 0.08) {
    mouthGateOpen = true
  }

  const normalized = Math.max(0, (rawMouthOpen - 0.035) / (1 - 0.035))
  if (!mouthGateOpen)
    return 0

  return polarizeMouthOpen(Math.min(1, normalized ** 0.72 * 1.65))
}

function smoothMouthClose(target: number, timestamp: number) {
  if (lastMouthOutputMs === 0 || target >= outputMouthOpen) {
    outputMouthOpen = target
    lastMouthOutputMs = timestamp
    return outputMouthOpen
  }

  const alpha = 1 - Math.exp(-(timestamp - lastMouthOutputMs) / 18)
  outputMouthOpen += (target - outputMouthOpen) * alpha
  lastMouthOutputMs = timestamp

  if (outputMouthOpen < 0.01)
    outputMouthOpen = target

  return outputMouthOpen
}

function resetMouthOutput() {
  mouthGateOpen = false
  outputMouthOpen = 0
  lastMouthOutputMs = 0
  highMouthStartedMs = 0
  highMouthDurationMs = 0
  forcedMouthCloseUntilMs = 0
}

function updateAudioOutput() {
  const frequencies = detector.getInputByteFrequencyData()
  const inputLevel = frequencies.length
    ? frequencies.reduce((peak, value) => Math.max(peak, value), 0) / 255
    : 0
  const timestamp = performance.now()
  const rawMouthOpen = inputLevel >= inputVolumeThreshold
    ? lipSync?.getMouthOpen() ?? 0
    : 0
  const mouthOpen = smoothMouthClose(
    applySustainedMouthClosure(
      shapeMouthOpen(rawMouthOpen),
      timestamp,
    ),
    timestamp,
  )
  void signalAudioOutput({ inputLevel, mouthOpen })
  outputFrameId = requestAnimationFrame(updateAudioOutput)
}

async function startCapture() {
  if (detector.state.isActive)
    return

  try {
    await detector.startScreenCapture()
    if (!detector.context || !detector.source)
      throw new Error('System audio input did not provide an audio source')

    lipSync = await createLive2DLipSync(
      detector.context,
      wlipsyncProfile as Profile,
      {
        cap: 1,
        volumeScale: 1.1,
        volumeExponent: 0.6,
        mouthUpdateIntervalMs: 20,
        mouthLerpWindowMs: 0,
      },
    )
    lipSync.connectSource(detector.source)
    updateAudioOutput()
  }
  catch (error) {
    stopCapture()
    throw error
  }
}

function stopCapture() {
  cancelAnimationFrame(outputFrameId)
  outputFrameId = 0
  lipSync?.node.disconnect()
  lipSync = undefined
  resetMouthOutput()
  detector.stop()
  void signalAudioOutput({ inputLevel: 0, mouthOpen: 0 })
}

async function setConsumer(consumer: import('@proj-airi/stage-shared/beat-sync').BeatSyncConsumer, enabled: boolean) {
  if (enabled)
    consumers.add(consumer)
  else
    consumers.delete(consumer)

  if (consumers.size > 0)
    await startCapture()
  else
    stopCapture()
}

detector.on('stateChange', state => changeState(state))
detector.on('beat', (e) => {
  // eslint-disable-next-line no-console
  console.debug('[beat]', e) // This could be noisy.
  signalBeat(e)
})

defineInvokeHandler(context, beatSyncToggleInvokeEventa, async (enabled) => {
  // eslint-disable-next-line no-console
  console.log('[toggle]', enabled)
  await setConsumer('beat-sync', enabled)
})
defineInvokeHandler(context, beatSyncSetConsumerInvokeEventa, async ({ consumer, enabled }) => {
  await setConsumer(consumer, enabled)
})
defineInvokeHandler(context, beatSyncUpdateLipSyncOptionsInvokeEventa, async (options) => {
  inputVolumeThreshold = Math.min(1, Math.max(0, options.inputVolumeThreshold))
  randomCloseDelayMs = Math.min(1000, Math.max(100, options.randomCloseDelayMs))
  randomCloseProbability = Math.min(1, Math.max(0, options.randomCloseProbability))
  highMouthStartedMs = 0
  highMouthDurationMs = 0
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
