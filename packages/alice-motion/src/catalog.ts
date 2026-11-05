import type { InferOutput } from 'valibot'

import type { MotionChannel } from './contracts'

import {
  array,
  boolean,
  check,
  finite,
  integer,
  maxLength,
  maxValue,
  minLength,
  minValue,
  nonEmpty,
  number,
  object,
  optional,
  picklist,
  pipe,
  regex,
  safeParse,
  string,
} from 'valibot'

import { motionChannels } from './contracts'

/**
 * Semantic motion catalog (Plan 01, section 6, "Catálogo semântico").
 *
 * An intent names a semantic action. The catalog says how to play it: which clip or
 * generator, which body channels it owns, how long it lasts, and its priority.
 * The scheduler refuses an action that is not in the catalog.
 */
export const MotionCatalogEntrySchema = pipe(
  object({
    semanticAction: pipe(string(), maxLength(64), regex(/^[a-z][a-z0-9_]*$/, 'semanticAction must be lower snake case')),
    clipId: optional(pipe(string(), nonEmpty(), maxLength(128))),
    generatorId: optional(pipe(string(), nonEmpty(), maxLength(128))),
    channels: pipe(array(picklist(motionChannels)), minLength(1), maxLength(motionChannels.length)),
    durationMs: pipe(number(), integer(), minValue(1), maxValue(60_000)),
    priority: pipe(number(), integer(), minValue(0), maxValue(100)),
    interruptible: boolean(),
    fadeInMs: pipe(number(), integer(), minValue(0), maxValue(10_000)),
    fadeOutMs: pipe(number(), integer(), minValue(0), maxValue(10_000)),
    mode: picklist(['normal', 'additive']),
    maxWeight: pipe(number(), finite(), minValue(0), maxValue(1)),
    /** For people and for the LLM prompt. */
    description: pipe(string(), maxLength(200)),
  }),
  check(entry => (entry.clipId === undefined) !== (entry.generatorId === undefined), 'an entry needs exactly one of clipId and generatorId'),
  check(entry => new Set(entry.channels).size === entry.channels.length, 'channels must not repeat'),
)
export type MotionCatalogEntry = InferOutput<typeof MotionCatalogEntrySchema>

/** Channels of an action that moves the whole body, for example a bow or sitting down. Gaze and face stay free. */
export const fullBodyChannels: MotionChannel[] = ['locomotion', 'posture', 'torso', 'leftArm', 'rightArm', 'hands', 'head']

type EntryInput = Omit<MotionCatalogEntry, 'fadeInMs' | 'fadeOutMs' | 'mode' | 'maxWeight' | 'interruptible'> & Partial<MotionCatalogEntry>

function entry(input: EntryInput): MotionCatalogEntry {
  return { fadeInMs: 250, fadeOutMs: 350, mode: 'normal', maxWeight: 1, interruptible: true, ...input }
}

function procedural(semanticAction: string, generatorId: string, channels: MotionChannel[], durationMs: number, priority: number, description: string) {
  return entry({ semanticAction, generatorId, channels, durationMs, priority, mode: 'additive', maxWeight: 0.6, fadeInMs: 300, fadeOutMs: 400, description })
}

function clip(semanticAction: string, clipId: string, channels: MotionChannel[], durationMs: number, priority: number, description: string) {
  return entry({ semanticAction, clipId, channels, durationMs, priority, description })
}

/**
 * A one-arm gesture owns its arm channel, which includes the hand of that arm, so a gesture
 * in each arm can play together. The `hands` channel means both hands together, for example palms together.
 */
const arm: MotionChannel[] = ['rightArm']
const bothArms: MotionChannel[] = ['leftArm', 'rightArm', 'hands']
const stance: MotionChannel[] = ['locomotion', 'posture', 'torso']

/**
 * Default entries.
 *
 * - Procedural actions are what the director sends on its own: breathing room, glances, nods, speech beats.
 * - Clip actions name the VRM motion library (`packages/stage-ui-three`), the reference actions of Plan 01,
 *   and the gestures and poses that NeoAlice sends today on `cmd/avatar/gesture` and `cmd/avatar/pose`.
 *   A renderer that has no clip for an action skips it and logs the action.
 */
