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

// Null-byte delimiters for streaming token placeholders — \x00 cannot appear
// in natural text and survives all stripping passes.
const TOKEN_PREFIX = '\x00'
const TOKEN_SUFFIX = '\x00'

/**
 * Extracts streaming control tokens from text, replacing them with
 * null-byte-delimited placeholders that won't be affected by stripping passes.
 */
function extractStreamingTokens(text: string): { processed: string, tokens: string[] } {
  const tokens: string[] = []
  const processed = text.replace(/<\|[^|]+\|>/g, (match) => {
    const index = tokens.length
    tokens.push(match)
    return `${TOKEN_PREFIX}${index}${TOKEN_SUFFIX}`
  })
  return { processed, tokens }
}

/**
 * Restores streaming control tokens from placeholders back into text.
 */
function restoreStreamingTokens(text: string, tokens: string[]): string {
  return text.replace(
    new RegExp(`${TOKEN_PREFIX}(\\d+)${TOKEN_SUFFIX}`, 'g'),
    (_, index) => tokens[Number(index)] ?? '',
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
  console.debug('[TTS DEBUG] stripUnreadableSymbols INPUT:', JSON.stringify(text))
  const opts: Required<StripUnreadableSymbolsOptions> = { ...DEFAULT_OPTIONS, ...options }

  // Protect streaming control tokens from stripping
  const { processed: safeText, tokens } = extractStreamingTokens(text)

  // Pass 1: Strip Markdown syntax (always run)
  let result = stripMarkdownFromSpeech(safeText)
  console.debug('[TTS DEBUG] after stripMarkdownFromSpeech:', JSON.stringify(result))

  // Aggressive star stripping for TTS: remove any ** that survived the markdown pass.
  // This handles split markers like **bold + text** where neither chunk has complete **...**.
  result = result.replace(/\*\*/g, '')
  console.debug('[TTS DEBUG] after aggressive star strip:', JSON.stringify(result))

  // Pass 2: Strip emoji, pictographic symbols, and decorative Unicode.
  // Ranges are deduplicated: \u{1F300}-\u{1F9FF} already covers
  // \u{1F600}-\u{1F64F} (emoticons) and \u{1F680}-\u{1F6FF} (transport),
  // so those subsets are omitted. \u{2600}-\u{26FF} covers \u{2614}-\u{2615},
  // \u{2648}-\u{2653}, etc. Variation selectors and ZWJ are included in the
  // same regex to minimize .replace() calls.
  if (opts.stripEmoji || opts.stripDecorativeUnicode) {
    // Build a combined character class from all needed ranges
    const ranges: string[] = []

    if (opts.stripEmoji) {
      // Variation selectors, ZWJ, keycap combining chars
      ranges.push('\uFE0F', '\u200D', '\u20E3')
      // Emoji & pictographic symbols (deduplicated — no subsets of the above)
      ranges.push(
        '\\u{1F300}-\\u{1F9FF}', // Misc symbols, emoticons, transport, supplemental
        '\\u{1F1E0}-\\u{1F1FF}', // Regional indicator symbols (flags)
        '\\u{1F3FB}-\\u{1F3FF}', // Skin tone modifiers
        '\\u{1FA00}-\\u{1FAFF}', // Extended-A and beyond
        '\\u{2600}-\\u{26FF}', // Misc symbols (covers \u{2614}-\u{2615}, \u{2648}-\u{2653}, etc.)
        '\\u{2700}-\\u{27BF}', // Dingbats
        '\\u{231A}-\\u{231B}', // Watch, hourglass
        '\\u{23E9}-\\u{23F3}', // Media controls, clocks
        '\\u{23F8}-\\u{23FA}', // Media controls
        '\\u{25AA}-\\u{25AB}', '\\u{25B6}', '\\u{25C0}', '\\u{25FB}-\\u{25FE}', // Geometric shapes
        '\\u{2934}-\\u{2935}', // Arrows
        '\\u{2B05}-\\u{2B07}', // Arrows
        '\\u{2B1B}-\\u{2B1C}', '\\u{2B50}', '\\u{2B55}', // Geometric shapes
        '\\u{3030}', '\\u{303D}', '\\u{3297}', '\\u{3299}', // CJK symbols
      )
    }

    if (opts.stripDecorativeUnicode) {
      // Arrows, box-drawing, block elements, geometric shapes, letterlike symbols,
      // general punctuation (em/en dashes, typographic quotes, ellipsis, etc.)
      ranges.push(
        '\\u{2190}-\\u{21FF}', // Arrows
        '\\u{2500}-\\u{257F}', // Box drawing
        '\\u{2580}-\\u{259F}', // Block elements
        '\\u{25A0}-\\u{25FF}', // Geometric shapes
        '\\u{2100}-\\u{214F}', // Letterlike symbols
        '\\u{2000}-\\u{206F}', // General punctuation (em/en dashes, quotes, ellipsis, etc.)
        '\u00A9', '\u00AE', '\\u{2122}', // © ® ™
        '\\u{00A7}', '\\u{00B6}', '\\u{2020}', '\\u{2021}', // § ¶ † ‡
        '\\u{2022}', '\\u{2023}', '\\u{2043}', // • ‣ ⁃
      )
    }

    result = result.replace(new RegExp(`[${ranges.join('')}]`, 'gu'), '')
  }

  // Pass 3: Strip standalone special characters
  if (opts.stripStandaloneSpecialChars) {
    // Matches standalone special chars surrounded by whitespace or at string boundaries.
    // Consumes the surrounding whitespace to avoid double spaces.
    result = result.replace(/(^|\s)[*#@|\\/~^`]+(?=\s|$)/g, '$1')
  }

  // Pass 4: Strip standalone math/operator symbols
  if (opts.stripMathOperators) {
    // Matches standalone operator sequences at string boundaries or surrounded by whitespace.
    // Uses explicit (^|\s) grouping for boundary matching — more portable than lookbehind.
    // Does NOT match when adjacent to non-whitespace characters (e.g., C++, A&B).
    result = result.replace(/(^|\s)[+=\-<>&^~|\\/%]+(?=\s|$)/g, '$1')
  }

  // Pass 5: Collapse repeated punctuation
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
