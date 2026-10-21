import { shallowRef } from 'vue'

export type DataSettingsStatusTone = 'neutral' | 'success' | 'error'

export interface DataSettingsStatusPayload {
  message: string
  tone: DataSettingsStatusTone
}

export interface DataSettingsStatusEmits {
  status: [payload: DataSettingsStatusPayload]
}

export type DataSettingsStatusEmit = (event: 'status', payload: DataSettingsStatusPayload) => void

export function createDataSettingsStatusHelpers(emit: DataSettingsStatusEmit, errorMessage: string) {
  function emitStatus(message: string, tone: DataSettingsStatusTone = 'success') {
    emit('status', { message, tone })
  }

  function handleActionError(error: unknown, message?: string) {
    console.error(error)
    emitStatus(message ?? errorMessage, 'error')
  }

  return {
    emitStatus,
    handleActionError,
  }
}

export function createDataSettingsStatusState() {
  const statusMessage = shallowRef('')
  const statusTone = shallowRef<DataSettingsStatusTone>('neutral')

  function handleStatus(payload: DataSettingsStatusPayload) {
    statusMessage.value = payload.message
    statusTone.value = payload.tone
  }

  return {
    statusMessage,
    statusTone,
    handleStatus,
  }
}
