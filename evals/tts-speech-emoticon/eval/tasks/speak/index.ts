import type { StreamingControlEmotion } from '@proj-airi/pipelines-audio'

import type { Language } from '../../cases/languages'

import { env } from 'node:process'

import { defineMetric, defineScore, describeTask } from 'vieval'

import { emoticonSpeechCases } from '../../cases/emoticon-speech'
import { gradeEmotion, gradeSpoken } from '../../grader'

/** What a test object hands to the speech side of AIRI for one reply. */
export interface SpeechText {
  /** The text that TTS reads, all segments in order. */
  text: string
  /** The emotions that the avatar shows, in order. A test object without emotion signals returns none. */
  emotions: StreamingControlEmotion[]
}

/** The adapter of a test object: one way to turn a reply into the text that TTS reads. */
export type SpeakText = (markdown: string, language: Language) => Promise<SpeechText>

/** `EVAL_CASES` limits a run to some case ids, for example while a new rule is in progress. */
const selectedIds = env.EVAL_CASES?.split(',').map(id => id.trim()).filter(Boolean)

const spokenScore = defineScore('emoticon.spoken', {
  description: { 'en': 'TTS gets the expected text: no part of an emoticon is left, and no content is lost. Whitespace does not count.', 'zh-Hans': 'TTS 拿到预期的文本：颜文字没有残留，内容也没有丢失。不计空白。' },
  grader: { id: 'grader', kind: 'rule' },
  label: { 'en': 'Spoken text', 'zh-Hans': '朗读文本' },
})
const emotionScore = defineScore('emoticon.emotion', {
  description: { 'en': 'The avatar gets the emotion of the emoticon, and no emotion for text that only looks like one.', 'zh-Hans': '头像拿到颜文字表达的情绪；只是看起来像颜文字的文本不产生情绪。' },
  grader: { id: 'grader', kind: 'rule' },
  label: { 'en': 'Emotion', 'zh-Hans': '情绪' },
})
const pass = defineScore('emoticon.pass', {
  combine: { all: [spokenScore, emotionScore] },
  description: { 'en': 'The spoken text and the emotion are both right.', 'zh-Hans': '朗读文本和情绪都正确。' },
  label: { 'en': 'Pass', 'zh-Hans': '通过' },
  primary: true,
})

const kindMetric = defineMetric('tts_speech_emoticon.kind', {
  description: { 'en': 'The form of emoticon that the case covers. `keep` holds text that only looks like an emoticon.', 'zh-Hans': '用例覆盖的颜文字形式。`keep` 是只是看起来像颜文字的文本。' },
  label: { 'en': 'Kind', 'zh-Hans': '形式' },
})
const emotionsMetric = defineMetric('tts_speech_emoticon.emotions', {
  description: { 'en': 'The emotions that the test object sent to the avatar, in order.', 'zh-Hans': '测试对象发给头像的情绪，按顺序。' },
  label: { 'en': 'Emotions', 'zh-Hans': '情绪' },
})

/**
 * Registers the task of one language. Every case of the language runs through the test object, and the deterministic
 * grader scores the result. The suite calls no model.
 */
export function describeEmoticonSpeechTask(language: Language, speakText: SpeakText) {
  const cases = emoticonSpeechCases.filter(item => item.language === language && (!selectedIds?.length || selectedIds.includes(item.id)))

  describeTask(language, ({ casesFromInputs }) => {
    casesFromInputs('case', cases, async (context) => {
      const item = context.matrix.inputs
      // Reports of different test objects match one case by this id, so it leaves the test object out.
      context.recordMetric('benchmark.case.id', item.id)
      context.recordMetric(kindMetric, item.kind)

      const result = await speakText(item.input, language)
      context.recordMetric(emotionsMetric, result.emotions.join(', ') || 'none')
      context.recordScore(spokenScore, gradeSpoken(item.spoken, result.text), { rationale: `expected "${item.spoken}", got "${result.text}"` })
      context.recordScore(emotionScore, gradeEmotion(item.emotion, result.emotions), { rationale: `expected ${item.emotion}, got ${result.emotions.join(', ') || 'none'}` })
      await context.recordArtifact('result.json', {
        body: `${JSON.stringify({ ...item, result }, null, 2)}\n`,
        contentType: 'application/json',
        label: { 'en': 'Result', 'zh-Hans': '结果' },
        purpose: 'tts_speech_emoticon.result',
      })
    })
  }, {
    // `pass` is derived from the two recorded scores, so the task announces it before the first case.
    scores: [spokenScore, emotionScore, pass],
  })
}
