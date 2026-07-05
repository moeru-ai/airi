import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'
import type { ComputedRef, ShallowRef } from 'vue'

import { renderSVG } from 'uqr'
import { computed, shallowRef } from 'vue'

const QR_SVG_DATA_URL_PREFIX = 'data:image/svg+xml;utf8,'
const DEFAULT_QR_ERROR_MESSAGE = 'Channel server QR payload is unavailable.'

function hasCandidateUrl(payload: ServerChannelQrPayload | null | undefined): payload is ServerChannelQrPayload {
  return Boolean(payload?.urls?.length)
}

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return DEFAULT_QR_ERROR_MESSAGE
}

export function serverChannelQrPayloadText(payload: ServerChannelQrPayload | null | undefined): string {
  if (!hasCandidateUrl(payload)) return ''
  return JSON.stringify(payload)
}

export function serverChannelQrSvgDataUrl(payload: ServerChannelQrPayload | null | undefined): string {
  const payloadText = serverChannelQrPayloadText(payload)
  if (!payloadText) return ''

  const svg = renderSVG(payloadText, {
    border: 2,
    ecc: 'M',
    pixelSize: 8,
    whiteColor: '#FFFFFF',
    blackColor: '#121212',
  })

  return `${QR_SVG_DATA_URL_PREFIX}${encodeURIComponent(svg)}`
}

export interface ServerChannelQrPayloadController {
  loading: ShallowRef<boolean>
  payload: ShallowRef<ServerChannelQrPayload | undefined>
  errorMessage: ShallowRef<string>
  candidateUrls: ComputedRef<string[]>
  payloadText: ComputedRef<string>
  qrCodeSource: ComputedRef<string>
  refreshPayload: () => Promise<void>
}

export function createServerChannelQrPayloadController(
  loadPayload: () => Promise<ServerChannelQrPayload>,
): ServerChannelQrPayloadController {
  const loading = shallowRef(false)
  const payload = shallowRef<ServerChannelQrPayload>()
  const errorMessage = shallowRef('')

  const candidateUrls = computed(() => payload.value?.urls ?? [])
  const payloadText = computed(() => serverChannelQrPayloadText(payload.value))
  const qrCodeSource = computed(() => serverChannelQrSvgDataUrl(payload.value))

  async function refreshPayload() {
    if (loading.value) return

    loading.value = true
    errorMessage.value = ''

    try {
      payload.value = await loadPayload()
    } catch (error) {
      payload.value = undefined
      errorMessage.value = messageFromError(error)
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    payload,
    errorMessage,
    candidateUrls,
    payloadText,
    qrCodeSource,
    refreshPayload,
  }
}
