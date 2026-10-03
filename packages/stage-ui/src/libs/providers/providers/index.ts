import { portableProviderDefinitions } from '@proj-airi/provider-inference'

import { registerProviders } from './registry'

import './aliyun-nls'
import './apple-speech'
import './local-audio'
import './kokoro-local'
import './nvidia'
import './official'
import './prompt-api'

registerProviders(portableProviderDefinitions)

export {
  OFFICIAL_TRANSCRIPTION_PROVIDER_ID,
} from './official'

export {
  getDefinedProvider,
  isProviderId,
  listProviders,
} from './registry'

export type { StageProviderId } from './registry'
