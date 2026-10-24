import process from 'node:process'

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

import katex from 'katex'

import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm'
import { connect, drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/default-node'
import { sql } from 'drizzle-orm'

import 'katex/contrib/mhchem'

/**
 * Samples MathBridge (https://huggingface.co/datasets/Kyudan/MathBridge, MIT license) into `sample.json`.
 *
 * The dataset is one parquet file of 23 million rows. The script downloads the file at a pinned revision into the
 * ignored `.cache/` folder, checks its SHA-256, and queries it with DuckDB. The same revision and seed always give the
 * same sample. Only a new sample needs the file: the eval reads the committed `sample.json`.
 *
 * - The `uniform` stratum takes {@link uniformCases} gradable formulas in a seeded random order over all rows.
 * - Each topic stratum takes {@link topicCases} formulas with one kind of notation, for example an expectation or a
 *   norm. Uniform rows rarely hold them, so the rules for them would have no cases without these strata.
 * - A formula longer than {@link shortLength} characters gets a `-long` suffix, so a report can tell them apart.
 *
 * Run: pnpm -F @proj-airi/evals-tts-speech-formula run cases:math-bridge
 *
 * Call stack:
 *
 * main
 *   -> download, once per revision, then verify
 *   -> connect (@proj-airi/drizzle-duckdb-wasm), registerFileURL with NODE_FS
 *     -> uniform query and topic query, see {@link gradableRows}
 *       -> sample.json
 */

const dataset = 'Kyudan/MathBridge'
/** The commit of the dataset repository. Change it, and {@link sha256}, to sample a newer release. */
const revision = '353fb2255f6959ad2940865346c38689cfce902a'
/** The SHA-256 of `train.parquet` at {@link revision}, as the `x-linked-etag` header of the LFS file reports it. */
const sha256 = '49f5c87a7086de1130842fc80aab7bb11218bf020bf3b4e937682714a1c68b57'
const fileUrl = `https://huggingface.co/datasets/${dataset}/resolve/${revision}/train.parquet`
const cacheFile = fileURLToPath(new URL(`../../../.cache/mathbridge/train-${revision}.parquet`, import.meta.url))

/** The seed of the sample order. Change it to draw another sample. */
const seed = 20261020
/** Cases of the uniform stratum, so a run costs a known number of listener calls. */
const uniformCases = 120
/** Cases of each topic stratum. */
const topicCases = 12
/**
 * Candidates per case that the query returns. Some candidates use macros of their paper and are dropped, see
 * {@link usesStandardTex}, so the query returns more than it keeps.
 */
const candidateFactor = 4
/** Longer formulas get a `-long` suffix. They are kept up to {@link maxLength}, because real replies have them. */
const shortLength = 80
const maxLength = 200

/**
 * Notation that the uniform rows rarely hold, by stratum name. A formula goes to the first topic that matches.
 * The patterns are RE2, the regular expressions of DuckDB. MathBridge writes a space after each token, so they allow
 * spaces inside braces.
 */
const topics: readonly (readonly [string, string])[] = [
  ['expectation', String.raw`\\mathbb\s*\{\s*E\s*\}|\\mathbb\s+E\b|\\operatorname\s*\{\s*E\s*\}`],
  ['variance', String.raw`\\(operatorname|mathrm)\s*\{\s*(Var|Cov)\s*\}|\\Pr\b|\\mathbb\s*\{\s*P\s*\}`],
  ['norm', String.raw`\\\||\\[lr]?Vert\b`],
  ['distribution', String.raw`\\sim\b`],
  ['calligraphic-call', String.raw`\\mathcal\s*\{\s*[A-Z]\s*\}(\s*_\s*\{[^{}]*\})?(\s*\\left)?\s*\(`],
]

/** One row of `sample.json`. ./index reads the same shape. */
interface MathBridgeRow {
  /** `uniform`, or a topic of {@link topics}. A `-long` suffix marks a formula longer than {@link shortLength}. */
  stratum: string
  offset: number
  contextBefore: string
  equation: string
  contextAfter: string
  spokenEnglish: string
}

/** Downloads the pinned file once. A partial download goes to a temporary name, so a broken run leaves no bad cache. */
async function download(): Promise<void> {
  const exists = await access(cacheFile).then(() => true, () => false)
  if (!exists) {
    process.stdout.write(`downloading ${fileUrl}\n`)
    await mkdir(dirname(cacheFile), { recursive: true })
    const response = await fetch(fileUrl)
    if (!response.ok || !response.body)
      throw new Error(`MathBridge download: ${response.status}`)
    const partial = `${cacheFile}.partial`
    await pipeline(response.body, createWriteStream(partial))
    await rename(partial, cacheFile)
  }

  const hash = createHash('sha256')
  await pipeline(createReadStream(cacheFile), hash)
  const actual = hash.digest('hex')
  if (actual !== sha256)
    throw new Error(`MathBridge file ${cacheFile} has SHA-256 ${actual}, expected ${sha256}. Delete it and run again.`)
}

/**
 * The SQL of the rows that a listener can grade: notation without prose, a size that fits one spoken sentence, and a
 * sentence before it. `priority` is the DuckDB hash of the row index and the seed. Sorting by it gives a random order
 * that does not depend on the order of the file. The catalog pins the DuckDB version, so the same seed repeats it.
 * About 88% of the first 16 million rows hold notation, but under 1% of the rest do: they are single letters, for
 * example `$ A $`. Gradable rows therefore come from the first 16 million rows, and that is the data, not the hash.
 */
function gradableRows() {
  return sql`
    WITH source AS (
      SELECT
        file_row_number AS row_offset,
        trim(regexp_replace(equation, '^\\s*\\$+|\\$+\\s*$', '', 'g')) AS tex,
        equation, context_before, context_after, "spoken_English" AS spoken_english
      FROM read_parquet('mathbridge.parquet', file_row_number = true)
    )
    -- A bound number is a DOUBLE. The cast keeps the INTEGER of a literal seed, so the hash and the order stay the same.
    SELECT *, hash(row_offset, CAST(${seed} AS INTEGER)) AS priority
    FROM source
    WHERE length(tex) BETWEEN 6 AND ${maxLength}
      AND regexp_matches(tex, '[\\\\^_=<>]')
      AND NOT regexp_matches(tex, '\\\\(text|mbox|label|ref|cite)|\\\\mathrm\\{[a-z]{4,}')
      AND length(context_before) > 0`
}

/**
 * True when KaTeX renders the formula, so it uses only standard commands. A formula with a macro that its paper
 * defines, for example `\\bxi` or `\\NN`, cannot be read by anyone without the paper, and a reply never writes it.
 */
function usesStandardTex(tex: string): boolean {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: 'ignore' })
    return true
  }
  catch {
    return false
  }
}

