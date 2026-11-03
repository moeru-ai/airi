/**
 * Projection of mood names between the three vocabularies that Alice uses.
 *
 * - NeoAlice mood system: the producer of the mood. Seen values: `happy`, `playful`,
 *   `excited`, `sad`, `annoyed`, `angry`, `tired`, `sleep`, `calm`, `neutral`.
 * - TalkingHead renderer: `neutral`, `happy`, `angry`, `sad`, `fear`, `disgust`, `love`, `sleep`.
 * - AIRI emotions (`packages/stage-ui/src/constants/emotions.ts`): `happy`, `sad`, `angry`,
 *   `think`, `surprised`, `awkward`, `question`, `curious`, `neutral`.
 *
 * Consumers read `talkingheadMood` and `airiEmotion` from the published state.
 * They do not keep their own tables.
 */
const vocabulary = new Map<string, { talkinghead: string, airi: string }>(Object.entries({
  happy: { talkinghead: 'happy', airi: 'happy' },
  playful: { talkinghead: 'happy', airi: 'happy' },
  excited: { talkinghead: 'happy', airi: 'happy' },
  sad: { talkinghead: 'sad', airi: 'sad' },
  annoyed: { talkinghead: 'angry', airi: 'angry' },
  angry: { talkinghead: 'angry', airi: 'angry' },
  tired: { talkinghead: 'sleep', airi: 'neutral' },
  sleep: { talkinghead: 'sleep', airi: 'neutral' },
  calm: { talkinghead: 'neutral', airi: 'neutral' },
  neutral: { talkinghead: 'neutral', airi: 'neutral' },
  // NOTICE: AIRI has no `love`, `fear`, or `disgust` emotion. The nearest AIRI emotion keeps
  // the expression readable. TalkingHead keeps the full mood.
  love: { talkinghead: 'love', airi: 'happy' },
  fear: { talkinghead: 'fear', airi: 'surprised' },
  disgust: { talkinghead: 'disgust', airi: 'awkward' },
  // NOTICE: TalkingHead has no mood for these AIRI emotions. Its body stays neutral.
  curious: { talkinghead: 'neutral', airi: 'curious' },
  think: { talkinghead: 'neutral', airi: 'think' },
  thinking: { talkinghead: 'neutral', airi: 'think' },
  surprised: { talkinghead: 'neutral', airi: 'surprised' },
  surprise: { talkinghead: 'neutral', airi: 'surprised' },
  awkward: { talkinghead: 'neutral', airi: 'awkward' },
  question: { talkinghead: 'neutral', airi: 'question' },
}))

export interface ResolvedMood {
  primary: string
  known: boolean
  talkingheadMood: string
  airiEmotion: string
}

/**
 * Normalizes a raw mood name and projects it to the renderer vocabularies.
 * An unknown mood keeps its name in `primary` and projects to `neutral`.
 *
 * @example
 * resolveMood(' Love ')
 * // => { primary: 'love', known: true, talkingheadMood: 'love', airiEmotion: 'happy' }
 */
export function resolveMood(raw: string): ResolvedMood {
  const primary = raw.trim().toLowerCase()
  const entry = vocabulary.get(primary)
  if (!entry) {
    return { primary, known: false, talkingheadMood: 'neutral', airiEmotion: 'neutral' }
  }
  return { primary, known: true, talkingheadMood: entry.talkinghead, airiEmotion: entry.airi }
}
