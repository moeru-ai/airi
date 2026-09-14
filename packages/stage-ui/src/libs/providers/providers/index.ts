import { portableProviderDefinitions } from '@proj-airi/provider-inference'

import { registerProviders } from './registry'

import './aliyun-nls'
import './apple-speech'
import './local-audio'
import './kokoro-local'
import './nvidia'

registerProviders(portableProviderDefinitions)

export {
  getDefinedProvider,
  isProviderId,
  listProviders,
} from './registry'

export type { StageProviderId } from './registry'
