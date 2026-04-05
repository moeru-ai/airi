import { envInt, envString } from './common'

export function getGatewayPort(): number {
  return envInt('VISUAL_CHAT_PORT', 6200)
}

export function getLivekitUrl(): string {
  return envString('LIVEKIT_URL', 'ws://localhost:7880')
}

export function getLivekitApiKey(): string {
  return envString('LIVEKIT_API_KEY', 'devkey')
}

export function getLivekitApiSecret(): string {
  return envString('LIVEKIT_API_SECRET', 'secret')
}

export function getWorkerBaseUrl(): string {
  return envString('WORKER_URL', 'http://localhost:6201')
}
