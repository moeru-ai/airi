import * as v from 'valibot'

import { memoryName } from '../stores/memory'

const memoryEntrySchema = v.strictObject({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  description: v.string(),
  body: v.pipe(v.string(), v.trim(), v.minLength(1)),
  persona: v.optional(v.string()),
  updatedAt: v.number(),
})

export const memoryStateSchema = v.pipe(
  v.strictObject({
    enabled: v.boolean(),
    entries: v.array(memoryEntrySchema),
  }),
  v.check((state) => {
    const seen = new Set<string>()
    return state.entries.every((entry) => {
      const key = `${entry.persona ?? ''}\u0000${entry.name}`
      if (entry.name !== memoryName(entry.name) || seen.has(key))
        return false
      seen.add(key)
      return true
    })
  }),
)

const recipeDecisionActionSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('stay-quiet') }),
  v.strictObject({ kind: v.literal('hint'), text: v.string() }),
  v.strictObject({ kind: v.literal('recipe'), recipeId: v.string() }),
])

const recipeDecisionQuestionSchema = v.union([
  v.strictObject({
    type: v.literal('noul'),
    instructions: v.string(),
    criteria: v.strictObject({ true: v.string(), false: v.string() }),
  }),
  v.strictObject({
    type: v.literal('choice'),
    instructions: v.string(),
    criteria: v.record(v.string(), v.string()),
  }),
])

const recipeSchema = v.strictObject({
  id: v.string(),
  name: v.string(),
  description: v.string(),
  instructions: v.string(),
  decision: v.optional(v.strictObject({
    question: recipeDecisionQuestionSchema,
    actions: v.record(v.string(), recipeDecisionActionSchema),
  })),
  keywords: v.array(v.string()),
  source: v.picklist(['user', 'model']),
  enabled: v.boolean(),
  approved: v.boolean(),
  background: v.optional(v.boolean()),
})

export const recipesStateSchema = v.strictObject({
  recipes: v.array(recipeSchema),
  proposalsEnabled: v.boolean(),
})

export const onboardingStateSchema = v.pipe(
  v.strictObject({
    hasCompletedSetup: v.boolean(),
    hasSkippedSetup: v.boolean(),
  }),
  v.check(state => !state.hasCompletedSetup || !state.hasSkippedSetup),
)

const finiteNumber = v.pipe(v.number(), v.finite())
const coordinates = v.strictObject({ x: finiteNumber, y: finiteNumber })
const moduleSelection = v.strictObject({ provider: v.string(), model: v.string() })
const speechSelection = v.strictObject({
  ...moduleSelection.entries,
  voice_id: v.string(),
  pitch: v.optional(finiteNumber),
  rate: v.optional(finiteNumber),
  ssml: v.optional(v.boolean()),
  language: v.optional(v.string()),
})

export const appSettingsSchemas = {
  onboarding: onboardingStateSchema,
  settings: v.strictObject({
    disableTransitions: v.boolean(),
    usePageSpecificTransitions: v.boolean(),
    language: v.string(),
    streamerMode: v.boolean(),
    analyticsEnabled: v.boolean(),
    websocketSecureEnabled: v.boolean(),
    // An absent selection clears the destination value during restore.
    stageModelRenderer: v.optional(v.picklist(['live2d', 'vrm', 'spine', 'tachie', 'mmd', 'godot', 'disabled']), () => undefined),
    stageViewControlsEnabled: v.boolean(),
    spinePremultipliedAlpha: v.boolean(),
    spineDefaultMixDuration: finiteNumber,
    spineIdleAnimationEnabled: v.boolean(),
    spineMaxFps: finiteNumber,
    spineRenderScale: finiteNumber,
    themeColorsHue: finiteNumber,
    themeColorsHueDynamic: v.boolean(),
    allowVisibleOnAllWorkspaces: v.boolean(),
    alwaysOnTop: v.boolean(),
    controlsIslandIconSize: v.picklist(['auto', 'large', 'small']),
    inspectUpdaterDiagnostics: v.boolean(),
  }),
  audioDevices: v.strictObject({ selectedAudioInput: v.string(), enabled: v.boolean() }),
  live2dParameters: v.strictObject({
    position: coordinates,
    currentMotion: v.strictObject({ group: v.string(), index: v.optional(finiteNumber) }),
    availableMotions: v.array(v.strictObject({ motionName: v.string(), motionIndex: finiteNumber, fileName: v.string() })),
    motionMap: v.record(v.string(), v.string()),
    scale: finiteNumber,
    modelParameters: v.record(v.string(), finiteNumber),
  }),
  live2dSettings: v.strictObject({
    live2dMotionDriver: v.picklist(['magic', 'universal']),
    live2dEyeTracking: v.boolean(),
    live2dModelEyeOffset: coordinates,
    live2dIdleAnimationEnabled: v.boolean(),
    live2dForceIdleEyeAnimation: v.boolean(),
    live2dAutoBlinkEnabled: v.boolean(),
    live2dForceAutoBlinkEnabled: v.boolean(),
    live2dExpressionEnabled: v.boolean(),
    live2dShadowEnabled: v.boolean(),
    live2dMaxFps: finiteNumber,
    live2dRenderScale: finiteNumber,
  }),
  live2dMotionSettings: v.strictObject({ profileId: v.string(), skipMouthOpen: v.boolean(), forceViewTarget: v.boolean() }),
  screenAmbientLight: v.strictObject({
    screenAmbientLightEnabled: v.boolean(),
    screenAmbientLightSource: v.picklist(['screen-capture', 'forced-color']),
    screenAmbientLightForcedColor: v.string(),
    screenAmbientLightMode: v.picklist(['window-gradient', 'global']),
    screenAmbientLightStrength: finiteNumber,
    screenAmbientLightSquint: finiteNumber,
    screenAmbientLightCaptureIntervalMs: finiteNumber,
    screenAmbientLightSampleWidth: finiteNumber,
    screenAmbientLightResponseMs: finiteNumber,
    screenAmbientLightNeutralColorWeight: finiteNumber,
    screenAmbientLightDarkBase: finiteNumber,
    screenAmbientLightBaseCurve: finiteNumber,
    screenAmbientLightLocalShare: finiteNumber,
    screenAmbientLightTint: finiteNumber,
    screenAmbientLightColorBoost: finiteNumber,
    screenAmbientLightWrapIntensity: finiteNumber,
    screenAmbientLightWrapSaturation: finiteNumber,
    screenAmbientLightWrapDiffuse: finiteNumber,
    screenAmbientLightBacklight: finiteNumber,
    screenAmbientLightTranslucentWrap: v.boolean(),
  }),
  modulesConnection: v.strictObject({ serverCmd: v.string(), serverArgs: v.string() }),
  characterCards: v.strictObject({
    cards: v.pipe(v.array(v.tuple([v.string(), v.record(v.string(), v.unknown())])), v.transform(entries => new Map(entries))),
    activeCardId: v.string(),
    moduleDefaults: v.nullable(v.strictObject({ consciousness: moduleSelection, vision: moduleSelection, speech: speechSelection })),
    syncedCardFields: v.record(v.string(), v.record(v.string(), v.unknown())),
    refusedCardIds: v.array(v.string()),
  }),
}

