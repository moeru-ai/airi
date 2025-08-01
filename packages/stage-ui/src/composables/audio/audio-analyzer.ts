import { ref } from 'vue'

export function useAudioAnalyzer() {
  const analyzer = ref<AnalyserNode>()
  const dataArray = ref<Uint8Array<ArrayBuffer>>()
  const animationFrame = ref<number>()

  const onAnalyzerUpdateHooks = ref<Array<(volumeLevel: number) => void | Promise<void>>>([])

  const volumeLevel = ref(0) // 0-100

  const error = ref<string>()

  function onAnalyzerUpdate(callback: (volumeLevel: number) => void | Promise<void>) {
    onAnalyzerUpdateHooks.value.push(callback)
  }

  function start() {
    const analyze = () => {
      if (!analyzer.value || !dataArray.value)
        return

      // Get frequency data for volume visualization
      analyzer.value.getByteFrequencyData(dataArray.value)

      // Calculate RMS volume level
      let sum = 0
      for (let i = 0; i < dataArray.value.length; i++) {
        sum += dataArray.value[i] * dataArray.value[i]
      }
      const rms = Math.sqrt(sum / dataArray.value.length)
      volumeLevel.value = Math.min(100, (rms / 255) * 100 * 3) // Amplify for better visualization

      for (const hook of onAnalyzerUpdateHooks.value) {
        hook(volumeLevel.value)
      }

      animationFrame.value = requestAnimationFrame(analyze)
    }

    analyze()
  }

  function startAnalyzer(audioContext: AudioContext) {
    if (!audioContext) {
      throw new Error('AudioContext is not initialized')
    }

    try {
    // Create analyser for volume detection
      analyzer.value = audioContext.createAnalyser()
      analyzer.value.fftSize = 256
      analyzer.value.smoothingTimeConstant = 0.3

      // Set up data array for analysis
      const bufferLength = analyzer.value.frequencyBinCount
      dataArray.value = new Uint8Array(bufferLength)

      // Start audio analysis loop
      start()

      return analyzer.value
    }
    catch (err) {
      console.error('Error setting up audio monitoring:', err)
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  function stopAnalyzer() {
  // Stop animation frame
    if (animationFrame.value) {
      cancelAnimationFrame(animationFrame.value)
      animationFrame.value = undefined
    }

    analyzer.value = undefined
    dataArray.value = undefined
  }

  return {
    volumeLevel,

    startAnalyzer,
    stopAnalyzer,
    onAnalyzerUpdate,
  }
}
