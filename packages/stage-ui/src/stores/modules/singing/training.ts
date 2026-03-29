import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * [singing] Store for managing voice training job state.
 */
export const useSingingTrainingStore = defineStore('singing-training', () => {
  const jobId = ref<string | null>(null)
  const status = ref<string>('idle')
  const currentEpoch = ref(0)
  const totalEpochs = ref(0)
  const error = ref<string | null>(null)

  const trainingPct = ref(0)
  const trainingStep = ref(0)
  const trainingStepTotal = ref(0)
  const trainingStepName = ref('')
  const lossG = ref<number | null>(null)
  const lossD = ref<number | null>(null)

  const progress = computed(() => {
    if (trainingPct.value > 0)
      return trainingPct.value
    if (totalEpochs.value === 0)
      return 0
    return Math.round((currentEpoch.value / totalEpochs.value) * 100)
  })

  const isGanTraining = computed(() => trainingStepName.value === 'GAN fine-tuning')
  const isTraining = computed(() => status.value === 'running')

  function reset() {
    jobId.value = null
    status.value = 'idle'
    currentEpoch.value = 0
    totalEpochs.value = 0
    error.value = null
    trainingPct.value = 0
    trainingStep.value = 0
    trainingStepTotal.value = 0
    trainingStepName.value = ''
    lossG.value = null
    lossD.value = null
  }

  return {
    jobId,
    status,
    currentEpoch,
    totalEpochs,
    progress,
    error,
    isTraining,
    isGanTraining,
    trainingPct,
    trainingStep,
    trainingStepTotal,
    trainingStepName,
    lossG,
    lossD,
    reset,
  }
})
