export interface AudioManagerType {
  audioContext: AudioContext
  analyser: AnalyserNode
  dataBuffer: Float32Array<ArrayBuffer>
  frameId: number | null
  onVolumeChange?: (volume: number) => void
}

export function createAudioManager(): AudioManagerType {
  const audioContext = new AudioContext()
  const analyser = audioContext.createAnalyser()
  const dataBuffer = new Float32Array(2048)

  // Connect analyser to destination
  analyser.connect(audioContext.destination)

  return {
    audioContext,
    analyser,
    dataBuffer,
    frameId: null,
    onVolumeChange: undefined,
  }
}

function calculateVolume(manager: AudioManagerType): number {
  manager.analyser.getFloatTimeDomainData(manager.dataBuffer)

  // Find peak volume
  let volume = 0.0
  for (let i = 0; i < manager.dataBuffer.length; i++) {
    volume = Math.max(volume, Math.abs(manager.dataBuffer[i]))
  }

  // Apply sigmoid normalization (from pixiv implementation)
  volume = 1 / (1 + Math.exp(-45 * volume + 5))
  return volume < 0.1 ? 0 : volume
}

function updateFrame(manager: AudioManagerType) {
  if (manager.onVolumeChange) {
    manager.onVolumeChange(calculateVolume(manager))
  }
  manager.frameId = requestAnimationFrame(() => updateFrame(manager))
}

export async function playAudio(manager: AudioManagerType, source: ArrayBuffer | string): Promise<void> {
  try {
    const buffer = typeof source === 'string'
      ? await (await fetch(source)).arrayBuffer()
      : source

    const audioBuffer = await manager.audioContext.decodeAudioData(buffer)
    const bufferSource = manager.audioContext.createBufferSource()

    bufferSource.buffer = audioBuffer
    bufferSource.connect(manager.analyser)
    bufferSource.start()

    return new Promise((resolve) => {
      bufferSource.onended = () => resolve()
    })
  }
  catch (error) {
    console.error('Error playing audio:', error)
    throw error
  }
}

export function startVolumeTracking(manager: AudioManagerType, callback: (volume: number) => void) {
  manager.onVolumeChange = callback
  manager.audioContext.resume()
  updateFrame(manager)
}

export function stopVolumeTracking(manager: AudioManagerType) {
  if (manager.frameId) {
    cancelAnimationFrame(manager.frameId)
    manager.frameId = null
  }
  manager.onVolumeChange = undefined
}

export function disposeAudioManager(manager: AudioManagerType) {
  stopVolumeTracking(manager)
  manager.audioContext.close()
}
