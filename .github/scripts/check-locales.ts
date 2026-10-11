import process from 'node:process'

import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseDocument } from 'yaml'

/** The locale that owns every key. Crowdin translates it into the other locales. */
const SOURCE_LOCALE = 'en'

/**
 * A problem in one translated string.
 *
 * An `error` fails the check. A `warning` asks a reviewer to look, because the heuristic
 * behind it can also match a correct translation.
 */
export interface LocaleIssue {
  level: 'error' | 'warning'
  locale: string
  /** Path of the YAML file inside the locale directory, such as `settings.yaml`. */
  file: string
  /** Dotted key path inside the file. Empty when the whole file is affected. */
  key: string
  message: string
}

/** One locale: YAML file path -> dotted key -> string value. */
type LocaleStrings = Map<string, Map<string, string>>

/**
 * vue-i18n interpolation that a translation must keep: named `{name}`, list `{0}`, and linked
 * `@:key` messages. A literal such as `{'@'}` is text, so it is not matched.
 */
const PLACEHOLDER = /\{\s*([a-z_][\w-]*|\d+)\s*\}|@(?:\.\w+)?:[\w.-]+/gi

/**
 * The in-message selector vue-i18n reads to pick one form of a message that holds a choice
 * separator. A call site can pass a number instead, which no locale file shows.
 */
const PLURAL_SELECTOR = /\{\s*(?:count|n)\s*\}/

/**
 * A literal span, which vue-i18n renders as text.
 *
 * The compiler reads the body up to the first quote it does not escape, and it
 * accepts `\\`, `\'`, and the two unicode escapes. It reads spaces around the
 * body as well, so `{ '{count}' }` is a literal too.
 */
const LITERAL = /\{\s*'(?:\\[\s\S]|''|[^'\\])*'\s*\}/g

/**
 * Warns about a choice separator that the message itself cannot select.
 *
 * vue-i18n splits a message on \`|\` and picks a form with a selector. A message that holds a
 * separator and no \`{count}\` leaves the choice to its call site, and a call such as
 * \`t(key, 2)\` makes one with a number. This check reads locale files alone, so it reports a
 * warning rather than a fault. \`Anthropic | Claude\` reached a provider card as \`Anthropic\`,
 * because no call site passed a number.
 *
 * @returns A warning for the separator, or \`undefined\` when the message holds none.
 */
function choiceSeparatorWarning(value: string): string | undefined {
  // A literal is text, and the text of one can hold a selector. Removing the spans
  // leaves the separators and the selectors the message itself reads.
  const text = value.replace(LITERAL, '')
  if (!text.includes('|') || PLURAL_SELECTOR.test(text))
    return undefined

  return "A choice separator renders its first form unless a {count} or a number at the call site selects another. Write a literal pipe as {'|'}."
}


function flatten(value: unknown, prefix: string, into: Map<string, string>) {
  if (typeof value === 'string') {
    into.set(prefix, value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, into))
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value))
      flatten(child, prefix ? `${prefix}.${key}` : key, into)
  }
}

async function yamlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map(entry => relative(directory, join(entry.parentPath, entry.name)))
    .sort()
}

/**
 * Reads every YAML file of one locale. A file that does not parse, for example because of a
 * duplicate key, becomes an error and is left out of the result.
 */
async function loadLocale(root: string, locale: string, issues: LocaleIssue[]): Promise<LocaleStrings> {
  const strings: LocaleStrings = new Map()
  const directory = join(root, locale)
  for (const file of await yamlFiles(directory)) {
    // parseDocument collects syntax errors, including duplicate keys, instead of throwing.
    const document = parseDocument(await readFile(join(directory, file), 'utf8'))
    const [error] = document.errors
    if (error) {
      issues.push({ level: 'error', locale, file, key: '', message: `The file does not parse: ${error.message.split('\n')[0]}` })
      continue
    }
    const values = new Map<string, string>()
    flatten(document.toJS(), '', values)
    strings.set(file, values)
  }
  return strings
}

/**
 * Lists the placeholders of a message in sorted order.
 *
 * Use when:
 * - A tool compares a translation with its English source, for example the enforce-rules-for-i18n skill.
 */
export function placeholders(text: string) {
  return [...text.matchAll(PLACEHOLDER)].map(match => match[0].replace(/\s+/g, '')).sort()
}

function words(text: string) {
  return new Set(text.toLowerCase().match(/[a-z]{3,}/g) ?? [])
}

function shareWords(a: string, b: string) {
  const left = words(a)
  return [...words(b)].some(word => left.has(word))
}

