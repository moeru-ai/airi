/**
 * Reads the JSON value of a model reply. Some models wrap JSON in a Markdown code fence, so the fence is removed first.
 * A reply that is not JSON throws.
 *
 * @example
 * readJsonReply('```json\n{"complete": true}\n```')
 * // => { complete: true }
 */
export function readJsonReply(reply: string): unknown {
  return JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))
}
