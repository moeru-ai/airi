// cspell:words descrip
import type { Element } from 'xast'

import type { Concept, Term } from './schema'

import process from 'node:process'

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { toXml } from 'xast-util-to-xml'
import { x } from 'xastscript'
import { parse } from 'yaml'

import { parseGlossary } from './schema'

/**
 * The XML namespace of ISO 30042:2019, which the tooling calls TBX version 3. The `ed-2`
 * segment is the second edition of the ISO standard, not the second version of TBX.
 */
const TBX_NAMESPACE = 'urn:iso:std:iso:30042:ed-2'

/** The source language of the glossary. Crowdin owns every other language. */
const SOURCE_LANGUAGE = 'en'

/**
 * The two schemas that Crowdin names in the exports it produces.
 *
 * They are processing instructions rather than elements, so an XML editor can validate the
 * file. Writing the same pair keeps a diff against a re-download small.
 */
const XML_MODELS = [
  '<?xml-model href="https://raw.githubusercontent.com/LTAC-Global/TBX-Basic_dialect/master/DCA/TBXcoreStructV03_TBX-Basic_integrated.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>',
  '<?xml-model href="https://raw.githubusercontent.com/LTAC-Global/TBX-Basic_dialect/master/DCA/TBX-Basic_DCA.sch" type="application/xml" schematypens="http://purl.oclc.org/dsdl/schematron"?>',
]

/**
 * How Crowdin writes an acceptability rating.
 *
 * NOTICE:
 * The suffixed forms come from ISO 12620, and a Crowdin export writes them literally. Only
 * `preferredTerm-admn-sts` is confirmed by the export we have, because every term in it is
 * preferred. The other two follow the same pattern, and the first import should confirm
 * them.
 */
const ADMINISTRATIVE_STATUS: Record<Term['status'], string> = {
  preferred: 'preferredTerm-admn-sts',
  admitted: 'admittedTerm-admn-sts',
  deprecated: 'deprecatedTerm-admn-sts',
}

/**
 * Turns the text of a YAML folded block into paragraphs.
 *
 * A folded block (`>`) joins each wrapped line with a space and turns a blank line into one
 * newline character. So a newline that survives parsing is always a paragraph break, and
 * the line width of the source file never reaches the output.
 *
 * NOTICE:
 * Splitting on two or more newlines looks correct and is wrong. YAML gives a blank line a
 * single newline, so that pattern matches nothing and every paragraph merges into one.
 *
 * Before:
 * - "One paragraph.\nA second paragraph."
 *
 * After:
 * - "One paragraph.\n\nA second paragraph."
 */