/**
 * Finds the strings that a translation batch put on the wrong key.
 *
 * Crowdin can attach a batch of translations to the wrong run of strings. The moved text
 * then repeats the translation of the key it came from, while the English of the two keys
 * has nothing in common. Only strings that changed against the base are checked, so a
 * repeated word that was already accepted does not come back on every sync.
 */
function findMovedTranslations(
  locale: string,
  source: LocaleStrings,
  target: LocaleStrings,
  base: LocaleStrings | undefined,
): LocaleIssue[] {
  const issues: LocaleIssue[] = []
  const owners = new Map<string, Array<{ file: string, key: string }>>()
  for (const [file, values] of target) {
    for (const [key, value] of values)
      owners.set(value.trim(), [...(owners.get(value.trim()) ?? []), { file, key }])
  }

  for (const [file, values] of target) {
    for (const [key, value] of values) {
      const english = source.get(file)?.get(key)
      const text = value.trim()
      if (!english || text.length < 2 || text === english.trim() || base?.get(file)?.get(key) === value)
        continue

      const unrelated = (owners.get(text) ?? []).find((other) => {
        const otherEnglish = source.get(other.file)?.get(other.key)
        return (other.file !== file || other.key !== key)
          && otherEnglish !== undefined
          && words(english).size > 0
          && words(otherEnglish).size > 0
          && !shareWords(english, otherEnglish)
      })
      if (unrelated) {
        issues.push({
          level: 'warning',
          locale,
          file,
          key,
          message: `Same translation as ${unrelated.file}:${unrelated.key}, whose English has no word in common. The translation can be on the wrong key.`,
        })
      }
    }
  }
  return issues
}

/**
 * Checks the translated locales against the source locale.
 *
 * - Error: a file does not parse.
 * - Error: a key does not exist in the source locale.
 * - Error: a translation does not keep the placeholders of its source string.
 * - Warning: a message holds a choice separator that its own placeholders cannot select.
 * - Error: a translation disappears although its English did not change.
 * - Warning: a changed translation repeats the translation of an unrelated key.
 *
 * `baseRoot` is the same locales directory before the change. With it, a key or placeholder
 * problem that the base already has is a warning, and the removal and moved-translation
 * checks run.
 *
 * A key that exists only in the source locale is not an issue. The applications fall back to
 * English for it.
 */
export async function checkLocales(options: {
  root: string
  baseRoot?: string
  /**
   * Level of a key or placeholder problem that comes only from an English change: the
   * translation is the same as on the base, but its English gained a placeholder or lost
   * the key. A pull request that edits English uses `warning`, because Crowdin owns the
   * other locales and the next sync clears the outdated translation. The sync uses `error`.
   *
   * @default 'error'
   */
  sourceChanges?: 'error' | 'warning'
}): Promise<LocaleIssue[]> {
  const issues: LocaleIssue[] = []
  const source = await loadLocale(options.root, SOURCE_LOCALE, issues)
  const baseSource = options.baseRoot ? await loadLocale(options.baseRoot, SOURCE_LOCALE, []) : new Map()

  // The source locale owns the strings, so a separator mistake can live here too.
  for (const [file, values] of source) {
    for (const [key, value] of values) {
      const warning = choiceSeparatorWarning(value)
      if (warning)
        issues.push({ level: 'warning', locale: SOURCE_LOCALE, file, key, message: warning })
    }
  }
  const entries = await readdir(options.root, { withFileTypes: true })
  const locales = entries.filter(entry => entry.isDirectory() && entry.name !== SOURCE_LOCALE).map(entry => entry.name).sort()

  for (const locale of locales) {
    const target = await loadLocale(options.root, locale, issues)
    const baseDirectory = options.baseRoot && join(options.baseRoot, locale)
    const base = baseDirectory && existsSync(baseDirectory) ? await loadLocale(options.baseRoot!, locale, []) : undefined
    const level = (file: string, key: string, value: string): LocaleIssue['level'] => {
      // The translation changed, so the change brought the problem in.
      if (base?.get(file)?.get(key) !== value)
        return 'error'
      // Translation and English are both as on the base: the problem is already there.
      if (baseSource.get(file)?.get(key) === source.get(file)?.get(key))
        return 'warning'
      // Only the English changed: the translation is now outdated.
      return options.sourceChanges ?? 'error'
    }

    for (const [file, values] of target) {
      for (const [key, value] of values) {
        const english = source.get(file)?.get(key)
        if (english === undefined) {
          issues.push({ level: level(file, key, value), locale, file, key, message: `The key does not exist in ${SOURCE_LOCALE}/${file}.` })
          continue
        }
        const warning = choiceSeparatorWarning(value)
        if (warning)
          issues.push({ level: 'warning', locale, file, key, message: warning })

        const expected = placeholders(english)
        const actual = placeholders(value)
        if (expected.join() !== actual.join())
          issues.push({ level: level(file, key, value), locale, file, key, message: `Placeholders differ from ${SOURCE_LOCALE}: expected [${expected.join(', ')}], found [${actual.join(', ')}].` })
      }
    }

    if (options.baseRoot) {
      issues.push(...findRemovedTranslations(locale, source, baseSource, target, base))
      issues.push(...findMovedTranslations(locale, source, target, base))
    }
  }
  return issues
}

