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

const finiteNumber = v.pipe(v.number(), v.finite())

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

export const moduleSettingsSchema = v.strictObject({
  format: v.literal('airi-module-settings'),
  version: v.literal(1),
  data: v.strictObject(moduleSettingsSchemas),
})
