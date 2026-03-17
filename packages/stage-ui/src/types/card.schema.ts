import { array, boolean, literal, number, object, optional, pipe, record, regex, string, union, unknown } from 'valibot'

/**
 * Message Example Item Schema
 * Validates strings starting with {{user}}: or {{char}}:
 */
export const MessageExampleItemSchema = pipe(
  string('Message example line must be a string'),
  regex(/^\{\{(?:user|char)\}\}: /, 'Message example line must start with "{{user}}:" or "{{char}}:"'),
)

/**
 * Message Example Schema (Array of Message Arrays)
 */
export const MessageExampleSchema = array(
  array(MessageExampleItemSchema, 'Each example turn must be an array of messages'),
  'Message Example must be an array of example turns',
)

/**
 * AIRI Extension Schema parts
 */
const AiriModulesSchema = object({
  consciousness: optional(object({
    provider: string(),
    model: string(),
    moduleConfigs: optional(record(string(), unknown())),
  })),
  speech: optional(object({
    provider: string(),
    model: string(),
    voice_id: string(),
    pitch: optional(number()),
    rate: optional(number()),
    ssml: optional(boolean()),
    language: optional(string()),
  })),
  displayModelId: optional(string()),
  vrm: optional(object({
    source: optional(union([literal('file'), literal('url')])),
    file: optional(string()),
    url: optional(string()),
  })),
  live2d: optional(object({
    source: optional(union([literal('file'), literal('url')])),
    file: optional(string()),
    url: optional(string()),
  })),
})

const AiriHeartbeatSchema = object({
  enabled: boolean(),
  intervalMinutes: number(),
  prompt: string(),
  injectIntoPrompt: boolean(),
  useAsLocalGate: boolean(),
  contextOptions: optional(object({
    windowHistory: boolean(),
    systemLoad: boolean(),
    usageMetrics: boolean(),
  })),
  schedule: object({
    start: string(),
    end: string(),
  }),
})

const AiriExtensionSchema = object({
  modules: optional(AiriModulesSchema),
  heartbeats: optional(AiriHeartbeatSchema),
  acting: optional(object({
    modelExpressionPrompt: string(),
    speechExpressionPrompt: string(),
    speechMannerismPrompt: string(),
  })),
  artistry: optional(object({
    provider: optional(string()),
    model: optional(string()),
    promptPrefix: optional(string()),
    widgetInstruction: optional(string()),
    options: optional(record(string(), unknown())),
  })),
  agents: optional(record(string(), object({
    prompt: string(),
    enabled: optional(boolean()),
  }))),
})

/**
 * Main AIRI Card Schema (V1)
 */
export const AiriCardSchema = object({
  name: string('Card name is required'),
  nickname: optional(string()),
  version: string('Version is required'),
  description: optional(string()),
  notes: optional(string()),
  personality: optional(string()),
  scenario: optional(string()),
  systemPrompt: optional(string()),
  postHistoryInstructions: optional(string()),
  greetings: optional(array(string())),
  messageExample: optional(MessageExampleSchema),
  extensions: optional(record(string(), unknown())),
})
// Exporting for use in the main schema later if needed
export { AiriExtensionSchema }