/**
 * Finds translations that the change drops although their English source did not change.
 *
 * Only a working translation counts. The export removes these on purpose:
 * - a base value that equals the base English, which is an untranslated placeholder;
 * - a base value whose placeholders differ from its English, which an English change made
 *   outdated and Crowdin cleared.
 * A string whose English changed or was removed can also lose its translation.
 */
function findRemovedTranslations(
  locale: string,
  source: LocaleStrings,
  baseSource: LocaleStrings,
  target: LocaleStrings,
  base: LocaleStrings | undefined,
): LocaleIssue[] {
  const issues: LocaleIssue[] = []
  for (const [file, values] of base ?? []) {
    for (const [key, value] of values) {
      const english = source.get(file)?.get(key)
      const baseEnglish = baseSource.get(file)?.get(key)
      if (english === undefined || english !== baseEnglish || value === baseEnglish || target.get(file)?.has(key))
        continue
      if (placeholders(value).join() !== placeholders(english).join())
        continue
      issues.push({ level: 'error', locale, file, key, message: 'The translation was removed, but its English did not change.' })
    }
  }
  return issues
}

/**
 * Writes one value for a cell of the Markdown summary.
 *
 * A pipe ends a cell, and the messages and the keys can hold one. The warning that
 * explains a choice separator holds one by design, because it shows `{'|'}`.
 *
 * @example
 * markdownCell('Anthropic | Claude')
 * // => 'Anthropic \| Claude'
 */
function markdownCell(value: string) {
  return value.replace(/\|/g, '\\|')
}

function formatSummary(issues: LocaleIssue[]) {
  if (issues.length === 0)
    return 'The locale check found no issues.\n'
  const rows = issues.map(issue => `| ${markdownCell(issue.level)} | ${markdownCell(issue.locale)} | \`${markdownCell(issue.file)}\` | \`${markdownCell(issue.key)}\` | ${markdownCell(issue.message)} |`)
  return [
    `The locale check found ${issues.filter(issue => issue.level === 'error').length} errors and ${issues.filter(issue => issue.level === 'warning').length} warnings.`,
    '',
    '| Level | Locale | File | Key | Problem |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n')
}

/**
 * Command line entry of the locale check. It prints each issue as a GitHub Actions
 * annotation, can write a Markdown summary, and exits with 1 when an error exists.
 *
 * Call stack:
 *
 * main
 *   -> {@link checkLocales}
 *     -> loadLocale (each locale)
 *     -> findMovedTranslations (with `--base`)
 *   -> formatSummary (with `--summary`)
 *
 * Usage: `node .github/scripts/check-locales.ts --root packages/i18n/src/locales [--base <dir>] [--source-changes warning] [--summary <file>]`
 */
async function main(): Promise<void> {
  const argument = (name: string) => {
    const index = process.argv.indexOf(name)
    return index === -1 ? undefined : process.argv[index + 1]
  }
  const root = argument('--root') ?? 'packages/i18n/src/locales'
  const issues = await checkLocales({
    root,
    baseRoot: argument('--base'),
    sourceChanges: argument('--source-changes') === 'warning' ? 'warning' : 'error',
  })

  for (const issue of issues) {
    const location = issue.key ? `${issue.locale}/${issue.file}: ${issue.key}` : `${issue.locale}/${issue.file}`
    // GitHub Actions reads annotation commands from standard output.
    process.stdout.write(`::${issue.level} file=${join(root, issue.locale, issue.file)}::${location}: ${issue.message}\n`)
  }
  const summary = argument('--summary')
  if (summary)
    await writeFile(summary, formatSummary(issues))

  if (issues.some(issue => issue.level === 'error'))
    process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
