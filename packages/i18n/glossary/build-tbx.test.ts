import type { Concept } from './schema'

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { buildTbx } from './build-tbx'
import { parseGlossary } from './schema'

const here = dirname(fileURLToPath(import.meta.url))

function concept(overrides: Partial<Concept> = {}): Concept {
  return {
    id: 'stage',
    subject: 'application',
    translatable: true,
    definition: 'The surface of the application that shows the character.',
    terms: [{ 'text': 'Stage', 'part-of-speech': 'noun', 'status': 'preferred' }],
    ...overrides,
  }
}

describe('buildTbx', () => {
  it('writes the document shape that a Crowdin export uses', () => {
    const xml = buildTbx([concept()], 'test')

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(xml).toContain('TBXcoreStructV03_TBX-Basic_integrated.rng')
    expect(xml).toContain('TBX-Basic_DCA.sch')
    expect(xml).toContain('xmlns="urn:iso:std:iso:30042:ed-2"')
    expect(xml).toContain('type="TBX-Basic"')
    expect(xml).toContain('style="dca"')
    expect(xml).toContain('<p>test</p>')
    expect(xml).toContain('<conceptEntry id="stage">')
    expect(xml).toContain('<langSec xml:lang="en">')
    // Crowdin's header carries a sourceDesc and nothing else.
    expect(xml).not.toContain('<titleStmt>')
  })

  it('indents the elements the way a Crowdin export does', () => {
    const xml = buildTbx([concept()], 'test')

    expect(xml).toContain('\n    <tbxHeader>')
    expect(xml).toContain('\n            <conceptEntry id="stage">')
    // Whitespace inside a definition is content, so it must not gain indentation.
    expect(xml).toContain('<descrip type="definition">The surface of the application that shows the character.</descrip>')
  })

  it('puts langSec after the concept-level children', () => {
    const xml = buildTbx([concept()], 'test')

    // TBX-Basic fixes this order. A langSec before a descrip is invalid, and a schema
    // validator rejects the file rather than importing it partly.
    expect(xml.indexOf('subjectField')).toBeLessThan(xml.indexOf('<langSec'))
    expect(xml.indexOf('type="definition"')).toBeLessThan(xml.indexOf('<langSec'))
  })

  it('puts term before the termNote elements', () => {
    const xml = buildTbx([concept()], 'test')

    expect(xml.indexOf('<term>')).toBeLessThan(xml.indexOf('partOfSpeech'))
    expect(xml.indexOf('partOfSpeech')).toBeLessThan(xml.indexOf('administrativeStatus'))
  })

  it('writes the translatable flag that Crowdin reads', () => {
    // A Crowdin export carries the flag as a concept-level descrip, ahead of everything
    // else. TBX-Basic has no such data category, so this is a Crowdin extension.
    expect(buildTbx([concept({ translatable: false })], 'test'))
      .toContain('<descrip type="translatable">no</descrip>')
    expect(buildTbx([concept({ translatable: true })], 'test'))
      .toContain('<descrip type="translatable">yes</descrip>')
  })

  it('puts the translatable flag before the other concept children', () => {
    const xml = buildTbx([concept()], 'test')

    expect(xml.indexOf('type="translatable"')).toBeLessThan(xml.indexOf('type="subjectField"'))
  })

  it('writes the context of each term that has one', () => {
    const xml = buildTbx([concept({
      terms: [
        { 'text': 'Stage', 'part-of-speech': 'noun', 'status': 'preferred', 'context': 'Disable Stage Transitions' },
        { 'text': 'Scene', 'part-of-speech': 'noun', 'status': 'deprecated', 'type': 'variant' },
      ],
    })], 'test')

    // TBX-Basic allows a context at term level only, so it belongs to the term whose
    // sentence it is rather than to the concept.
    expect(xml).toContain('<descrip type="context">Disable Stage Transitions</descrip>')
    expect(xml.match(/type="context"/g)).toHaveLength(1)
  })

  it('puts the context and the note after the termNote elements', () => {
    const xml = buildTbx([concept({
      terms: [{ 'text': 'Stage', 'part-of-speech': 'noun', 'status': 'preferred', 'context': 'A sentence', 'note': 'A note' }],
    })], 'test')

    expect(xml.indexOf('administrativeStatus')).toBeLessThan(xml.indexOf('type="context"'))
    expect(xml.indexOf('type="context"')).toBeLessThan(xml.indexOf('<note>A note</note>'))
  })

  it('maps each status to the suffixed value that Crowdin writes', () => {
    const xml = buildTbx([concept({
      terms: [
        { 'text': 'Character Card', 'part-of-speech': 'noun', 'status': 'preferred' },
        { 'text': 'Card', 'part-of-speech': 'noun', 'status': 'admitted', 'type': 'shortForm' },
        { 'text': 'Deck', 'part-of-speech': 'noun', 'status': 'deprecated', 'gender': 'feminine' },
      ],
    })], 'test')

    expect(xml).toContain('<termNote type="administrativeStatus">preferredTerm-admn-sts</termNote>')
    expect(xml).toContain('<termNote type="administrativeStatus">admittedTerm-admn-sts</termNote>')
    expect(xml).toContain('<termNote type="administrativeStatus">deprecatedTerm-admn-sts</termNote>')
    expect(xml).toContain('<termNote type="termType">shortForm</termNote>')
    expect(xml).toContain('<termNote type="grammaticalGender">feminine</termNote>')
  })

  it('escapes the characters that would otherwise break the XML', () => {
    const xml = buildTbx([concept({ definition: 'A tag <b> & an "attribute".' })], 'test')

    expect(xml).toContain('&#x3C;b>')
    expect(xml).toContain('&#x26;')
    expect(xml).not.toContain('<b>')
  })

  it('collapses the wrapping of a YAML folded block but keeps the paragraphs', () => {
    const note = parse('note: >\n  One\n  line.\n\n  A second\n  paragraph.\n').note as string
    const xml = buildTbx([concept({ note })], 'test')

    expect(note).toBe('One line.\nA second paragraph.\n')
    expect(xml).toContain('One line.\n\nA second paragraph.')
  })
})

