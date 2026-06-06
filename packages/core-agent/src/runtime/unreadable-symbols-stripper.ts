import { stripMarkdownFromSpeech } from './markdown-stripper'

/**
 * Options for configuring which symbol categories to strip.
 *
 * All options default to `true` (maximum TTS safety).
 * Set individual options to `false` to preserve specific categories.
 */
export interface StripUnreadableSymbolsOptions {
  /** Remove emoji and Unicode pictographic symbols. Default: true */
  stripEmoji?: boolean
  /** Remove standalone math/operator symbols. Default: true */
  stripMathOperators?: boolean
  /** Remove decorative Unicode (arrows, box-drawing, shapes, dingbats). Default: true */
  stripDecorativeUnicode?: boolean
  /** Remove standalone special chars that survived Markdown stripping. Default: true */
  stripStandaloneSpecialChars?: boolean
  /** Collapse repeated punctuation (!!! → !, ??? → ?, etc.). Default: true */
  collapseRepeatedPunctuation?: boolean
}

const DEFAULT_OPTIONS: Required<StripUnreadableSymbolsOptions> = {
  stripEmoji: true,
  stripMathOperators: true,
  stripDecorativeUnicode: true,
  stripStandaloneSpecialChars: true,
  collapseRepeatedPunctuation: true,
}

// Use Unicode Private Use Area codepoints as placeholders — these will never
// appear in natural text and survive all stripping passes.
const TOKEN_PLACEHOLDER_BASE = '\uE0000'

/**
 * Extracts streaming control tokens from text, replacing them with
 * Private Use Area placeholders that won't be affected by stripping passes.
 */
function extractStreamingTokens(text: string): { processed: string, tokens: string[] } {
  const tokens: string[] = []
  const processed = text.replace(/<\|[^|]+\|>/g, (match) => {
    const index = tokens.length
    tokens.push(match)
    return `${TOKEN_PLACEHOLDER_BASE}${index.toString(36)}${TOKEN_PLACEHOLDER_BASE}`
  })
  return { processed, tokens }
}

/**
 * Restores streaming control tokens from placeholders back into text.
 */
function restoreStreamingTokens(text: string, tokens: string[]): string {
  return text.replace(
    new RegExp(`${TOKEN_PLACEHOLDER_BASE}([0-9a-z]+)${TOKEN_PLACEHOLDER_BASE}`, 'g'),
    (_, indexStr) => tokens[Number.parseInt(indexStr, 36)] ?? '',
  )
}

/**
 * Strips unreadable symbols from TTS input text.
 *
 * Runs stripMarkdownFromSpeech first, then applies additional passes
 * for emoji, decorative Unicode, standalone special chars, math operators,
 * and repeated punctuation. Each pass is configurable via options.
 *
 * Use when:
 * - Cleaning LLM speech output before TTS input
 * - You need more aggressive symbol removal than Markdown stripping alone
 *
 * Expects:
 * - Text that has already been filtered through the response categorizer
 *   so reasoning tags and streaming control tokens are not present
 *
 * Returns:
 * - Plain text with all configured symbol categories removed
 *
 * @example
 * stripUnreadableSymbols('I ❤️ this! 🎉🎉🎉')
 * // -> 'I this!'
 *
 * @example
 * stripUnreadableSymbols('Price is $5!!! Really???', { collapseRepeatedPunctuation: false })
 * // -> 'Price is $5!!! Really???'
 */
