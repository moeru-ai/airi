/**
 * Builds the optional reply-length guideline injected as a system prompt
 * supplement when the user configures a response length limit for the
 * consciousness (chat) module.
 *
 * Use when:
 * - `useConsciousnessStore().responseLengthHint` is set to a positive value.
 *
 * Expects:
 * - `maxChars` to be a positive integer (callers gate on `> 0`).
 *
 * Returns:
 * - A short instruction the character LLM follows best-effort. This is a soft
 *   guideline only — pair it with `StreamOptions.maxTokens` (the hard cap sent
 *   as `max_tokens`) when the model must not exceed a budget.
 */
export function responseLengthGuidelinePrompt(maxChars: number): string {
  return [
    `Keep each reply within roughly ${maxChars} characters.`,
    'Prefer one or two short, natural spoken sentences over long paragraphs;',
    'when trimming, drop pleasantries and filler rather than cutting off mid-sentence.',
  ].join(' ')
}
