import type { StreamingControlEmotion } from '@proj-airi/pipelines-audio'

/** An emoticon in one speech segment. The speech stream removes it from the spoken text and sends its emotion. */
export interface Emoticon {
  /** The offset of the first character in the segment. */
  readonly start: number
  /** The offset after the last character in the segment. */
  readonly end: number
  readonly emotion: StreamingControlEmotion
  /** From 0 to 1. A longer emoticon, as `:(((` or `（（（（`, expresses a stronger emotion. */
  readonly intensity: number
}

/**
 * A face, as `:(`, `;)`, `>:[`, `:'(`, or `:DDD`. The eye is `:`, `;`, or `=`. A `>` before it frowns, a `'` cries,
 * and a `-` is a nose. The mouth can repeat.
 */
const face = /(>)?[:;=](['-])?([()[\]DPpOo])\3*/y
/** Brackets that some communities repeat after a sentence: `（（（` and `(((` are sad, `）））` and `)))` are happy. */
const bracketPairs: Record<string, string> = { '(': ')', '（': '）' }
const closingBrackets = new Set(Object.values(bracketPairs))

/**
 * Codes that chat apps show as a sticker, as WeChat `[捂脸]` and Weibo `[doge]`, and emotes in brackets, as `（笑）`.
 * An unknown code stays in the text, because a word in brackets can be content, as `[注]`.
 */
const emoteEmotions: Record<string, StreamingControlEmotion> = {
  微笑: 'happy',
  呲牙: 'happy',
  偷笑: 'happy',
  憨笑: 'happy',
  坏笑: 'happy',
  奸笑: 'happy',
  愉快: 'happy',
  调皮: 'happy',
  得意: 'happy',
  鼓掌: 'happy',
  破涕为笑: 'happy',
  笑脸: 'happy',
  哈哈: 'happy',
  嘻嘻: 'happy',
  耶: 'happy',
  机智: 'happy',
  旺柴: 'happy',
  doge: 'happy',
  二哈: 'happy',
  笑cry: 'happy',
  流泪: 'sad',
  大哭: 'sad',
  难过: 'sad',
  委屈: 'sad',
  快哭了: 'sad',
  可怜: 'sad',
  撇嘴: 'sad',
  衰: 'sad',
  泪: 'sad',
  叹气: 'sad',
  苦涩: 'sad',
  裂开: 'sad',
  允悲: 'sad',
  发怒: 'angry',
  抓狂: 'angry',
  咒骂: 'angry',
  怒: 'angry',
  捂脸: 'awkward',
  尴尬: 'awkward',
  擦汗: 'awkward',
  害羞: 'awkward',
  囧: 'awkward',
  汗: 'awkward',
  打脸: 'awkward',
  惊讶: 'surprised',
  惊恐: 'surprised',
  天啊: 'surprised',
  哇: 'surprised',
  疑问: 'question',
  费解: 'question',
  思考: 'think',
  Emm: 'think',
  吃瓜: 'curious',
  让我看看: 'curious',
}
/** A one-character emote in round or lenticular brackets, as Japanese `（笑）`. */
const bracketEmoteEmotions: Record<string, StreamingControlEmotion> = {
  笑: 'happy',
  泣: 'sad',
  哭: 'sad',
  泪: 'sad',
  汗: 'awkward',
  怒: 'angry',
  惊: 'surprised',
  驚: 'surprised',
}
const emote = /\[([^\]\s]{1,6})\]|[（(【]([^）)】\s])[）)】]/y

/** One emoticon character is mild. Each repeat makes it stronger, up to 1. */
function intensityOf(repeats: number): number {
  return Math.min(1, 0.5 + 0.25 * (repeats - 1))
}

function isAsciiWord(char: string | undefined): boolean {
  return char !== undefined && /[A-Z0-9]/i.test(char)
}

function faceAt(text: string, index: number): Emoticon | undefined {
  // A face starts a word, so `http://`, `f:(a)`, and `Step 2:D` are not faces.
  if (isAsciiWord(text[index - 1]))
    return undefined
  face.lastIndex = index
  const match = face.exec(text)
  // A word that follows the mouth, as `:Done`, makes the colon punctuation.
  if (!match || isAsciiWord(text[index + match[0].length]))
    return undefined

  const [source, frown, tear, mouth] = match
  const repeats = source.length - source.indexOf(mouth!)
  const end = index + source.length
  if (mouth === '(' || mouth === '[')
    return { start: index, end, emotion: frown ? 'angry' : 'sad', intensity: intensityOf(repeats) }
  // A frown or a tear with any other mouth, as `>:)` or `:')`, has no clear emotion, so it stays as text.
  if (frown || tear)
    return undefined
  if (mouth === 'O' || mouth === 'o')
    return { start: index, end, emotion: 'surprised', intensity: intensityOf(repeats) }
  return { start: index, end, emotion: 'happy', intensity: intensityOf(repeats) }
}

