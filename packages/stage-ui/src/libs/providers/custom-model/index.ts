export {
  buildCustomModelRequestUrl,
  createDefaultCustomModelConnection,
  CUSTOM_MODEL_DEFAULT_PATHS,
  CUSTOM_MODEL_DEFINITION_ID,
  CUSTOM_MODEL_PROTOCOLS,
  CustomModelConfigError,
  defaultCustomModelPaths,
  haveCustomModelRequestFieldsChanged,
  mergeCustomModelHeaders,
  redactCustomModelSecrets,
  resolveCustomModelValidationStatus,
  validateCustomModelConnection,
} from './config'

export type {
  CustomModelAuth,
  CustomModelConfigErrorCode,
  CustomModelConfigValidationResult,
  CustomModelConnectionConfig,
  CustomModelHeaderMergeInput,
  CustomModelHeaderMergeResult,
  CustomModelProtocol,
  CustomModelReference,
  ValidateCustomModelConnectionOptions,
} from './config'

export {
  addCustomModelDraftModel,
  applyDiscoveredCustomModels,
  applyCustomModelProtocolChange,
  createCustomModelEditorDraft,
  customModelBrowserBlockedPresentation,
  customModelConfigErrorFromDraft,
  customModelDiscoveryStatusFromResult,
  customModelDraftFingerprint,
  customModelDraftToConnectionInput,
  customModelModelsFromConfig,
  isCustomModelDefinitionId,
  isCustomModelGenerationCurrent,
  partitionDiscoveredCustomModels,
  presentCustomModelConnectionError,
  previewCustomModelUrls,
  redactCustomModelErrorText,
  resolveCustomModelTestModelId,
  snapshotCustomModelConnection,
  validateCustomModelEditorDraft,
} from './editor'

export type {
  CustomModelConfigFieldError,
  CustomModelDiscoveryPartition,
  CustomModelEditorDraft,
  CustomModelHeaderDraft,
  CustomModelModelDraft,
  CustomModelUrlPreview,
} from './editor'

export {
  createCustomModelRuntimeFromConfig,
  discoverCustomModelModels,
  resolveCustomModelRuntimeConnection,
  validateCustomModelGeneration,
} from './runtime'

export type { CreateCustomModelRuntimeOptions } from './runtime'

export {
  createCustomModelFetchTransport,
  registerCustomModelElectronTransport,
  resetCustomModelElectronTransportForTesting,
  resolveCustomModelTransportPlatform,
} from './transport'

export type {
  CreateCustomModelFetchTransportOptions,
  CustomModelTransportPlatform,
} from './transport'

export {
  BROWSER_REQUEST_BLOCKED_CAUSES,
  createBrowserRequestBlockedDiagnostics,
  listBrowserRequestBlockedCauses,
} from '@proj-airi/core-agent'

export type {
  BrowserRequestBlockedCause,
  BrowserRequestBlockedDiagnostics,
} from '@proj-airi/core-agent'
