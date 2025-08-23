import { ref } from 'vue'
import { useAudioContext } from '../../stores/audio'

export function useLive2DLipSync(audioNode: AudioNode) {
  const { audioContext } = useAudioContext()
  const mouthOpenSize = ref(0)
  const analyser = ref<AnalyserNode | null>(null)
  const dataArray = ref<Uint8Array | null>(null)
  const animationId = ref<number | null>(null)

  // Setup audio analyser
  function setupAnalyser() {
    if (!audioContext || !audioNode) {
      console.error('Missing audioContext or audioNode for lip sync')
      return
    }

    console.log('Setting up lip sync analyser', {
      audioContextState: audioContext.state,
      audioNodeType: audioNode.constructor.name,
      audioContextSampleRate: audioContext.sampleRate
    })
    
    analyser.value = audioContext.createAnalyser()
    analyser.value.fftSize = 256
    analyser.value.smoothingTimeConstant = 0.8
    
    const bufferLength = analyser.value.frequencyBinCount
    dataArray.value = new Uint8Array(new ArrayBuffer(bufferLength))
    
    console.log('Analyser configuration:', {
      fftSize: analyser.value.fftSize,
      frequencyBinCount: analyser.value.frequencyBinCount,
      smoothingTimeConstant: analyser.value.smoothingTimeConstant,
      bufferLength
    })
    
    // Connect audio node to analyser only (destination connection handled by Stage.vue)
    audioNode.connect(analyser.value)
    console.log('Audio node connected to analyser for lip sync analysis')
  }

  // Calculate mouth open size based on audio volume
  function updateMouthOpenSize() {
    if (!analyser.value || !dataArray.value) {
      console.warn('Missing analyser or dataArray in updateMouthOpenSize')
      return
    }

    const frequencyData = new Uint8Array(dataArray.value.length)
    analyser.value.getByteFrequencyData(frequencyData)
    
    // Calculate average volume from frequency data
    let sum = 0
    let maxValue = 0
    let nonZeroCount = 0
    for (let i = 0; i < frequencyData.length; i++) {
      sum += frequencyData[i]
      maxValue = Math.max(maxValue, frequencyData[i])
      if (frequencyData[i] > 0) nonZeroCount++
    }
    const average = sum / frequencyData.length
    
    // Normalize to 0-1 range and apply some smoothing
    const normalizedVolume = Math.min(average / 128, 1)
    
    // Apply power curve to make mouth movement more natural
    const poweredVolume = Math.pow(normalizedVolume, 0.5)
    
    // Scale to 0-1 range for Live2D parameter
    const newMouthOpenSize = Math.max(0, Math.min(1, poweredVolume))
    
    // Enhanced logging for debugging - log every frame when audio is detected
    if (average > 0 || nonZeroCount > 0 || Math.abs(newMouthOpenSize - mouthOpenSize.value) > 0.001) {
      console.log('🎤 Live2D Lip sync frame:', {
        timestamp: Date.now(),
        dataArrayLength: dataArray.value.length,
        sum: sum.toFixed(2),
        average: average.toFixed(2),
        maxValue: maxValue.toFixed(2),
        nonZeroCount,
        normalizedVolume: normalizedVolume.toFixed(3),
        poweredVolume: poweredVolume.toFixed(3),
        mouthOpenSize: newMouthOpenSize.toFixed(3),
        previousMouthOpenSize: mouthOpenSize.value.toFixed(3),
        change: (newMouthOpenSize - mouthOpenSize.value).toFixed(3),
        firstFewValues: Array.from(dataArray.value.slice(0, 10))
      })
    }
    
    mouthOpenSize.value = newMouthOpenSize
    
    // Continue animation loop
    animationId.value = requestAnimationFrame(updateMouthOpenSize)
  }

  // Start lip sync analysis
  function start() {
    setupAnalyser()
    if (!analyser.value) {
      console.error('Cannot start lip sync: analyser not initialized')
      return
    }
    
    if (animationId.value) {
      console.log('Lip sync already running, animation ID:', animationId.value)
      return
    }
    
    console.log('Starting Live2D lip sync animation', {
      analyserExists: !!analyser.value,
      dataArrayExists: !!dataArray.value,
      dataArrayLength: dataArray.value?.length,
      audioContextState: audioContext?.state,
      currentMouthOpenSize: mouthOpenSize.value
    })
    updateMouthOpenSize()
  }

  // Stop lip sync analysis
  function stop() {
    if (animationId.value) {
      cancelAnimationFrame(animationId.value)
      animationId.value = null
    }
    mouthOpenSize.value = 0
  }

  return {
    mouthOpenSize,
    start,
    stop
  }
}