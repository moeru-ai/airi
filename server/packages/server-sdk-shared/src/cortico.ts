import * as v from 'valibot'

/**
 * Wire protocol between the AIRI stage (browser) and the Cortico bridge
 * (`@proj-airi/cortico-bridge`). The bridge hosts a Cortico Core + Persona
 * (corti-soulmate) and exposes the stage as a Cortico `World` named `airi`.
 *
 * Client → server frames describe stage input (chat text, hearing, vision).
 * Server → client frames carry persona output: draft reasoning deltas,
 * `airi_speak` utterances, `airi_act` stage directions, and turn boundaries.
 */

export const CorticoHelloSchema = v.object({
  type: v.literal('hello'),
  /** Display name attached to pushed events; defaults to `user`. */
  name: v.optional(v.string()),
})

export const CorticoMessageSchema = v.object({
  type: v.literal('msg'),
  text: v.pipe(v.string(), v.minLength(1)),
  /** Image attachments as data URLs (`data:<mime>;base64,…`). */
  images: v.optional(v.array(v.string())),
  /** Originating chat session; the persona sees it as a conversation tag. */
  session: v.optional(v.object({
    id: v.pipe(v.string(), v.minLength(1)),
    label: v.pipe(v.string(), v.minLength(1)),
  })),
})

/**
 * Pushes the stage's chat session roster so the persona can address
 * conversations by label, QQ-style. Sent on connect and on roster changes.
 */
export const CorticoSessionsSchema = v.object({
  type: v.literal('sessions'),
  sessions: v.array(v.object({
    id: v.pipe(v.string(), v.minLength(1)),
    label: v.pipe(v.string(), v.minLength(1)),
  })),
})

/**
 * Pushes the stage's active chat provider to the bridge. The bridge generates
 * through this OpenAI-compatible endpoint, so provider management stays in
 * AIRI settings. `null` clears the pushed configuration.
 */
export const CorticoProviderSchema = v.object({
  type: v.literal('provider'),
  config: v.nullable(v.object({
    baseUrl: v.pipe(v.string(), v.minLength(1)),
    apiKey: v.optional(v.string()),
    model: v.pipe(v.string(), v.minLength(1)),
  })),
})

export const CorticoEventSchema = v.object({
  type: v.literal('event'),
  /** Event kind, pushed as `airi.<kind>` (e.g. `hearing`, `vision`). */
  kind: v.pipe(v.string(), v.minLength(1)),
  text: v.pipe(v.string(), v.minLength(1)),
})

/** Asks the bridge for a snapshot of the persona's memory workspace. */
export const CorticoMemoryQuerySchema = v.object({
  type: v.literal('memory_query'),
})

export const CorticoClientFrameSchema = v.union([
  CorticoHelloSchema,
  CorticoMessageSchema,
  CorticoEventSchema,
  CorticoProviderSchema,
  CorticoSessionsSchema,
  CorticoMemoryQuerySchema,
])

export type CorticoClientFrame = v.InferOutput<typeof CorticoClientFrameSchema>

export function parseCorticoClientFrame(frame: unknown): CorticoClientFrame {
  return v.parse(CorticoClientFrameSchema, frame)
}

/** Draft model output streamed before the persona commits to speaking. */
export interface CorticoDeltaFrame {
  type: 'delta'
  text: string
}

/** `airi_speak` tool invocation: text to voice and show as the reply. */
export interface CorticoSpeakFrame {
  type: 'speak'
  text: string
  /** Target chat session the reply belongs to. */
  sessionId?: string
}

/** `airi_act` tool invocation: stage direction (emotion/motion/delay). */
export interface CorticoActFrame {
  type: 'act'
  emotion?: string
  motion?: string
  delay?: number
  /** Target chat session the act belongs to. */
  sessionId?: string
}

/** Model turn finished; the stage may close the current TTS session. */
export interface CorticoTurnEndFrame {
  type: 'turn_end'
}

/** Bridge status or error notice for the UI. */
export interface CorticoSysFrame {
  type: 'sys'
  text: string
}

/** `airi_call` tool invocation: invoke a stage capability (mods call). */
export interface CorticoCallFrame {
  type: 'call'
  name: string
  payload?: unknown
}

/** `airi_name_session` tool invocation: persona named a conversation. */
export interface CorticoNameSessionFrame {
  type: 'name_session'
  sessionId: string
  label: string
}

/** Snapshot of the persona's memory workspace, sent on `memory_query`. */
export interface CorticoMemoryFrame {
  type: 'memory'
  /** Absolute path of the memory workspace on the bridge host. */
  dir: string
  /** Top-level sections with file counts and the newest entries. */
  sections: Array<{
    name: string
    files: number
    /** Newest file names (mtime desc, capped by the bridge). */
    recent: string[]
  }>
  /** Total tracked files across sections. */
  totalFiles: number
}

export type CorticoServerFrame
  = | CorticoDeltaFrame
    | CorticoSpeakFrame
    | CorticoActFrame
    | CorticoTurnEndFrame
    | CorticoSysFrame
    | CorticoCallFrame
    | CorticoNameSessionFrame
    | CorticoMemoryFrame
