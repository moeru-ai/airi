/** Sentence ends of CJK text. A segment can end right after them. */
const cjkSentenceEnds = new Set(['。', '！', '？'])
/** Sentence ends of Latin text. A segment can end after them when a space follows. */
const latinSentenceEnds = new Set(['.', '!', '?'])
/** Closing quotes and brackets that stay with the sentence before them, as in `他说：“好。”`. */
const closers = new Set(['"', '\'', '”', '’', '」', '』', '）', ')', '】'])
/**
 * A `$` that starts a price, as `$5` or `$1,200.50`, followed by an end of the amount. It does not open a formula.
 * The same rule as the money plugin, see ./preprocessor/money/prices.
 */
const price = /^\$(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?=$|[\s,.;:!?)\]、，。！？）」』\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])/u

/** What is open at a position of the buffer. A segment can end only where nothing is open. */
interface ScanState {
  /** The fence of a code block, as ``` or ~~~, or undefined outside one. */
  fence?: string
  /** The backtick run that opened inline code. */
  code?: string
  /** The delimiter of an open formula: `$`, `$$`, `\(`, or `\[`. */
  math?: string
  /** Open square brackets of links. */
  brackets: number
  /** True between `](` and its `)`. */
  url: boolean
  /** True inside `*emphasis*`. Operator asterisks, as `2 * 3`, do not count. */
  emphasis: boolean
  /** True inside `**strong**`. `***` opens or closes both. */
  strong: boolean
  /** True on the lines of a table. */
  table: boolean
}

function isOpen(state: ScanState): boolean {
  return state.fence !== undefined || state.code !== undefined || state.math !== undefined || state.brackets > 0 || state.url || state.emphasis || state.strong || state.table
}

/**
 * Splits streamed markdown into segments that parse alone as they would inside the whole reply.
 *
 * `toSpeechText` needs whole markdown constructs: a formula, a code block, a link, or a table that is cut in two reads
 * as its source. The model streams text in pieces, so the segmenter holds the text after the last safe end. A segment
 * ends after a sentence end or a line, when no code, formula, link, emphasis, or table is open.
 *
 * Markdown is not fully streamable. A construct that refers to later text, as a reference link definition, reads as
 * text when its segment has ended. Model replies rarely use them.
 *
 * @example
 * const segmenter = new MarkdownSegmenter()
 * segmenter.push('The area is $x^') // => []
 * segmenter.push('2$. Next') // => ['The area is $x^2$. ']
 * segmenter.end() // => ['Next']
 */
export class MarkdownSegmenter {
  private buffer = ''

  /** Adds streamed text. Returns the segments that ended. */
  push(text: string): string[] {
    this.buffer += text
    const end = this.safeEnd(false)
    return end > 0 ? [this.take(end)] : []
  }

  /**
   * Ends a segment at the end of the buffer when nothing is open there, for a flush of the producer. A sentence can end
   * in the middle then, which is what a flush asks for.
   */
  flush(): string[] {
    const end = this.safeEnd(true)
    return end > 0 ? [this.take(end)] : []
  }

  /** Returns the rest of the text. The model has ended, so an open construct stays as written. */
  end(): string[] {
    const rest = this.take(this.buffer.length)
    return rest ? [rest] : []
  }

  private take(end: number): string {
    const segment = this.buffer.slice(0, end)
    this.buffer = this.buffer.slice(end)
    return segment
  }

