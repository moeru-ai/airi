import type { VrmEmoteAnimation } from '../../assets/vrm/animations'

/** Lower case, with each run of spaces, hyphens, or underscores as one underscore. */
function normalizeCue(value: string) {
  return value.trim().toLowerCase().replace(/[\s\-_]+/g, '_')
}

/**
 * The cue that the LLM prompt shows for an emote: its name in lower case with underscores.
 *
 * Example: `Peace Sign` gives `peace_sign`. A bundled emote gets its id back.
 */
export function vrmEmoteCue(emote: VrmEmoteAnimation) {
  return normalizeCue(emote.name) || emote.id
}

/**
 * Finds the emote that an LLM motion cue names.
 *
 * Use when the cue comes from free text, for example the `motion` field of an ACT token.
 * The cue matches the id or the name, ignoring case, spaces, hyphens, and underscores.
 *
 * Example: `"Peace Sign"`, `"peace-sign"`, and `"peace_sign"` find the `peace_sign` emote.
 */
export function findVrmEmote(emotes: readonly VrmEmoteAnimation[], cue: string): VrmEmoteAnimation | undefined {
  const wanted = normalizeCue(cue)
  if (!wanted)
    return undefined
  return emotes.find(emote => normalizeCue(emote.id) === wanted)
    ?? emotes.find(emote => normalizeCue(emote.name) === wanted)
}