function emoteAt(text: string, index: number): Emoticon | undefined {
  emote.lastIndex = index
  const match = emote.exec(text)
  if (!match)
    return undefined

  const end = index + match[0].length
  // `[text](url)`, `[text][ref]`, and `[ref]: url` are links.
  if (match[1] !== undefined && /[([:]/.test(text[end] ?? ''))
    return undefined
  const emotion = match[1] !== undefined ? emoteEmotions[match[1]] : bracketEmoteEmotions[match[2]!]
  return emotion ? { start: index, end, emotion, intensity: 0.75 } : undefined
}

/**
 * Marks the characters of code spans, fenced code blocks, and link destinations, where symbols are not emoticons.
 * A segment ends only where markdown is complete, see ./segmenter, so every span opens and closes in it.
 */
function literalCharacters(text: string): Set<number> {
  const literal = new Set<number>()
  const mark = (start: number, end: number) => {
    for (let index = start; index < end; index++)
      literal.add(index)
  }

  let fence: string | undefined
  let code: string | undefined
  let codeStart = 0
  for (let index = 0; index < text.length; index++) {
    if (index === 0 || text[index - 1] === '\n') {
      const newline = text.indexOf('\n', index)
      const lineEnd = newline === -1 ? text.length : newline
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(text.slice(index, lineEnd))?.[1]
      // A fence line opens or closes a block. Every line until the closing fence is code.
      if (fence !== undefined || (marker && code === undefined)) {
        if (marker && (fence === undefined || marker.startsWith(fence)))
          fence = fence === undefined ? marker : undefined
        mark(index, lineEnd)
        index = lineEnd
        continue
      }
    }

    const char = text[index]
    if (char === '`') {
      let run = '`'
      while (text[index + run.length] === '`')
        run += '`'
      if (code === undefined) {
        code = run
        codeStart = index
      }
      else if (code === run) {
        mark(codeStart, index + run.length)
        code = undefined
      }
      index += run.length - 1
    }
    else if (code === undefined && char === ']' && text[index + 1] === '(') {
      let end = index + 2
      while (end < text.length && text[end] !== ')' && !/\s/.test(text[end]!))
        end++
      mark(index, end + 1)
      index = end
    }
  }
  return literal
}

/**
 * Finds the runs of brackets that no bracket matches, as `（（（` after a sad sentence or `)))` after a happy one.
 * Brackets that match, as in `f(g(x))`, are text. A single bracket, as in a list item `1)`, is text too.
 */
function bracketRuns(text: string, skip: (index: number) => boolean): Emoticon[] {
  const open: number[] = []
  const unmatched = new Set<number>()
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (skip(index))
      continue
    if (char in bracketPairs) {
      open.push(index)
      unmatched.add(index)
    }
    else if (closingBrackets.has(char)) {
      const last = open.at(-1)
      if (last !== undefined && bracketPairs[text[last]!] === char) {
        open.pop()
        unmatched.delete(last)
      }
      else {
        unmatched.add(index)
      }
    }
  }

  const runs: Emoticon[] = []
  for (let index = 0; index < text.length; index++) {
    if (!unmatched.has(index))
      continue
    let end = index + 1
    while (unmatched.has(end) && text[end] === text[index])
      end++
    if (end - index >= 2) {
      const emotion = text[index]! in bracketPairs ? 'sad' : 'happy'
      // Two brackets already form an emoticon, so the third is the first repeat.
      runs.push({ start: index, end, emotion, intensity: intensityOf(end - index - 1) })
    }
    index = end - 1
  }
  return runs
}

/**
 * Finds the emoticons of one speech segment in source order. Code, link destinations, and matched brackets are not
 * emoticons. The segment is markdown, so the offsets index the markdown source.
 *
 * @example
 * findEmoticons('Aww :( okay')
 * // => [{ start: 4, end: 6, emotion: 'sad', intensity: 0.5 }]
 */
export function findEmoticons(text: string): Emoticon[] {
  const literal = literalCharacters(text)
  const isLiteral = (index: number) => literal.has(index)

  const found: Emoticon[] = []
  const claimed = new Set<number>()
  for (let index = 0; index < text.length; index++) {
    if (isLiteral(index))
      continue
    const emoticon = faceAt(text, index) ?? emoteAt(text, index)
    if (!emoticon)
      continue
    found.push(emoticon)
    for (let claimedIndex = emoticon.start; claimedIndex < emoticon.end; claimedIndex++)
      claimed.add(claimedIndex)
    index = emoticon.end - 1
  }

  // A face or an emote owns its brackets, so `:)))` and `（笑）` do not count again as bracket runs.
  found.push(...bracketRuns(text, index => isLiteral(index) || claimed.has(index)))
  return found.sort((a, b) => a.start - b.start)
}
