import type { ProviderConfiguration } from '../configurations/provider'

/** Credentials and Provider selection for Aliyun NLS transcription. */
export interface AliyunNlsAsrOptions {
  accessKeyId: string
  accessKeySecret: string
  appKey: string
  provider: string
}

/** Creates an Aliyun NLS realtime ASR Provider configuration. */
export function aliyunNlsAsr(options: AliyunNlsAsrOptions): ProviderConfiguration {
  if (options.provider !== 'aliyun-nls-transcription')
    throw new Error('The Aliyun NLS Provider must be "aliyun-nls-transcription".')

  return {
    id: options.provider,
    definitionId: options.provider,
    model: 'aliyun-nls-v1',
    config: {
      accessKeyId: options.accessKeyId,
      accessKeySecret: options.accessKeySecret,
      appKey: options.appKey,
    },
  }
}
