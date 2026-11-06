import { describe, expect, it } from 'vitest'

import { findEmoticons } from './emoticon'

/** Returns each emoticon as its source text, emotion, and intensity. */
function emoticonsOf(text: string) {
  return findEmoticons(text).map(({ start, end, emotion, intensity }) => [text.slice(start, end), emotion, intensity])
}

describe('findEmoticons', () => {
  it('reads faces, and a longer mouth as a stronger emotion', () => {
    expect(emoticonsOf('Aww :( okay')).toEqual([[':(', 'sad', 0.5]])
    expect(emoticonsOf('Aww :[ okay')).toEqual([[':[', 'sad', 0.5]])
    expect(emoticonsOf('Nice :))) see you')).toEqual([[':)))', 'happy', 1]])
    expect(emoticonsOf('Stop >:[ now')).toEqual([['>:[', 'angry', 0.5]])
    expect(emoticonsOf('Bye :\'( and ;) and :D and :O')).toEqual([[':\'(', 'sad', 0.5], [';)', 'happy', 0.5], [':D', 'happy', 0.5], [':O', 'surprised', 0.5]])
    expect(emoticonsOf('好难过:(不过没事')).toEqual([[':(', 'sad', 0.5]])
  })

  it('reads runs of brackets that nothing matches', () => {
    expect(emoticonsOf('呜呜好难过（（（ 不过明天会好的')).toEqual([['（（（', 'sad', 0.75]])
    expect(emoticonsOf('太好了））） 明天见')).toEqual([['）））', 'happy', 0.75]])
    expect(emoticonsOf('やったー))) 明日ね')).toEqual([[')))', 'happy', 0.75]])
    expect(emoticonsOf('悲しい(( でも大丈夫')).toEqual([['((', 'sad', 0.5]])
  })

  it('reads sticker codes and emotes in brackets', () => {
    expect(emoticonsOf('笑死[捂脸] 明天见')).toEqual([['[捂脸]', 'awkward', 0.75]])
    expect(emoticonsOf('好的[doge]')).toEqual([['[doge]', 'happy', 0.75]])
    expect(emoticonsOf('そうだね（笑）')).toEqual([['（笑）', 'happy', 0.75]])
    expect(emoticonsOf('好的【汗】')).toEqual([['【汗】', 'awkward', 0.75]])
  })

  it('keeps symbols that are not emoticons', () => {
    expect(emoticonsOf('Compute f(g(h(x))) first.')).toEqual([])
    expect(emoticonsOf('1) First 2) Second')).toEqual([])
    expect(emoticonsOf('Open https://example.com/a:(b now.')).toEqual([])
    expect(emoticonsOf('Note:Do this. Step 2:D is next.')).toEqual([])
    expect(emoticonsOf('See [注] and [捂脸](https://example.com) and [doge][ref].')).toEqual([])
    expect(emoticonsOf('Run `:( (((` and\n```\n:) )))\n```\nok')).toEqual([])
    expect(emoticonsOf('Read [a](https://example.com/x) ))) here')).toEqual([[')))', 'happy', 0.75]])
  })
})