describe('parseGlossary', () => {
  it('rejects two concepts that share an id', () => {
    expect(() => parseGlossary([concept(), concept()])).toThrow(/unique/)
  })

  it('allows more than one preferred term, as Crowdin does', () => {
    // The export from project 816610 gives both `AIRI` and `Project AIRI` the preferred
    // status inside one concept, so nothing here may forbid it.
    const twoPreferred = concept({
      terms: [
        { 'text': 'AIRI', 'part-of-speech': 'proper noun', 'status': 'preferred' },
        { 'text': 'Project AIRI', 'part-of-speech': 'proper noun', 'status': 'preferred' },
      ],
    })

    expect(parseGlossary([twoPreferred])).toHaveLength(1)
  })

  it('accepts the spelling of proper noun that Crowdin writes', () => {
    // ROOT CAUSE:
    //
    // An earlier version required `properNoun`, which is what the TBX-Basic specification
    // says, and rejected "proper noun" with a space. A glossary exported from project 816610
    // writes the spaced form on every proper noun, so the requirement was backwards: it
    // would have rejected the data Crowdin itself produces.
    const spaced = concept({ terms: [{ 'text': 'AIRI', 'part-of-speech': 'proper noun', 'status': 'preferred' }] })

    expect(parseGlossary([spaced])).toHaveLength(1)
    expect(() => parseGlossary([concept({ terms: [{ 'text': 'AIRI', 'part-of-speech': 'properNoun', 'status': 'preferred' }] })])).toThrow()
  })

  it('rejects an id that is not kebab case', () => {
    expect(() => parseGlossary([concept({ id: 'Stage Profile' })])).toThrow(/kebab/)
  })
})

