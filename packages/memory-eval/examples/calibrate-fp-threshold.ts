/**
 * Fixed-point threshold calibration.
 *
 * `computeDriftScore` scores the fixed-point component on a 0..1 token
 * edit-distance scale. That scale is not semantic: two descriptions of the
 * *same* character written in different words land around 0.5, while a
 * character that has become someone else lands around 0.8. This script
 * measures both bands on a hand-written set and reports the midpoint as the
 * default `fpThreshold`.
 *
 * Run from the package root:
 *   npx tsx examples/calibrate-fp-threshold.ts > ../../06-验证材料/fixed-point-calibration.json
 */

import { normalizedTextDistance } from '../src/fixed-point'

interface Case {
  band: 'minor_edit' | 'paraphrase' | 'identity_change'
  label: string
  a: string
  b: string
}

const cases: Case[] = [
  // Same identity, trivial edit (appended clause): must sit at the bottom.
  {
    band: 'minor_edit',
    label: 'en-append-clause',
    a: 'I am Dr. Lin, a quantum physicist who values rigor and evidence.',
    b: 'I am Dr. Lin, a quantum physicist who values rigor and evidence, and loves teaching.',
  },
  {
    band: 'minor_edit',
    label: 'zh-append-clause',
    a: '我是林医生，量子物理学家，重视严谨与证据。',
    b: '我是林医生，量子物理学家，重视严谨与证据，并且热爱教学。',
  },
  {
    band: 'minor_edit',
    label: 'en-reorder',
    a: 'Values: rigor, honesty, curiosity. Style: precise and calm.',
    b: 'Values: rigor, curiosity, honesty. Style: calm and precise.',
  },

  // Same identity, genuinely different wording: the band the metric cannot
  // tell apart from a real change, which is why the threshold sits above it.
  {
    band: 'paraphrase',
    label: 'en-reword',
    a: 'I am Dr. Lin, a quantum physicist who values rigor and evidence.',
    b: 'I am Dr. Lin — a physicist in quantum theory, prizing rigor, evidence and careful reasoning.',
  },
  {
    band: 'paraphrase',
    label: 'zh-reword',
    a: '我重视严谨与证据。',
    b: '我看重事实和推理。',
  },
  {
    band: 'paraphrase',
    label: 'en-tone-shift',
    a: 'I speak calmly and always cite the source before making a claim.',
    b: 'My habit is to name my sources first, then state a conclusion in a measured tone.',
  },
  {
    band: 'paraphrase',
    label: 'zh-role-elaboration',
    a: '我是马库斯，斯多葛派哲学教师，强调美德与自控。',
    b: '我叫马库斯，教斯多葛哲学；我相信德性是唯一真正的善，并且只专注于自己能掌控的事物。',
  },

  // A different character altogether: must sit above the threshold.
  {
    band: 'identity_change',
    label: 'en-pc-to-assistant',
    a: 'I am Dr. Lin, a quantum physicist who values rigor and evidence.',
    b: 'I am an AI assistant, always at your service, happy to help with any task.',
  },
  {
    band: 'identity_change',
    label: 'en-physicist-to-teacher',
    a: 'I am Dr. Lin, a quantum physicist who values rigor and evidence.',
    b: 'I am Marcus, a Stoic philosophy teacher who values virtue and acceptance.',
  },
  {
    band: 'identity_change',
    label: 'zh-doctor-to-assistant',
    a: '我是林医生，量子物理学家，重视严谨与证据。',
    b: '我是一个 AI 助手，随时为您服务。',
  },
  {
    band: 'identity_change',
    label: 'zh-stoic-to-chef',
    a: '我是马库斯，斯多葛派哲学教师，强调美德与自控。',
    b: '我是陈师傅，川菜厨师，讲究火候与刀工。',
  },
]

const rows = cases.map(c => ({
  band: c.band,
  label: c.label,
  distance: Number(normalizedTextDistance(c.a, c.b).toFixed(4)),
}))

const bandMax = (band: Case['band']) =>
  Math.max(...rows.filter(r => r.band === band).map(r => r.distance))
const bandMin = (band: Case['band']) =>
  Math.min(...rows.filter(r => r.band === band).map(r => r.distance))

const minorMax = bandMax('minor_edit')
const paraphraseMax = bandMax('paraphrase')
const identityMin = bandMin('identity_change')

// A threshold is only meaningful if the same-identity band ends below the
// different-identity band. Report the measured gap and whether it is usable
// rather than picking a midpoint that the data does not support.
const gap = Number((identityMin - paraphraseMax).toFixed(4))
const separable = gap > 0

const report = {
  metric: 'order-sensitive normalized token edit distance (normalizedTextDistance)',
  tokenizer: 'Intl.Segmenter word granularity, CJK-aware',
  cases: rows,
  bands: {
    minor_edit: { max: minorMax },
    paraphrase: { max: paraphraseMax },
    identity_change: { min: identityMin },
  },
  separation: {
    paraphrase_to_identity_gap: gap,
    separable,
  },
  usage: {
    fpCountsAsDrift: false,
    diagnostic_fpThreshold: 0.95,
    rationale: separable
      ? 'Bands are separate; a threshold inside the gap is usable.'
      : 'Bands overlap, so no threshold separates them. The fixed-point component is reported as a diagnostic only (fpCountsAsDrift defaults to false) and the drift verdict rests on the judge rubric (W1) and its bimodality.',
  },
  note: [
    'Hand-written pairs only. This fixes the operating point of a surface-distance metric and says nothing',
    'about semantic identity; a deployment should recalibrate on its own model and language.',
  ].join(' '),
}

console.log(JSON.stringify(report, null, 2))