export function stripUnreadableSymbols(
  text: string,
  options?: StripUnreadableSymbolsOptions,
): string {
  const opts: Required<StripUnreadableSymbolsOptions> = { ...DEFAULT_OPTIONS, ...options }

  // Protect streaming control tokens from stripping
  const { processed: safeText, tokens } = extractStreamingTokens(text)

  // Pass 1: Strip Markdown syntax (always run)
  let result = stripMarkdownFromSpeech(safeText)

  // Pass 2: Strip emoji and Unicode pictographic symbols
  if (opts.stripEmoji) {
    // Remove variation selectors, ZWJ, keycap combining chars first
    result = result.replace(/\uFE0F/gu, '')
    result = result.replace(/\u200D/gu, '')
    result = result.replace(/\u20E3/gu, '')

    // Remove emoji Unicode ranges
    // U+1F300-U+1F9FF: Misc symbols, emoticons, transport, supplemental
    result = result.replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    // U+2600-U+26FF: Misc symbols
    result = result.replace(/[\u{2600}-\u{26FF}]/gu, '')
    // U+2700-U+27BF: Dingbats
    result = result.replace(/[\u{2700}-\u{27BF}]/gu, '')
    // U+1F3FB-U+1F3FF: Skin tone modifiers
    result = result.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    // U+1F1E0-U+1F1FF: Regional indicator symbols (flags)
    result = result.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
    // U+1F600-U+1F64F: Emoticons (faces)
    result = result.replace(/[\u{1F600}-\u{1F64F}]/gu, '')
    // U+1F680-U+1F6FF: Transport and map symbols
    result = result.replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
    // U+1FA00-U+1FAFF: Extended-A and beyond
    result = result.replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')
    // U+2702-U+27B0: Dingbats (additional)
    result = result.replace(/[\u{2702}-\u{27B0}]/gu, '')
    // U+231A-U+231B: Watch, hourglass
    result = result.replace(/[\u{231A}-\u{231B}]/gu, '')
    // U+23E9-U+23F3: Media controls, clocks
    result = result.replace(/[\u{23E9}-\u{23F3}]/gu, '')
    // U+23F8-U+23FA: Media controls
    result = result.replace(/[\u{23F8}-\u{23FA}]/gu, '')
    // U+25AA-U+25AB, U+25B6, U+25C0, U+25FB-U+25FE: Geometric shapes
    result = result.replace(/[\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu, '')
    // U+2614-U+2615: Umbrella, hot beverage
    result = result.replace(/[\u{2614}-\u{2615}]/gu, '')
    // U+2648-U+2653: Zodiac
    result = result.replace(/[\u{2648}-\u{2653}]/gu, '')
    // U+267F, U+2693, U+26A1, U+26AA-U+26AB, U+26BD-U+26BE, U+26C4-U+26C5, U+26CE, U+26D4, U+26EA, U+26F2-U+26F3, U+26F5, U+26FA, U+26FD: Misc
    result = result.replace(/[\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}]/gu, '')
    // U+2934-U+2935: Arrows
    result = result.replace(/[\u{2934}-\u{2935}]/gu, '')
    // U+2B05-U+2B07: Arrows
    result = result.replace(/[\u{2B05}-\u{2B07}]/gu, '')
    // U+2B1B-U+2B1C, U+2B50, U+2B55: Geometric shapes
    result = result.replace(/[\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}]/gu, '')
    // U+3030, U+303D, U+3297, U+3299: CJK symbols
    result = result.replace(/[\u{3030}\u{303D}\u{3297}\u{3299}]/gu, '')
  }

  // Pass 3: Strip decorative Unicode (arrows, box-drawing, shapes, dingbats)
  if (opts.stripDecorativeUnicode) {
    // U+2190-U+21FF: Arrows
    result = result.replace(/[\u{2190}-\u{21FF}]/gu, '')
    // U+2500-U+257F: Box drawing
    result = result.replace(/[\u{2500}-\u{257F}]/gu, '')
    // U+2580-U+259F: Block elements
    result = result.replace(/[\u{2580}-\u{259F}]/gu, '')
    // U+25A0-U+25FF: Geometric shapes
    result = result.replace(/[\u{25A0}-\u{25FF}]/gu, '')
    // Specific decorative chars: © ® ™ § ¶ † ‡ • ‣ ⁃
    result = result.replace(/[©®™§¶†‡•‣⁃]/g, '')
    // U+2100-U+214F: Letterlike symbols
    result = result.replace(/[\u{2100}-\u{214F}]/gu, '')
  }

  // Pass 4: Strip standalone special characters
  if (opts.stripStandaloneSpecialChars) {
    // Matches standalone special chars surrounded by whitespace or at string boundaries.
    // Consumes the surrounding whitespace to avoid double spaces.
    result = result.replace(/(^|\s)[*#@|\\/~^`]+(?=\s|$)/g, '$1')
  }

  // Pass 5: Strip standalone math/operator symbols
  if (opts.stripMathOperators) {
    // Matches standalone operator sequences surrounded by whitespace or boundaries.
    // Uses lookbehind for whitespace/start and lookahead for whitespace/end.
    // Does NOT match when adjacent to non-whitespace characters (e.g., C++, A&B).
    // Consumes the trailing whitespace to avoid double spaces.
    result = result.replace(/(?:^|(?<=\s))[+=\-<>&^~|\\/%]+(?=\s|$)/g, '')
  }

  // Pass 6: Collapse repeated punctuation
  if (opts.collapseRepeatedPunctuation) {
    result = result.replace(/!{3,}/g, '!')
    result = result.replace(/\?{3,}/g, '?')
    result = result.replace(/\.{4,}/g, '…')
    result = result.replace(/-{3,}/g, '—')
    result = result.replace(/~{2,}/g, '~')
  }

  // Collapse multiple spaces into one
  result = result.replace(/ {2,}/g, ' ')

  // Restore streaming control tokens
  result = restoreStreamingTokens(result, tokens)

  // Trim leading/trailing whitespace from the overall result
  return result.trim()
}