describe('terms.yaml', () => {
  async function loadConcepts(): Promise<Concept[]> {
    return parseGlossary(parse(await readFile(join(here, 'terms.yaml'), 'utf8')))
  }

  /** Every scalar leaf of the English locale, which is what a user reads. */
  async function loadEnglishStrings(): Promise<string[]> {
    const root = join(here, '..', 'src', 'locales', 'en')
    const found: string[] = []

    function walk(node: unknown): void {
      if (typeof node === 'string')
        found.push(node)
      else if (Array.isArray(node))
        node.forEach(walk)
      else if (node && typeof node === 'object')
        Object.values(node).forEach(walk)
    }

    async function read(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory())
          await read(path)
        else if (entry.name.endsWith('.yaml'))
          walk(parse(await readFile(path, 'utf8')))
      }
    }

    await read(root)
    return found
  }

  it('validates against the schema', async () => {
    const concepts = await loadConcepts()

    expect(concepts.length).toBeGreaterThan(0)
  })

  it('produces TBX for every concept', async () => {
    const concepts = await loadConcepts()
    const xml = buildTbx(concepts, 'test')

    expect(xml.match(/<conceptEntry /g)).toHaveLength(concepts.length)
  })

  it('holds no term that neither the interface nor the English documentation uses', async () => {
    const concepts = await loadConcepts()

    // The glossary shares one Crowdin container with the documentation terminology, so a
    // term may live in prose rather than in a string. `Project AIRI` appears six times in
    // README.md and in no interface string, and `Neuro Sama` only under docs/content/en.
    //
    // The check still has teeth. A term that appears in none of these places can never match
    // in the editor, so it cannot help a translator. `Ayaka Neko` was such a term, and it is
    // the reason this check runs over the documentation rather than being deleted.
    const repository = join(here, '..', '..', '..')
    const prose = [await readFile(join(repository, 'README.md'), 'utf8')]

    async function readDocs(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory())
          await readDocs(path)
        else if (entry.name.endsWith('.md'))
          prose.push(await readFile(path, 'utf8'))
      }
    }
    await readDocs(join(repository, 'docs', 'content', 'en'))

    const haystack = [...await loadEnglishStrings(), ...prose].join('\n').toLowerCase()

    // The `documentation` concepts were adopted from the Crowdin glossary, and Crowdin is
    // where they are maintained. Repository text is not their source, so checking them
    // against it would delete data this file exists to preserve. `Ayaka Neko` is one: the
    // reversed name order, which no file here writes.
    const missing = concepts
      .filter(c => c.subject !== 'documentation')
      .flatMap(c => c.terms.filter(t => !haystack.includes(t.text.toLowerCase())).map(t => t.text))

    expect(missing).toEqual([])
  })

  it('gives every context the term it belongs to', async () => {
    const concepts = await loadConcepts()

    // A context shows the term in use. Usually it is a real interface string, but for the
    // two codenames it cannot be: every interface string containing them is one this
    // glossary rules against. So the check is not "does the locale contain it" but "does it
    // mention its own term", which catches a sentence pasted onto the wrong entry.
    const unrelated = concepts.flatMap(c => c.terms
      .filter(t => t.context && !t.context.toLowerCase().includes(t.text.toLowerCase()))
      .map(t => `${c.id} / ${t.text}`))

    expect(unrelated).toEqual([])
  })

  it('holds no control token from the system prompt', async () => {
    const concepts = await loadConcepts()

    // base.yaml carries the streaming control tokens to the translators. Those are code.
    // A translated token breaks stage playback with no error message, so a token must never
    // reach the glossary and become a term a translator is invited to work on.
    const code = concepts.flatMap(c => c.terms
      .filter(t => ['ACT', 'DELAY', 'CALL'].includes(t.text) || /[/{}<>]/.test(t.text))
      .map(t => t.text))

    expect(code).toEqual([])
  })
})