export const defaultMotionCatalogEntries: MotionCatalogEntry[] = [
  procedural('idle_weight_shift', 'procedural/weight_shift', ['posture'], 2600, 10, 'Shift the weight from one leg to the other'),
  procedural('idle_posture_shift', 'procedural/posture_shift', ['torso'], 3200, 10, 'Settle the upper body into a slightly new posture'),
  procedural('idle_glance', 'procedural/glance', ['gaze'], 1200, 10, 'Look at something nearby for a moment'),
  procedural('listen_nod', 'procedural/nod', ['head'], 700, 20, 'Nod once while listening'),
  procedural('listen_head_tilt', 'procedural/head_tilt', ['head'], 2200, 20, 'Tilt the head while listening'),
  procedural('think_glance_away', 'procedural/glance_away', ['gaze', 'head'], 3000, 30, 'Look away while thinking'),
  procedural('speak_beat', 'procedural/speech_beat', arm, 1200, 40, 'A small hand beat that follows the speech'),
  procedural('speak_nod', 'procedural/nod', ['head'], 600, 40, 'A small nod on a stressed word'),
  entry({ semanticAction: 'walk', generatorId: 'procedural/walk', channels: ['locomotion', 'posture'], durationMs: 60_000, priority: 50, description: 'Walk' }),

  clip('greeting', 'greeting', fullBodyChannels, 3000, 60, 'Greet with a polite bowing motion'),
  clip('show_full_body', 'show_full_body', fullBodyChannels, 4000, 60, 'Step back and present the full avatar body'),
  clip('peace_sign', 'peace_sign', arm, 2500, 50, 'Make a peace sign with the fingers'),
  clip('shoot', 'shoot', arm, 2000, 50, 'Point finger forward like shooting'),
  clip('spin', 'spin', fullBodyChannels, 2500, 60, 'Spin around once'),
  clip('model_pose', 'model_pose', fullBodyChannels, 3000, 60, 'Strike a confident model pose'),
  clip('squat', 'squat', fullBodyChannels, 2500, 60, 'Squat down briefly'),
  clip('wave_left', 'wave_left', ['leftArm'], 1600, 50, 'Wave with the left hand'),
  clip('wave_right', 'wave_right', arm, 1600, 50, 'Wave with the right hand'),
  clip('explain_left_hand', 'explain_left_hand', ['torso', 'leftArm'], 1600, 40, 'Explain with an open left hand'),
  entry({ semanticAction: 'sit', clipId: 'sit', channels: fullBodyChannels, durationMs: 5000, priority: 70, interruptible: false, description: 'Sit down' }),

  clip('gesture_handup', 'handup', arm, 3000, 50, 'Raise a hand'),
  clip('gesture_index', 'index', arm, 3000, 50, 'Point with the index finger'),
  clip('gesture_ok', 'ok', arm, 3000, 50, 'Make the OK sign'),
  clip('gesture_thumbup', 'thumbup', arm, 3000, 50, 'Thumbs up'),
  clip('gesture_thumbdown', 'thumbdown', arm, 3000, 50, 'Thumbs down'),
  clip('gesture_side', 'side', arm, 3000, 50, 'Gesture to the side'),
  clip('gesture_shrug', 'shrug', ['torso', ...bothArms], 3000, 50, 'Shrug the shoulders'),
  clip('gesture_namaste', 'namaste', bothArms, 3000, 50, 'Put the palms together'),

  ...['straight', 'side', 'hip', 'turn', 'back', 'wide', 'oneknee', 'kneel', 'bend', 'sitting'].map(pose =>
    clip(`pose_${pose}`, `pose/${pose}`, stance, 10_000, 45, `Body pose "${pose}"`),
  ),
  entry({ semanticAction: 'emoji', generatorId: 'facial/emoji', channels: ['facial'], durationMs: 2000, priority: 30, description: 'Show an emoji face' }),
]

/**
 * Read-only catalog with validated entries.
 *
 * Before: a list of entries, for example `defaultMotionCatalogEntries`.
 * After: `get` and `actions` for the director and the scheduler. A broken or repeated entry throws at construction,
 * because the catalog is configuration, not input from the network.
 */
export class MotionCatalog {
  private readonly entries = new Map<string, MotionCatalogEntry>()
  private readonly actionSet: ReadonlySet<string>

  constructor(entries: readonly MotionCatalogEntry[] = defaultMotionCatalogEntries) {
    for (const candidate of entries) {
      const result = safeParse(MotionCatalogEntrySchema, candidate)
      if (!result.success)
        throw new Error(`Invalid motion catalog entry "${candidate.semanticAction}": ${result.issues[0].message}`)
      if (this.entries.has(result.output.semanticAction))
        throw new Error(`Repeated motion catalog entry "${result.output.semanticAction}"`)
      this.entries.set(result.output.semanticAction, result.output)
    }
    this.actionSet = new Set(this.entries.keys())
  }

  /** The entry of an action, or `undefined` when the catalog does not know it. */
  get(semanticAction: string) {
    return this.entries.get(semanticAction)
  }

  /** All known actions. Pass it as `allowedActions` to `parseMotionIntent`. */
  get actions(): ReadonlySet<string> {
    return this.actionSet
  }

  /** A new catalog with more entries, for example imported VRMA motions. */
  extend(entries: readonly MotionCatalogEntry[]) {
    return new MotionCatalog([...this.entries.values(), ...entries])
  }
}
