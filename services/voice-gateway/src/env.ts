import process from 'node:process'

function getEnv(key: string, fallback = ''): string {
  return process.env[key] || fallback
}

export const env = {
  // 火山引擎
  get VOLC_APP_ID() { return getEnv('VOLC_APP_ID') },
  get VOLC_ACCESS_KEY() { return getEnv('VOLC_ACCESS_KEY') },
  get VOLC_APP_KEY() { return getEnv('VOLC_APP_KEY') },
  get VOLC_RESOURCE_ID() { return getEnv('VOLC_RESOURCE_ID') },
  get VOLC_SPEAKER() { return getEnv('VOLC_SPEAKER') },
  get VOLC_DIALOG_MODEL() { return getEnv('VOLC_DIALOG_MODEL') },
  // OpenClaw
  get OPENCLAW_TOKEN() { return getEnv('OPENCLAW_TOKEN') },
  get OPENCLAW_GATEWAY_URL() { return getEnv('OPENCLAW_GATEWAY_URL', 'ws://127.0.0.1:18789') },
  get OPENCLAW_SESSION_KEY() { return getEnv('OPENCLAW_SESSION_KEY', 'agent:main:voice:web') },
  // TTS Adapter
  get TTS_ADAPTER_URL() { return getEnv('TTS_ADAPTER_URL', 'https://openspeech.bytedance.com/api/v3/tts/unidirectional') },
  get TTS_SPEAKER() { return getEnv('TTS_SPEAKER', 'zh_female_vv_uranus_bigtts') },
  get TTS_SPEAKER_ID() { return getEnv('TTS_SPEAKER_ID') },
  // Server
  get PORT() { return Number(process.env.PORT) || 8765 },
  // SOUL persona
  get SOUL_MD_PATH() { return getEnv('SOUL_MD_PATH') },
}
