/**
 * System-prompt guard appended when the thinking toggle is on.
 *
 * Reasoning-capable models often leak chain-of-thought phrasing into the reply
 * ("the user is asking...", "the assistant should...") which breaks character.
 * When thinking stays enabled we append this guard to the system prompt so the
 * model keeps speaking in-character and first-person instead of narrating about
 * the user. It is intentionally NOT applied when thinking is disabled, since a
 * non-thinking model does not produce that meta-narration.
 */
export const ROLEPLAY_GUARD_PROMPT = [
  '## Roleplay',
  '',
  'Stay fully in character at all times and speak only as the character, in the first person.',
  'Never describe, analyze, or refer to the user or to yourself in the third person, and never write meta-narration such as "the user is...", "the assistant...", or any out-of-character commentary.',
  'Do not expose your reasoning, planning, or analysis; reply only with what the character would actually say or do.',
  'Respond in the same language as the conversation.',
].join('\n')
