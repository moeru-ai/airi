export const DEFAULT_VAD_MODEL_BASE_URL = '/models/silero-vad'

export function getVadModelBaseUrl() {
  const configured = import.meta.env?.VITE_VAD_MODEL_BASE_URL
  if (typeof configured !== 'string')
    return DEFAULT_VAD_MODEL_BASE_URL
  const trimmed = configured.trim()
  if (!trimmed)
    return DEFAULT_VAD_MODEL_BASE_URL
  return trimmed.replace(/\/$/, '')
}
