import type { CalibrationFile, CalibrationItem } from './types'

import process from 'node:process'

import { glob, readFile, rename, stat, writeFile } from 'node:fs/promises'

import { formulaSpeechCases } from '../../../cases/formula-speech'
import { mathBridgeCases } from '../../../cases/math-bridge'

/**
 * Collects the readings of the judge calibration set, and prints how many labels of a person the judge matches. See the
 * judge calibration section of the eval README.
 *
 * It reads the newest `result.json` of each case from the reports.
 *
 * - Without `--pick`, it keeps the items of `calibration.json` and refreshes only their judge verdicts, so the set
 *   stays the same while the judge prompt changes. Agreement is then measured on the same readings every time.
 * - With `--pick`, or when the file is empty, it picks {@link perLanguage} readings for each language. The picks spread
 *   over the test objects and over the verdicts of the judge. Labeled items always stay.
 *
 * Run: pnpm -F @proj-airi/evals-tts-speech-formula run judge:collect [-- --pick]
 */

const reportsRoot = new URL('../../../../.vieval/reports/', import.meta.url)
const calibrationFile = new URL('./calibration.json', import.meta.url)
/** The test objects that write their own words. `raw` is left out: it only passes the source through. */
const objects = ['rule', 'llm', 'sre'] as const
const verdicts = ['natural', 'mixed', 'spelled'] as const
const perLanguage = 15
const seed = 20261020
/** Cases of the current datasets. Reports keep results of cases that a newer sample dropped, and those are left out. */
const currentCases = new Set([...formulaSpeechCases, ...mathBridgeCases].map(item => item.id))

interface ResultFile {
  id: string
  language: string
  tts: string
  reference: unknown
  spoken: string
  reading?: string
  verdicts?: { reason: string, reading: string }[]
}

/** FNV-1a over the seed and a key, so the pick order is random but repeats with the same seed. */
function order(key: string): number {
  let hash = 2166136261 ^ seed
  for (const char of key) {
    hash ^= char.codePointAt(0)!
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** The key of one spoken text of an item. A label applies to the words that a person read, not to the case. */
function readingKey(item: Pick<CalibrationItem, 'id' | 'spoken'>): string {
  return `${item.id}\u0000${item.spoken}`
}

/**
 * The newest judged reading of each object, case, language, and spoken text, without TTS. A rule change gives a case
 * new words, and the result for the old words stays in older reports.
 */
async function newestReadings(): Promise<{ time: number, item: CalibrationItem }[]> {
  const newest = new Map<string, { time: number, item: CalibrationItem }>()
  for (const object of objects) {
    for await (const path of glob(`${object}/*/tts-speech-formula/attempt-*/run-*/artifacts/*/*/result.json`, { cwd: reportsRoot.pathname })) {
      const file = new URL(path, reportsRoot)
      const result = JSON.parse(await readFile(file, 'utf8')) as ResultFile
      if (!currentCases.has(result.id) || result.tts !== 'none' || result.reading === undefined || typeof result.reference !== 'string' || !result.spoken.trim())
        continue
      const id = `${object}|${result.id}|${result.language}`
      const key = readingKey({ id, spoken: result.spoken })
      const time = (await stat(file)).mtimeMs
      if ((newest.get(key)?.time ?? 0) >= time)
        continue
      newest.set(key, {
        time,
        item: {
          id,
          object,
          caseId: result.id,
          language: result.language,
          reference: result.reference,
          spoken: result.spoken,
          judge: { reading: result.reading, reason: result.verdicts?.[0]?.reason ?? '' },
          label: null,
          note: '',
        },
      })
    }
  }
  return [...newest.values()]
}

/**
 * Picks readings of one language in rounds over each object and each verdict, so a verdict that the judge rarely gives
 * still gets picks. A spoken text that is already picked is skipped, because two objects can say the same words.
 */
function pick(readings: readonly CalibrationItem[]): CalibrationItem[] {
  const buckets = new Map<string, CalibrationItem[]>()
  for (const item of [...readings].sort((left, right) => order(left.id) - order(right.id))) {
    const key = `${item.object}|${item.judge.reading}`
    buckets.set(key, [...(buckets.get(key) ?? []), item])
  }
  const picked: CalibrationItem[] = []
  const spoken = new Set<string>()
  while (picked.length < perLanguage && [...buckets.values()].some(bucket => bucket.length > 0)) {
    for (const verdict of verdicts) {
      for (const object of objects) {
        const item = buckets.get(`${object}|${verdict}`)?.shift()
        if (!item || spoken.has(item.spoken) || picked.length >= perLanguage)
          continue
        spoken.add(item.spoken)
        picked.push(item)
      }
    }
  }
  return picked
}

/**
 * Prints how many labeled readings the judge verdict matches, the measure of the judge. `stale` readings have no
 * newer verdict on their words, so they keep an older verdict.
 */
function reportAgreement(items: readonly CalibrationItem[], stale = 0) {
  const labeled = items.filter(item => item.label !== null)
  const matched = labeled.filter(item => item.label === item.judge.reading).length
  const share = labeled.length ? Math.round(100 * matched / labeled.length) : 0
  process.stdout.write(`the judge matches ${matched} of ${labeled.length} labels (${share}%)\n`)
  if (stale > 0)
    process.stdout.write(`${stale} readings kept an older verdict, because no report judged their words again\n`)
}

/** Written next to the file and renamed over it, so a reader never sees half a file. */
async function write(items: CalibrationItem[]) {
  const partial = new URL('./calibration.json.partial', import.meta.url)
  await writeFile(partial, `${JSON.stringify({ seed, items } satisfies CalibrationFile, null, 2)}\n`)
  await rename(partial, calibrationFile)
}

async function main() {
  const previous = await readFile(calibrationFile, 'utf8').then(text => JSON.parse(text) as CalibrationFile, () => ({ items: [] }))
  const labeled = new Map(previous.items.filter(item => item.label !== null).map(item => [item.id, item]))

  const judged = await newestReadings()
  const readings = judged.map(({ item }) => item)
  if (previous.items.length > 0 && !process.argv.includes('--pick')) {
    // A verdict counts only on the words that the person labeled. A case that reads differently now keeps its verdict.
    const newest = new Map(readings.map(item => [readingKey(item), item]))
    const items = previous.items.map(item => ({ ...item, judge: newest.get(readingKey(item))?.judge ?? item.judge }))
    const stale = previous.items.filter(item => !newest.has(readingKey(item))).length
    await write(items)
    process.stdout.write(`refreshed the judge verdicts of ${items.length - stale} readings, ${labeled.size} labeled\n`)
    reportAgreement(items, stale)
    return
  }

  // A new pick takes the newest words of each case.
  const current = new Map<string, CalibrationItem>()
  for (const { item } of judged.toSorted((left, right) => left.time - right.time))
    current.set(item.id, item)
  const languages = [...new Set(readings.map(item => item.language))].sort()
  const items = languages.flatMap(language => pick([...current.values()].filter(item => item.language === language)))
    // A labeled item keeps its label and note. Its judge verdict is the newest one.
    .map(item => ({ ...item, label: labeled.get(item.id)?.label ?? null, note: labeled.get(item.id)?.note ?? '' }))
  // Labeled items that the new pick left out stay, so collecting again never loses work.
  const kept = new Set(items.map(item => item.id))
  for (const item of labeled.values()) {
    if (!kept.has(item.id))
      items.push(item)
  }

  await write(items)
  process.stdout.write(`collected ${items.length} readings from ${readings.length}, ${labeled.size} labeled\n`)
  reportAgreement(items)
}

void main()
