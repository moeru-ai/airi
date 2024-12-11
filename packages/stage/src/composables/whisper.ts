import type { MessageEvents, MessageGenerate, ProgressMessageEvents } from '../libs/workers/types'

export function useWhisper(url: string) {
  const { post: whisperPost, data: whisperData, terminate } = useWebWorker<MessageEvents>(url, { type: 'module' })

  const status = ref<'loading' | 'ready' | null>(null)
  const loadingMessage = ref('')
  const loadingProgress = ref<ProgressMessageEvents[]>([])
  const transcribing = ref(false)
  const tps = ref<number>(0)
  const result = ref('')

  watch(whisperData, (e) => {
    switch (e.status) {
      case 'loading':
        status.value = 'loading'
        loadingMessage.value = e.data
        break

      case 'initiate':
        loadingProgress.value.push(e)
        break

      case 'progress':
        loadingProgress.value = loadingProgress.value.map((item) => {
          if (item.file === e.file) {
            return { ...item, ...e }
          }
          return item
        })
        break

      case 'done':
        loadingProgress.value = loadingProgress.value.filter(item => item.file !== e.file)
        break

      case 'ready':
        status.value = 'ready'
        break

      case 'start':
        transcribing.value = true
        break

      case 'update':
        tps.value = e.tps
        break

      case 'complete':
        transcribing.value = false
        result.value = e.output[0] || ''
        // eslint-disable-next-line no-console
        console.debug('Whisper result:', result.value)
        break
    }
  })

  onUnmounted(() => {
    terminate()
  })

  return {
    transcribe: (message: MessageGenerate) => whisperPost(message),
    status,
    loadingMessage,
    loadingProgress,
    transcribing,
    tps,
    result,
  }
}