async function main() {
  await download()

  const client = await connect({ bundles: getBundles() })
  // Drizzle binds every value of a `sql` template as a parameter, so the patterns and numbers need no escaping.
  const db = drizzle({ client: Promise.resolve(client) })
  try {
    // NODE_FS reads the file from disk in pieces, so DuckDB never holds the whole gigabyte in WebAssembly memory.
    await client.db.registerFileURL('mathbridge.parquet', cacheFile, DuckDBDataProtocol.NODE_FS, false)

    const topicCase = sql.join(topics.map(([name, pattern]) => sql`WHEN regexp_matches(tex, ${pattern}) THEN ${name}`), sql` `)
    const toRow = (row: Record<string, unknown>, stratum: string): MathBridgeRow => ({
      stratum: String(row.tex).length > shortLength ? `${stratum}-long` : stratum,
      offset: Number(row.row_offset),
      contextBefore: String(row.context_before ?? ''),
      equation: String(row.equation ?? ''),
      contextAfter: String(row.context_after ?? ''),
      spokenEnglish: String(row.spoken_english ?? ''),
    })

    const uniform = await db.execute<Record<string, unknown>>(sql`${gradableRows()} ORDER BY priority LIMIT ${uniformCases * candidateFactor}`)
    const byTopic = await db.execute<Record<string, unknown>>(sql`
      SELECT * FROM (SELECT *, CASE ${topicCase} END AS topic FROM (${gradableRows()}))
      WHERE topic IS NOT NULL
      QUALIFY row_number() OVER (PARTITION BY topic ORDER BY priority) <= ${topicCases * candidateFactor}
      ORDER BY topic, priority`)

    // Candidates come in the seeded order. Each stratum takes the first standard formulas up to its quota. A formula
    // in both strata stays in the uniform one, so the uniform stratum keeps its size.
    const kept = new Set<number>()
    const sample: MathBridgeRow[] = []
    const taken = new Map<string, number>()
    let dropped = 0
    for (const [rows, stratumOf, quota] of [[uniform, () => 'uniform', uniformCases], [byTopic, (row: Record<string, unknown>) => String(row.topic), topicCases]] as const) {
      for (const row of rows as Record<string, unknown>[]) {
        const stratum = stratumOf(row)
        if ((taken.get(stratum) ?? 0) >= quota || kept.has(Number(row.row_offset)))
          continue
        if (!usesStandardTex(String(row.tex))) {
          dropped++
          continue
        }
        kept.add(Number(row.row_offset))
        taken.set(stratum, (taken.get(stratum) ?? 0) + 1)
        sample.push(toRow(row, stratum))
      }
    }

    await writeFile(new URL('./sample.json', import.meta.url), `${JSON.stringify({ source: `https://huggingface.co/datasets/${dataset}`, license: 'MIT', revision, seed, rows: sample }, null, 2)}\n`)
    const counts = Object.entries(Object.groupBy(sample, row => row.stratum)).map(([name, rows]) => `${name} ${rows?.length ?? 0}`)
    process.stdout.write(`kept ${sample.length} rows: ${counts.join(', ')}. Dropped ${dropped} with macros of their paper.\n`)
  }
  finally {
    await client.close()
  }
}

void main()