const speechVoiceSchema = v.strictObject({
  id: v.string(),
  name: v.string(),
  provider: v.string(),
  recommendedFor: v.optional(v.array(v.string())),
  compatibleModels: v.optional(v.array(v.string())),
  description: v.optional(v.string()),
  gender: v.optional(v.string()),
  deprecated: v.optional(v.boolean()),
  previewURL: v.optional(v.string()),
  languages: v.array(v.strictObject({ code: v.string(), title: v.string() })),
})

export const moduleSettingsSchemas = {
  memory: memoryStateSchema,
  recipes: recipesStateSchema,
  hearing: v.strictObject({
    activeTranscriptionProvider: v.string(),
    activeTranscriptionModel: v.string(),
    activeCustomModelName: v.string(),
    inputMode: v.picklist(['always-on', 'push-to-talk', 'wake-word']),
    autoSendEnabled: v.boolean(),
    autoSendDelay: finiteNumber,
    confidenceThreshold: finiteNumber,
    rephraseEnabled: v.boolean(),
    endJudgeEnabled: v.boolean(),
    speakerRecognitionEnabled: v.boolean(),
    rephraseProvider: v.string(),
    rephraseModel: v.string(),
  }),
  homeAssistant: v.strictObject({
    enabled: v.boolean(),
    exposureMode: v.picklist(['all', 'allow', 'deny']),
    allowedEntities: v.array(v.string()),
    deniedEntities: v.array(v.string()),
  }),
  speech: v.strictObject({
    activeSpeechProvider: v.string(),
    activeSpeechModel: v.string(),
    // An absent voice clears the destination value during restore.
    activeSpeechVoice: v.optional(speechVoiceSchema, () => undefined),
    activeSpeechVoiceId: v.string(),
    pitch: finiteNumber,
    rate: finiteNumber,
    ssmlEnabled: v.boolean(),
  }),
  consciousness: v.strictObject({
    activeProvider: v.string(),
    activeModel: v.string(),
    customModelName: v.string(),
    temperature: finiteNumber,
    topP: finiteNumber,
  }),
  consciousnessSettings: v.strictObject({ reasoning: v.boolean(), temperatureEnabled: v.boolean(), topPEnabled: v.boolean() }),
  twitter: v.strictObject({ enabled: v.boolean(), apiKey: v.string(), apiSecret: v.string(), accessToken: v.string(), accessTokenSecret: v.string() }),
  webSearch: v.strictObject({ enabled: v.boolean(), apiKey: v.string() }),
  discord: v.strictObject({ enabled: v.boolean(), token: v.string() }),
  factorio: v.strictObject({ enabled: v.boolean(), serverAddress: v.string(), serverPort: v.nullable(finiteNumber), username: v.string() }),
}

export const appSettingsSchema = v.strictObject({
  format: v.literal('airi-app-settings'),
  version: v.literal(1),
  data: v.strictObject(appSettingsSchemas),
})

export const moduleSettingsSchema = v.strictObject({
  format: v.literal('airi-module-settings'),
  version: v.literal(1),
  data: v.strictObject(moduleSettingsSchemas),
})
