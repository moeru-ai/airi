import type { SpeakText } from '@proj-airi/evals-tts-speech-text'

// The default `tts_filter` of Open-LLM-VTuber, every option on, in its order: asterisks, square brackets, parentheses,
// angle brackets, then special characters. It runs on the reply as written, as Open-LLM-VTuber does.
// Source: `src/open_llm_vtuber/utils/tts_preprocessor.py` of Open-LLM-VTuber/Open-LLM-VTuber (MIT), read on 2026-11-05.

/** Deletes the text between `left` and `right`, nested too. A closing symbol without its opening symbol is deleted. */
function filterNested(text: string, left: string, right: string): string {
  let depth = 0
  let result = ''
  for (const char of text) {
    if (char === left)
      depth++
    else if (char === right)
      depth = Math.max(0, depth - 1)
    else if (depth === 0)
      result += char
  }
  return result.replace(/\s+/g, ' ').trim()
}

function filterAsterisks(text: string): string {
  return text.replace(/\*+(?:(?!\*).)*\*+/g, '').replace(/\s+/g, ' ').trim()
}

/** Keeps the letters, numbers, punctuation, and whitespace of the NFKC form. */
function removeSpecialCharacters(text: string): string {
  return [...text.normalize('NFKC')].filter(char => /[\p{L}\p{N}\p{P}\s]/u.test(char)).join('')
}

export const speakText: SpeakText = async (markdown) => {
  let text = filterAsterisks(markdown)
  text = filterNested(text, '[', ']')
  text = filterNested(text, '(', ')')
  text = filterNested(text, '<', '>')
  return { text: removeSpecialCharacters(text), emotions: [] }
}