  /**
   * Scans the buffer and returns the last index where a segment can end, or 0. `atEnd` also accepts the end of the
   * buffer.
   */
  private safeEnd(atEnd: boolean): number {
    const text = this.buffer
    const state: ScanState = { brackets: 0, url: false, emphasis: false, strong: false, table: false }
    let last = 0
    let lineStart = true

    for (let index = 0; index < text.length; index++) {
      const char = text[index]!

      if (lineStart) {
        lineStart = false
        const line = text.slice(index, text.indexOf('\n', index) === -1 ? undefined : text.indexOf('\n', index))
        const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)
        if (fence && (state.fence === undefined || fence[1]!.startsWith(state.fence))) {
          state.fence = state.fence === undefined ? fence[1] : undefined
          index += line.length - 1
          continue
        }
        if (state.fence !== undefined) {
          index += line.length - 1
          continue
        }
        state.table = /^ {0,3}\|/.test(line)
      }

      if (char === '\n') {
        lineStart = true
        // Inline code and emphasis do not cross a blank line.
        if (text[index + 1] === '\n') {
          state.code = undefined
          state.emphasis = false
          state.strong = false
          if (state.math === '$')
            state.math = undefined
        }
        const next = text[index + 1]
        // The next line decides: an indented line can continue a list item, and parsed alone it is a code block. A line
        // of `=` makes the line before a heading. The last line waits for the next one.
        // A table ends at a line that is not a row.
        if (next !== undefined && next !== ' ' && next !== '\t' && next !== '=') {
          if (state.table && next !== '|')
            state.table = false
          if (!isOpen(state))
            last = index + 1
        }
        continue
      }

      if (state.fence !== undefined)
        continue

      if (char === '\\') {
        const pair = text.slice(index, index + 2)
        if (state.code === undefined && (pair === '\\(' || pair === '\\[') && state.math === undefined)
          state.math = pair
        else if (state.code === undefined && ((pair === '\\)' && state.math === '\\(') || (pair === '\\]' && state.math === '\\[')))
          state.math = undefined
        // An escaped character, as `\$` or `\*`, is text.
        index++
        continue
      }

      if (char === '`') {
        let run = '`'
        while (text[index + run.length] === '`')
          run += '`'
        if (state.math === undefined) {
          if (state.code === undefined)
            state.code = run
          else if (state.code === run)
            state.code = undefined
        }
        index += run.length - 1
        continue
      }

      if (state.code !== undefined)
        continue

      if (char === '$') {
        if (text[index + 1] === '$') {
          if (state.math === undefined)
            state.math = '$$'
          else if (state.math === '$$')
            state.math = undefined
          index++
          continue
        }
        if (state.math === '$')
          state.math = undefined
        // Pandoc rule: an opening `$` has no space after it. A price, as `$5 and`, is not a formula.
        else if (state.math === undefined && text[index + 1] !== undefined && !/\s/.test(text[index + 1]!) && !price.test(text.slice(index)))
          state.math = '$'
        continue
      }

      if (state.math !== undefined)
        continue

      // The character that ends a sentence. Closing emphasis keeps the end before it, as in `**Done.** Next`.
      let terminal = char
      if (char === '[')
        state.brackets++
      else if (char === ']' && state.brackets > 0) {
        state.brackets--
        if (text[index + 1] === '(') {
          state.url = true
          index++
        }
      }
      else if (char === ')' && state.url)
        state.url = false
      else if (char === '*') {
        let run = 1
        while (text[index + run] === '*')
          run++
        // A run between two spaces is an operator, as `2 * 3`.
        if (!(/\s/.test(text[index - 1] ?? ' ') && /\s/.test(text[index + run] ?? ' '))) {
          if (run >= 2)
            state.strong = !state.strong
          if (run % 2 === 1)
            state.emphasis = !state.emphasis
        }
        terminal = text[index - 1] ?? ''
        index += run - 1
      }

      if (isOpen(state))
        continue

      // A sentence ends after CJK punctuation, or after Latin punctuation and a space. `1.` that starts a list item and
      // `3.14` are not ends.
      let end: number | undefined
      if (cjkSentenceEnds.has(terminal))
        end = index + 1
      else if (latinSentenceEnds.has(terminal) && (text[index + 1] === ' ' || text[index + 1] === '\t') && !/^\s*\d+$/.test(text.slice(text.lastIndexOf('\n', index) + 1, index)))
        end = index + 1
      if (end === undefined)
        continue
      while (closers.has(text[end] ?? ''))
        end++
      while (text[end] === ' ' || text[end] === '\t')
        end++
      // The end of the buffer cannot show a closing quote yet, so it waits for more text.
      if (end < text.length)
        last = end
    }

    if (atEnd && !isOpen(state) && state.fence === undefined && text.length > 0)
      return text.length
    return last
  }
}
