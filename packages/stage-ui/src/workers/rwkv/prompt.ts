/**
 * RWKV-7 "G1" chat-prompt formatting.
 *
 * RWKV is a text-completion model: it has no notion of a `messages` array, only
 * a single prompt string. The G1-series checkpoints were trained on a specific
 * `System:/User:/Assistant:` layout, so a local chat provider must flatten the
 * OpenAI-style `Message[]` it receives (the same array `streamText` sends every
 * other provider) into that layout before handing it to the worker. This module
 * is that flattening — pure and transport-agnostic, so the deferred main-side
 * adapter (PR #1917) can consume it directly.
 *
 * Reference: https://github.com/BlinkDL/RWKV-LM/blob/main/RWKV-v7/RWKV7-G1x-templates.txt
 *
 * Layout:
 *   System: {sys}\n\nUser: {u1}\n\nAssistant: {a1}\n\nUser: {u2}\n\nAssistant:
 *
 * The trailing `Assistant:` (optionally with a `<think>` cue) is the generation
 * point; generation then stops at the next `\n\nUser:`/`\n\nSystem:` turn or the
 * end-of-text token.
 */

import type { Message } from '@xsai/shared-chat'

/**
 * Think-mode cue appended after the final `Assistant:`.
 *
 * - `'none'`: answer directly (no reasoning trace).
 * - `'think'`: open a reasoning block (`<think`) so the model reasons first;
 *   matches the template's recommended real-thinking cue.
 * - `'fake'`: emit an empty, pre-closed reasoning block (`<think>\n</think>`),
 *   which the template notes gives "nice results and fast" by skipping reasoning.
 */
export type RwkvThinkMode = 'none' | 'think' | 'fake'

export interface RwkvPromptOptions {
  /**
   * Whether/how to prime a reasoning block.
   * @default 'none'
   */
  think?: RwkvThinkMode
}

/** A formatted RWKV prompt plus the stop sequences that bound its completion. */
export interface RwkvPrompt {
  /** The full prompt string ending at the `Assistant:` generation point. */
  prompt: string
  /** Decoded substrings that must end generation (the next turn header). */
  stop: string[]
}

/**
 * Stop at the start of the next turn so the model can't role-play the user.
 * `\n\n` precedes every turn header in the G1 layout.
 */
const STOP_SEQUENCES = ['\n\nUser:', '\n\nSystem:'] as const

/** Turn headers per role, kept beside the formatter that emits them. */
const ROLE_HEADERS = { system: 'System', user: 'User', assistant: 'Assistant' } as const

/**
 * Format an OpenAI-style message history into a G1 chat prompt.
 *
 * Use when:
 * - Driving a G1-series RWKV checkpoint from a `Message[]` (the local chat
 *   provider's request body).
 *
 * Expects:
 * - Messages in chronological order. The final turn is normally a `user`
 *   message; this function always appends the `Assistant:` generation cue, so
 *   the caller does not pre-seed an empty assistant turn.
 *
 * Returns:
 * - `{ prompt, stop }` ready for the engine: `prompt` ends at `Assistant:`
 *   (plus any think cue), and `stop` holds the next-turn headers.
 */
export function formatG1Prompt(messages: Message[], options?: RwkvPromptOptions): RwkvPrompt {
  const turns: string[] = []

  for (const message of messages) {
    const rendered = renderTurn(message)
    if (rendered)
      turns.push(rendered)
  }

  // The trailing assistant cue is where generation begins. `'none'` leaves the
  // header open ("Assistant:"); the think modes prime a reasoning block.
  const assistantCue = options?.think === 'think'
    ? 'Assistant: <think'
    : options?.think === 'fake'
      ? 'Assistant: <think>\n</think>'
      : 'Assistant:'

  turns.push(assistantCue)

  return { prompt: turns.join('\n\n'), stop: [...STOP_SEQUENCES] }
}

/**
 * Render one message as a `Role: content` turn, or `''` to skip it.
 *
 * Tool results are folded into a `User:` turn as `Function output:` to match the
 * function-call examples in the G1 templates; assistant history is kept verbatim
 * (only trimmed), while system/user inputs are cleaned (see {@link cleanInput}).
 */
function renderTurn(message: Message): string {
  const text = contentToText(message.content)

  switch (message.role) {
    case 'system':
    case 'developer':
      return `${ROLE_HEADERS.system}: ${cleanInput(text)}`
    case 'user':
      return `${ROLE_HEADERS.user}: ${cleanInput(text)}`
    case 'assistant':
      return `${ROLE_HEADERS.assistant}: ${text.trim()}`
    case 'tool':
      return `${ROLE_HEADERS.user}: Function output:\n${cleanInput(text)}`
    default:
      return ''
  }
}

/**
 * Minimal structural shape shared by every message content part: each variant
 * carries a `type`, and only text parts carry `text`. Using this instead of the
 * role-specific unions lets one extractor handle system/user/assistant/tool
 * content (which differ — assistant content may include refusal parts or be
 * absent) without `any`.
 */
interface ContentPartLike { type: string, text?: string }

/**
 * Flatten message content (string, content-part array, or absent) to plain text.
 *
 * RWKV G1 is text-only, so non-text parts (images, audio, files, refusals) are
 * dropped and only `text` parts are concatenated.
 */
function contentToText(content: string | readonly ContentPartLike[] | undefined): string {
  if (content == null)
    return ''
  if (typeof content === 'string')
    return content
  return content
    .filter(part => part.type === 'text')
    .map(part => part.text ?? '')
    .join('')
}

/**
 * Normalize a system/user input for the G1 templates.
 *
 * The templates require collapsing blank lines and trimming so stray newlines
 * never look like a turn boundary (`re.sub(r'\n{2,}', '\n', txt.replace('\r\n','\n')).strip()`).
 *
 * Before:
 * - "Hello\r\n\n\n  world  "
 *
 * After:
 * - "Hello\nworld"
 */
function cleanInput(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim()
}