function collapse(text: string): string {
  return text.split(/\n+/).map(paragraph => paragraph.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n')
}

/**
 * Builds one `conceptEntry` element.
 *
 * TBX-Basic fixes the order inside each section, and the order below is not cosmetic:
 *
 *   - inside `conceptEntry`, every `langSec` comes after the other children,
 *   - inside `langSec`, every `termSec` comes after the other children,
 *   - inside `termSec`, `term` comes first, then the `termNote` elements, then the rest.
 *
 */
function buildConceptEntry(concept: Concept): Element {
  const conceptChildren: Element[] = [
    // Crowdin's own export writes the flag first, as a concept-level descrip with the value
    // "yes" or "no". This is a Crowdin extension: TBX-Basic has no such data category.
    x('descrip', { type: 'translatable' }, concept.translatable ? 'yes' : 'no'),
    x('descrip', { type: 'subjectField' }, concept.subject),
    x('descrip', { type: 'definition' }, collapse(concept.definition)),
  ]

  if (concept.note)
    conceptChildren.push(x('note', collapse(concept.note)))

  if (concept.url)
    conceptChildren.push(x('xref', { type: 'externalCrossReference', target: concept.url }, concept.url))

  const termSections = concept.terms.map((term) => {
    const termChildren: Element[] = [
      x('term', term.text),
      x('termNote', { type: 'partOfSpeech' }, term['part-of-speech']),
      x('termNote', { type: 'administrativeStatus' }, ADMINISTRATIVE_STATUS[term.status]),
    ]

    if (term.type)
      termChildren.push(x('termNote', { type: 'termType' }, term.type))

    if (term.gender)
      termChildren.push(x('termNote', { type: 'grammaticalGender' }, term.gender))

    // TBX-Basic fixes the order inside a termSec: term, then every termNote, then the rest.
    if (term.context)
      termChildren.push(x('descrip', { type: 'context' }, term.context))

    if (term.note)
      termChildren.push(x('note', collapse(term.note)))

    return x('termSec', termChildren)
  })

  conceptChildren.push(x('langSec', { 'xml:lang': SOURCE_LANGUAGE }, termSections))

  return x('conceptEntry', { id: concept.id }, conceptChildren)
}

/**
 * Renders the glossary as a TBX-Basic document.
 *
 * The result is a complete XML document with the declaration, so a caller writes it to disk
 * unchanged. It carries the English terms only; Crowdin owns every other language, and
 * uploading target terms would overwrite the work of a translator.
 *
 * @param concepts Validated concepts, in the order they appear in `terms.yaml`.
 * @param source A description of where the data came from, recorded in the TBX header.
 */
export function buildTbx(concepts: Concept[], source: string): string {
  const tree = x(
    'tbx',
    // The root carries all four attributes that TBX-Basic requires. `style="dca"` selects
    // the data-category-as-attribute style, which is the one the schema values assume.
    { 'type': 'TBX-Basic', 'style': 'dca', 'xml:lang': SOURCE_LANGUAGE, 'xmlns': TBX_NAMESPACE },
    [
      // The header carries a sourceDesc and nothing else, which is the shape Crowdin writes.
      x('tbxHeader', [x('fileDesc', [x('sourceDesc', [x('p', source)])])]),
      x('text', [x('body', concepts.map(buildConceptEntry))]),
    ],
  )

  indent(tree, 0)

  return ['<?xml version="1.0" encoding="UTF-8"?>', ...XML_MODELS, toXml(tree), ''].join('\n')
}

/**
 * Adds whitespace between the children of an element, in place.
 *
 * Crowdin writes its exports with four-space indentation, and the serializer produces one
 * long line. Matching the layout keeps a diff against a re-download readable.
 *
 * An element whose children include text is left alone, because whitespace inside a
 * definition or a note is content, not layout.
 */
function indent(node: Element, depth: number): void {
  const children = node.children.filter(child => child.type === 'element')
  if (children.length !== node.children.length || children.length === 0)
    return

  const inner = `\n${'    '.repeat(depth + 1)}`
  const outer = `\n${'    '.repeat(depth)}`

  for (const child of children)
    indent(child, depth + 1)

  node.children = [
    ...children.flatMap(child => [{ type: 'text' as const, value: inner }, child]),
    { type: 'text' as const, value: outer },
  ]
}

/**
 * Reads `terms.yaml`, validates it, and writes the TBX file.
 *
 * Call stack:
 *
 * main
 *   -> {@link parseGlossary}
 *   -> {@link buildTbx}
 *     -> buildConceptEntry
 *       -> composeNote
 */
async function main(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url))
  const input = join(here, 'terms.yaml')
  const output = process.argv[2] ?? join(here, 'glossary.tbx')

  const concepts = parseGlossary(parse(await readFile(input, 'utf8')))
  await writeFile(output, buildTbx(concepts, 'packages/i18n/glossary/terms.yaml'), 'utf8')

  const terms = concepts.reduce((total, concept) => total + concept.terms.length, 0)
  process.stdout.write(`wrote ${output}: ${concepts.length} concepts, ${terms} terms\n`)
}

// Only run when this file is the entry point, so that the test can import buildTbx without
// writing a file.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  })
}
