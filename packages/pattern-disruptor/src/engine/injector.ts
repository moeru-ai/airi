import type { PatternDisruptorBuildInput, PatternDisruptorBuildResult, PatternDisruptorSettings } from '../types'

import { resolvePatternDisruptorLanguage, tokenizeWords } from '../data/language'
import { resolvePatternDisruptorSettings } from '../settings'
import { generateRandomWords } from './random-words'
import { scanSynonymOveruse } from './synonym-scanner'

function renderTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => String(values[key] ?? ''))
}

function countPromptWords(text: string): number {
  return tokenizeWords(text).length
}

function renderRandomWordsPrompt(settings: PatternDisruptorSettings, words: string[]): string {
  if (words.length === 0) return ''
  return renderTemplate(settings.randomWords.customPrompt, { words: words.join(', ') })
}

function renderSynonymPrompt(
  settings: PatternDisruptorSettings,
  rows: PatternDisruptorBuildResult['synonymRows'],
): string {
  if (rows.length === 0) return ''

  const rowTemplate =
    settings.synonyms.outputMode === 'avoid-only'
      ? '- "{{originalWord}}" ({{count}}x)'
      : settings.synonyms.customPromptRow
  const renderedRows = rows
    .map((row) =>
      renderTemplate(rowTemplate, {
        originalWord: row.originalWord,
        count: row.count,
        synonyms: row.synonyms.join(', '),
      }),
    )
    .join('\n')

  return renderTemplate(settings.synonyms.customPrompt, { rows: renderedRows })
}

function applyPromptWordBudget(sections: string[], maxPromptWords: number): string[] {
  const selected: string[] = []
  let used = 0

  for (const section of sections) {
    const words = countPromptWords(section)
    if (words === 0) continue
    if (used + words > maxPromptWords) continue
    selected.push(section)
    used += words
  }

  return selected
}

export function buildPatternDisruptorSupplement(input: PatternDisruptorBuildInput): PatternDisruptorBuildResult {
  const settings = resolvePatternDisruptorSettings(input.settings)
  const language = resolvePatternDisruptorLanguage(settings.language, input.userMessage)

  if (!settings.enabled) {
    return {
      text: '',
      words: [],
      synonymRows: [],
      metadata: {
        language,
        estimatedWords: 0,
        randomWordsEnabled: false,
        synonymsEnabled: false,
      },
    }
  }

  const words = generateRandomWords({
    settings,
    userMessage: input.userMessage,
    wordHistory: input.wordHistory,
    random: input.random,
  })
  const synonymRows = scanSynonymOveruse({
    settings,
    userMessage: input.userMessage,
    assistantMessages: input.assistantMessages,
  })

  const sections = applyPromptWordBudget(
    [renderRandomWordsPrompt(settings, words), renderSynonymPrompt(settings, synonymRows)],
    settings.maxPromptWords,
  )
  const text = sections.join('\n\n')

  return {
    text,
    words,
    synonymRows,
    metadata: {
      language,
      estimatedWords: countPromptWords(text),
      randomWordsEnabled: words.length > 0,
      synonymsEnabled: synonymRows.length > 0,
    },
  }
}
